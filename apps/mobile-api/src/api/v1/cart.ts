import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import { cartBlockedAnalyticsReason, effectiveChannelOf, entryOfItem, itemOfEntry, planReorder, storedPrices } from '@lezzet/application';
import { CartService, ProductVariantService, serviceDb, UserProfileService, type CartRef, type Db } from '@lezzet/database';
import {
  MeCartAddBodySchema,
  MeCartQtyBodySchema,
  MeCartReorderBodySchema,
  MeCartReorderSchema,
  MeCartTakeOverBodySchema,
  BundleSchema,
  ProductVariantSchema,
  StockSchema,
} from '@lezzet/types';
import type { Cart, Channel, MeCartItemWriteSchema, PreferredLanguage } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import type { V1Env } from './auth';
import { entryOfWrite, localeOf, readCartView, type CartRead } from './cart-view';

/*
  `/me/cart`: sunucu sepetinin mobil kapısı; sepet iki yüzeyde paylaşılır ve görünüm web ile aynı `getCartView` kuralından gelir.
  Gövde fiyat taşımaz, çünkü sepetteki fiyat bağlayıcı değildir; misafirin sepeti cihazda durur ve girişte `/takeover` ile devralınır.
*/

/*
  SÖZLEŞME ŞEMALARI `@lezzet/types`TAN GELİR — evi `contracts/cart-api.schema.ts`, künyeleri ve üç
  kararı (gövde fiyat taşımaz · cevap satırdır · cevap hep güncel liste) orada yazılı. Bu dosya
  taşıma katmanıdır: şema yazmaz, çağırır.
*/

/**
 * Satırın adresi bir çift: varyant + parti (teklif satırı ayrı yaşar), paket satırında `bundleId` (`?kind=bundle`). Yol parçası
 * ve sorgu olarak taşınır, `DELETE` gövdeli olmasın; birleştirme ve silme kuralları servistedir, burada kopyası yoktur.
 */
const LineKeySchema = z.union([
  z.object({ kind: z.literal('variant'), variantId: ProductVariantSchema.shape.id, stockId: StockSchema.shape.id.nullable() }),
  z.object({ kind: z.literal('bundle'), bundleId: BundleSchema.shape.id }),
]);

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — sepetin sahibi ikincisidir. */
interface CustomerEnv {
  /* `channel` ölçümün boyutu (`ANALYTICS §3`: karışık ölçüm yalan söyler) ve BEDAVA geliyor:
     `resolveCustomer` profili zaten okuyor, türetme de tek kapıdan (`effectiveChannelOf`). */
  Variables: V1Env['Variables'] & { customerId: string; locale: PreferredLanguage; channel: Channel };
}

/**
 * `?locale=` yazmadan önce çözülür: dilsiz bir yazma isteği sepeti değiştirip sonra 400 dönmesin. Zorunlu ve varsayılansız.
 */
async function resolveLocale(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);
  c.set('locale', locale.data);
  await next();
}

/**
 * Profil çözümü tek middleware'de; profili olmayan kullanıcı `profile_not_found` alır, çünkü sepet profile FK'lidir.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  c.set('channel', effectiveChannelOf(profile));
  await next();
}

/**
 * Gövde satırlarını sepet kalemine çevirir; fiyat sunucunundur, gövdenin değil. Eşleme ortak kapılardan geçer (`entryOfWrite`,
 * `itemOfEntry`), boş alanları elle yazmak paket satırını bir gün varyant satırına çevirirdi.
 */
function incomingOf(items: readonly z.infer<typeof MeCartItemWriteSchema>[]) {
  return items.map((item) => itemOfEntry(entryOfWrite(item)));
}

/**
 * Satırın adresi yol + sorgudan; geçersizse `invalid_line` (uydurulmuş kimlikle yazma yapılmaz).
 *
 * `?kind=bundle` paket satırını seçer; yokluğu varyanttır — eski istemciler sorguyu hiç göndermeden
 * aynı yoldan geçmeye devam eder.
 */
function readLineKey(c: Context<CustomerEnv>): CartRef | null {
  const lineId = c.req.param('lineId');
  const parsed = LineKeySchema.safeParse(
    c.req.query('kind') === 'bundle'
      ? { kind: 'bundle', bundleId: lineId }
      : { kind: 'variant', variantId: lineId, stockId: c.req.query('stock') ?? null },
  );
  if (!parsed.success) return null;
  return parsed.data.kind === 'bundle'
    ? { bundleId: parsed.data.bundleId }
    : { variantId: parsed.data.variantId, stockId: parsed.data.stockId };
}

export const cart = new Hono<CustomerEnv>();
// Ucuz süzgeç önce: dil sorgudan okunur (DB'siz), kimlik sonra (bir sorgu).
cart.use('*', resolveLocale);
cart.use('*', resolveCustomer);

/**
 * Saklanan sepetten çözülmüş görünüm, beş ucun ortak kuyruğu. Yalnız `.body` tele gider: `source` ve `place` sunucuda kalır
 * ve `ok()` gevşek tipli olduğu için unutulması derlemede yakalanmaz (`cart.test.ts` sınar).
 */
async function viewOf(c: Context<CustomerEnv>, db: Db, stored: Cart): Promise<CartRead> {
  return readCartView(db, c.get('locale'), stored.items.map(entryOfItem), {
    customerId: c.get('customerId'),
    // Zam bildiriminin ÇIPASI: sepette saklanan fiyat bağlayıcı değildir, yalnız "arttı mı"
    // karşılaştırmasının referansıdır (DOMAIN §5). Geçilmezse "fiyat arttı" hiç doğmaz.
    previousPrices: storedPrices(stored.items),
    couponCode: c.req.query('coupon') ?? null,
    postalCode: c.req.query('postalCode'),
    // Gel-al seçimi: adres seçicideki depo kartı; kapı `readCartView`de (izin × gel-al deposu), geçemeyen yok sayılır.
    pickupWarehouseId: c.req.query('pickupWarehouseId'),
  });
}

