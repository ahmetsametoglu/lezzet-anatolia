import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  cartBlockedAnalyticsReason,
  effectiveChannelOf,
  entryOfItem,
  itemOfEntry,
  storedPrices,
} from '@lezzet/application';
import { CartService, ProductVariantService, serviceDb, UserProfileService, type CartRef, type Db } from '@lezzet/database';
import {
  MeCartAddBodySchema,
  MeCartQtyBodySchema,
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
  `/me/cart` — SUNUCU SEPETİ mobilde. Sepet iki yüzeyde PAYLAŞILIR (kullanıcı kararı 09.08):
  telefonda doldurulan sepet webde açılır. Paylaşımın kabı zaten vardı (`cart` tablosu,
  `customerId` anahtarlı, 07.1); eksik olan mobilin o kaba açılan kapısıydı.

  BEARER'IN ARKASINDA: sepet müşterinin KENDİSİDİR. Misafirin sepeti sunucuda YAŞAMAZ — ne webde
  yaşıyor (satırları tarayıcı taşıyor) ne burada; cihazda durur ve girişte `/takeover` ile devralınır.
  Oturumsuz bir "sepet kimliği" açmak, kimliksiz satırların ömrünü ve sahipliğini yönetmek demekti.

  KURAL BURADA DEĞİL: satır birleştirme ("aynı varyant + parti ikinci kez eklenirse adet toplanır"),
  sıfır adedin satırı silmesi ve devirdeki birleştirme `CartService`in kendi metotlarında
  (`cart.service.ts` künyesi — web sepetiyle TEK kural). Bu dosya taşıma katmanıdır: gövdeyi süzer,
  kimliği çözer, satırları zarfa koyar.

  ── GÖVDE FİYAT TAŞIMAZ (güvenlik kararı) ───────────────────────────────────
  Yazma uçları satırın yalnız ADRESİNİ ve adedini kabul eder — varyant satırında
  `{variantId, qty, stockId}`, paket satırında `{bundleId, qty}` (21.21; paketin varyantı yoktur,
  satılan şey paketin kendisidir — DOMAIN §13). İstemcinin yazabildiği bir tutar,
  siparişin parasını belirleyemez. Sepete yazılan fiyat bu turda 0'dır ve bu bir eksiklik değil,
  web'in devir yolunda ZATEN uyguladığı hüküm (`itemOfEntry` varsayılanı): sepetteki fiyat
  BAĞLAYICI DEĞİLDİR (DOMAIN §5), yalnız "zam oldu mu" karşılaştırmasının çıpasıdır ve o
  karşılaştırma sıfırı "çıpa yok" diye okur (`priceChangeOf`: `!previousCents` → değişim bildirmez).
  Bağlayıcı fiyat checkout başlangıcında çözülür; sepette stok da AYRILMAZ (DOMAIN §4).

  ── CEVAP ÇÖZÜLMÜŞ GÖRÜNÜMDÜR VE HESAP İKİ YÜZEYDE ORTAKTIR ─────────────────
  Beş uç da `MeCartView` döner: ad, fiyat, indirim, yol, tükendi, asgari sepet, ücretsiz kargo
  eşiği. Hiçbiri burada hesaplanmaz — hepsi `getCartView` kuralından gelir (`@lezzet/application`,
  terfi 09.08) ve web sepeti AYNI kapıyı çağırır. Değişmez şu: aynı sepet telefonda ve webde aynı
  tutarı gösterir; iki ayrı yerde hesaplanan bir toplam bir gün iki farklı sayı gösterir ve
  hangisinin tahsil edileceğini söyleyecek bir yer kalmaz. Eşleme ve misafirin ucu `cart-view.ts`te.

  ── CEVAP HER UÇTA GÜNCEL LİSTEDİR ──────────────────────────────────────────
  Adres uçlarının kararı birebir: yazma komşu satırı da oynatabilir (aynı satır iki kez eklenince
  adetler birleşir), tek kaydı dönmek istemciyi ikinci tura mecbur bırakırdı.
*/

/*
  SÖZLEŞME ŞEMALARI `@lezzet/types`TAN GELİR — evi `contracts/cart-api.schema.ts`, künyeleri ve üç
  kararı (gövde fiyat taşımaz · cevap satırdır · cevap hep güncel liste) orada yazılı. Bu dosya
  taşıma katmanıdır: şema yazmaz, çağırır.
*/

/**
 * VARYANT satırının ADRESİ bir çifttir: varyant + parti. Teklif satırı normal satırdan ayrı yaşar
 * (DOMAIN §5), o yüzden `stockId` bir ayrıntı değil adresin parçasıdır — yol parçası + sorgu olarak
 * taşınır (`/items/:variantId?stock=…`). Gövdeye koymak, `DELETE`in gövdeli olmasını gerektirirdi.
 *
 * ── PAKET SATIRI DA BU ADRESLE ANILIR (borç KAPANDI, 20.08) ─────────────────
 * Paketin varyantı YOKTUR; adresi `bundleId`dir ve yol parçası artık ikisini de taşıyor
 * (`/items/:lineId`, paket için `?kind=bundle`). Servis imzası satır anahtarına geçtiği için
 * (`CartRef`) azaltma ve silme paket satırında da çalışıyor.
 *
 * KAPATILMASININ SEBEBİ BİR NOT DEĞİL, ÖLÇÜLMÜŞ ZARARDI (cihazda 20.08): mobil paketi sunucuya
 * yazamadığı için cihazda tutuyordu; sunucu görmediğini toplayamıyor ve müşterinin sepetinde
 * 96,92 € dururken alttaki bar 14,85 €, asgari sepet uyarısı "22,54 € eksik" diyor, sipariş düğmesi
 * kilitli kalıyordu. Web ise paketi sunucuya yazıyor (`cart.replace` → `itemOfEntry`), yani
 * 09.08'in "telefonda doldurulan sepet webde açılır" sözü de yalnız paketlerde tutmuyordu.
 *
 * Buraya bir okuma+yeniden yazma (`CartService.replace` ile) YAZILMADI ve bu bilinçli: "sıfır adet
 * satırı siler" ile "aynı satır ikinci kez eklenince adet birleşir" kuralları servisin kendisinde
 * duruyor (`cart.service.ts` künyesi, web sepetiyle TEK kural) — taşıma katmanında ikinci bir kopya,
 * iki yüzeyin bir gün farklı davranması demekti.
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
 * `?locale=` YAZMADAN ÖNCE çözülür — sıra bilinçli.
 *
 * Cevap artık çözülmüş görünüm, yani her uç dile ihtiyaç duyuyor. Dili uç gövdesinde okusaydık
 * eksik dilli bir `POST /items` isteği sepeti DEĞİŞTİRİP sonra 400 dönerdi: istemci "istek
 * başarısız" diye okur, sepette ise satır durur. Middleware'de süzülünce yazma hiç başlamaz.
 *
 * Zorunlu ve varsayılansız (gerekçe `cart-view.ts` → `localeOf`).
 */
async function resolveLocale(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);
  c.set('locale', locale.data);
  await next();
}