/** Sepetin görünümü. Hiç sepet açılmamışsa BOŞ sepet döner — `CartService.get` boş sepet kurar. */
cart.get('/', async (c) => {
  const db = serviceDb();
  const stored = await new CartService(db).get(c.get('customerId'));
  return ok(c, (await viewOf(c, db, stored)).body);
});

/**
 * Satır ekleme: aynı adres zaten sepetteyse adet birleşir (kural servisin). Gövde her zaman liste, bir kullanıcı eylemi tek yazma
 * turu olsun, eşzamanlı istekler birbirini ezmesin.
 */
cart.post('/items', async (c) => {
  const body = MeCartAddBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const updated = await new CartService(db).addItems(c.get('customerId'), incomingOf(body.data.items));
  const read = await viewOf(c, db, updated);
  void measureCartWrite(c, db, body.data.items, read);
  return ok(c, read.body);
});

/**
 * Sepet turunun ölçümü: `add_to_cart` istemci beyanıdır, `cart_blocked` her okumada değil sepetin değiştiği anda yazılır.
 * `productId` çözülür, yoksa günlük ürün özeti sepete eklemeyi hiç saymazdı; paket satırında `null` kalır.
 */
async function measureCartWrite(
  c: Context<CustomerEnv>,
  db: Db,
  yazilan: z.infer<typeof MeCartAddBodySchema>['items'],
  read: CartRead,
): Promise<void> {
  const variantIds = yazilan.flatMap((i) => (i.kind === 'variant' ? [i.variantId] : []));
  const urunler = new Map(
    variantIds.length === 0
      ? []
      : (await new ProductVariantService(db).listByIds(variantIds)).map((v) => [v.id, v.productId] as const),
  );

  const ctx = {
    db,
    channel: c.get('channel'),
    customerId: c.get('customerId'),
    place: read.place,
    locale: c.get('locale'),
    country: null,
  };
  for (const item of yazilan) {
    void recordNativeEvent(ctx, {
      type: 'add_to_cart',
      subjectType: item.kind,
      subjectId: item.kind === 'variant' ? item.variantId : item.bundleId,
      productId: item.kind === 'variant' ? (urunler.get(item.variantId) ?? null) : null,
      qty: item.qty,
    });
  }

  const reason = cartBlockedAnalyticsReason(read.source);
  if (reason) void recordNativeEvent(ctx, { type: 'cart_blocked', reason });
}

/** Adet belirleme — sıfır satırı siler (`setQty`in kendi kuralı; `DELETE` ile aynı kapıya çıkar). */
cart.patch('/items/:lineId', async (c) => {
  const key = readLineKey(c);
  if (key === null) return fail(c, 'invalid_line', 400);

  const body = MeCartQtyBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const updated = await new CartService(db).setQty(c.get('customerId'), key, body.data.qty);
  return ok(c, (await viewOf(c, db, updated)).body);
});

/**
 * Satır silme. `PATCH … {qty: 0}` ile AYNI kurala iner (`removeItem` = `setQty(…, 0)`); ikisi de
 * duruyor çünkü "Kaldır" düğmesinin niyeti adet değiştirmek değil, satırı çıkarmaktır — niyeti
 * fiile çeviren uç, istemciyi sıfır yazmak gibi bir kurnazlığa mecbur bırakmaz.
 */
cart.delete('/items/:lineId', async (c) => {
  const key = readLineKey(c);
  if (key === null) return fail(c, 'invalid_line', 400);

  const db = serviceDb();
  const updated = await new CartService(db).removeItem(c.get('customerId'), key);
  return ok(c, (await viewOf(c, db, updated)).body);
});

/**
 * Misafir sepetinin girişte devri: birleştirme `CartService.takeOver`da, web de onu çağırır. Boş liste geçerli bir gövdedir.
 */
cart.post('/takeover', async (c) => {
  const body = MeCartTakeOverBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const updated = await new CartService(db).takeOver(c.get('customerId'), incomingOf(body.data.items));
  return ok(c, (await viewOf(c, db, updated)).body);
});

/**
 * Tekrar sipariş: geçmiş siparişin eklenebilen kalemleri sunucu sepetine yazılır ve plan sepetin yeriyle okunur, ki eklenen satır
 * sepette hemen doğru görünsün. Bulunamayan ile başkasına ait aynı 404'ü alır.
 */
cart.post('/reorder', async (c) => {
  const body = MeCartReorderBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const customerId = c.get('customerId');
  const plan = await planReorder(db, {
    customerId,
    locale: c.get('locale'),
    lookup: { reference: body.data.orderReference },
    viewOf: async (entries) =>
      (
        await readCartView(db, c.get('locale'), entries, {
          customerId,
          couponCode: null,
          postalCode: c.req.query('postalCode'),
          pickupWarehouseId: c.req.query('pickupWarehouseId'),
        })
      ).source,
  });
  if (!plan) return fail(c, 'order_not_found', 404);

  const service = new CartService(db);
  const items = plan.entries.map((entry) => itemOfEntry(entry));
  const updated = items.length === 0 ? await service.get(customerId) : await service.addItems(customerId, items);
  const read = await viewOf(c, db, updated);
  return ok(c, MeCartReorderSchema.parse({ cart: read.body, added: plan.entries.length, skipped: plan.skipped }));
});