/**
 * Profil çözümü TEK middleware'de (adres/puan uçlarının deseni birebir). Profili olmayan auth
 * kullanıcısı `/me` ailesinin ortak cevabını alır (`profile_not_found`, 404): `cart.customer_id`
 * `user_profiles`a FK'lidir — auth kimliğiyle yazmak sepeti sessizce kaybettirirdi (web'de
 * ölçülmüş arıza, 28.07).
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  c.set('channel', effectiveChannelOf(profile));
  await next();
}

/**
 * Gövdenin satırlarını sepet kalemine çevirir — **fiyat SUNUCUNUNDUR, gövdenin değil** (bu yüzden
 * `unitPrice` verilmez, `itemOfEntry`nin 0 varsayılanı kalır; gerekçe dosya başlığında). Ekleme ile
 * devir aynı eşlemeyi kullanır — iki yerde yazılsaydı biri bir gün ötekinden geride kalırdı.
 *
 * **İKİ ADIM, İKİSİ DE ORTAK KAPI:** gövde → niyet (`entryOfWrite`, sepet ailesinin tek eşlemesi)
 * → saklanan kalem (`itemOfEntry`, `@lezzet/application`). Boş alan burada elle YAZILMAZ: paket
 * satırında `variantId`/`stockId`, varyant satırında `bundleId` null'a düşürmek `itemOfEntry`nin
 * işidir ve o kural web'in yazma yolunda da aynı yerden geliyor. Elle yazılsaydı birleşimin hangi
 * alanı hangi türde taşıdığı bilgisi ikinci bir yere daha dağılırdı (`CartEntry` künyesinin uyardığı
 * tuzak) — türü kimlik alanının VARLIĞINDAN çıkaran bir satır, paket satırını bir gün varyant
 * satırına çevirir.
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
 * SAKLANAN SEPET → ÇÖZÜLMÜŞ GÖRÜNÜM — beş ucun ORTAK kuyruğu.
 *
 * Her uç kendi eşlemesini yazsaydı biri bir gün ötekinden geride kalırdı; özellikle
 * `previousPrices`: geçilmeyen tek uçta zam bildirimi sessizce doğmaz ve müşteri artmış fiyatı
 * uyarısız görür. Yer (`?postalCode=`) ve kupon (`?coupon=`) da her uçta okunur — yazma sonrası
 * dönen görünüm, `GET`in döndüreceğiyle birebir aynı olmalı.
 */
async function viewOf(c: Context<CustomerEnv>, db: Db, stored: Cart): Promise<CartRead> {
  return readCartView(db, c.get('locale'), stored.items.map(entryOfItem), {
    customerId: c.get('customerId'),
    // Zam bildiriminin ÇIPASI: sepette saklanan fiyat bağlayıcı değildir, yalnız "arttı mı"
    // karşılaştırmasının referansıdır (DOMAIN §5). Geçilmezse "fiyat arttı" hiç doğmaz.
    previousPrices: storedPrices(stored.items),
    couponCode: c.req.query('coupon') ?? null,
    postalCode: c.req.query('postalCode'),
  });
}

/** Sepetin görünümü. Hiç sepet açılmamışsa BOŞ sepet döner — `CartService.get` boş sepet kurar. */
cart.get('/', async (c) => {
  const db = serviceDb();
  const stored = await new CartService(db).get(c.get('customerId'));
  return ok(c, (await viewOf(c, db, stored)).body);
});

/**
 * Satır ekleme. Aynı adres (varyant + parti) zaten sepetteyse ADET BİRLEŞİR, ikinci satır açılmaz —
 * kural servisin (`addItems`), burada tekrarlanmaz.
 *
 * **GÖVDE HER ZAMAN LİSTE**, tek ürün bile (09.08): sepet tek satırda yaşıyor ve her ekleme onu
 * okuyup geri yazıyor; eşzamanlı gelen istekler birbirini eziyordu (ölçüldü: eşzamanlı üç ekleme →
 * 1–2 satır). Bir kullanıcı eylemi tek yazma turuna indi. Gerekçe `MeCartAddBodySchema`da.
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
 * SEPET TURUNUN ÖLÇÜMÜ (24.08 · MB-63) — iki olay, tek yer.
 *
 * **`add_to_cart` niyeti İSTEMCİ BEYANIDIR** (`ANALYTICS §3`): sepet ucu bir EŞİTLEME ucudur,
 * "az önce ne oldu" bilgisi yalnız istemcide var. Beyan-edilmiş olay gözlenen olay değildir —
 * sayısı sepet satırlarıyla tutmaz ve bu bir arıza değil.
 *
 * **`cart_blocked` bir DURUM değil bir AN olarak yazılır** (web kapısının aynı kararı): engel her
 * okumada var olabilir, ama burası müşterinin sepetini DEĞİŞTİRDİĞİ an. Her okumada atsaydık aynı
 * engel onlarca kez sayılır ve huninin en kıymetli olayı gürültüye dönerdi.
 *
 * ── `productId` ÇÖZÜLÜYOR, ve bu WEB'DEN BİLİNÇLİ BİR AYRILIK ───────────────
 * Web `productId: null` geçiyor (`lib/cart/actions.ts`) çünkü `AddToCartIntent` ürünü taşımıyor.
 * Ama günlük ürün özeti satırları **gruplamadan ÖNCE** `product_id is not null` ile eliyor
 * (`build_analytics_daily_product`), yani `cart_count` yapısal olarak SIFIR kalıyor — "ilgi sepete
 * dönüşüyor mu" sorusu hiç cevaplanamıyor. Ölçüldü 24.08; web'e not bırakıldı.
 * Native aynı boşluğu tekrarlamıyor: varyantın ürünü TEK okumada çözülüyor (`listByIds`, kimlik
 * başına sorgu yok). PAKET satırında `productId` yine null — paket bir ürün değil, ürünlerin
 * demeti; birine atfetmek ürün özetini yanlış beslerdi (paket detayının aynı kararı).
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
  return ok(c, await viewOf(c, db, updated));
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
  return ok(c, await viewOf(c, db, updated));
});

/**
 * MİSAFİR SEPETİNİN DEVRİ — cihazda biriken satırlar giriş anında müşterinin sepetiyle BİRLEŞİR.
 *
 * Birleştirme mantığı BURADA YAZILMAZ: `CartService.takeOver` tam da bunun için var (07.1) ve
 * web'in giriş yolu da onu çağırıyor — sunucudaki sepet KORUNUR, gelen kalemler üstüne eklenir,
 * çakışan satırda adetler toplanır. İkinci bir birleştirme yazmak, iki yüzeyin girişte farklı
 * davranması demekti.
 *
 * BOŞ LİSTE de geçerli bir gövdedir ve sepeti aynen döndürür: istemcinin "devredilecek bir şey var
 * mı" sorusunu kendi cevaplayıp uca hiç gelmemesi gerekmez, ama geldiğinde de bir şey bozulmaz.
 */
cart.post('/takeover', async (c) => {
  const body = MeCartTakeOverBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const updated = await new CartService(db).takeOver(c.get('customerId'), incomingOf(body.data.items));
  return ok(c, await viewOf(c, db, updated));
});
