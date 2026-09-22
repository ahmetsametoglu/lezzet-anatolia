import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { z } from 'zod';
import {
  checkoutBlockedAnalyticsReason,
  effectiveChannelOf,
  entryOfItem,
  getPackagesByIds,
  placeOrder,
  readCheckoutSnapshot,
  UNRESOLVED_PLACE,
} from '@lezzet/application';
import { CartService, serviceDb, UserProfileService } from '@lezzet/database';
// Yan etki portu ortak dosyada: kurye uçları da aynı nesneyi geçirir.
import { mobileOrderEffects } from '../../lib/order-effects';
import {
  CheckoutOrderBodySchema,
  CheckoutOrderResultSchema,
  CheckoutSnapshotSchema,
  type Channel,
  type PreferredLanguage,
} from '@lezzet/types';
import { readJsonBody } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import { paymentSessionCreator } from '../../lib/stripe';
import type { V1Env } from './auth';
import { localeOf } from './cart-view';

/*
  `/me/checkout` — "SİPARİŞİ TAMAMLA" EKRANININ TEK OKUMASI.

  ── EKRAN SEÇİM YAPAR, SUNUCU KARAR VERİR ───────────────────────────────────
  Ekranın sorusu tek: *"bu adrese nasıl, ne zaman gelir; ne kadar tutar; nasıl ödenebilir?"*
  Cevabı üç kapının BELİRLİ BİR SIRAYLA birleşmesi veriyor (adres → teslimat → sepet → ödeme) ve o
  sıra `@lezzet/application`ın checkout anlık görüntüsünde yaşıyor — web checkout'u da AYNI kapıyı
  çağırıyor. Burada kural yazılmaz; istek girdiye çevrilir, cevap zarfa konur.

  Sıranın kendisi yaşanmış derslerin toplamı ve künyeleri kapının içinde: yer ÇEREZTEN değil SEÇİLEN
  ADRESTEN çözülür (yoksa ülke/bölge kapsamlı ayarlar hiç okunmaz), teslimat İKİ KEZ çözülür (kargo
  kararı ancak sepet bilinince verilebilir), kargo siparişi bir bölgeye ait değildir.

  ── TEK TUR, PARÇA PARÇA DEĞİL ──────────────────────────────────────────────
  Üç dilim tek cevapta gelir. Bölünseydi ara hâller doğardı: gün listesi yeni adresin, ödeme
  yolları eskisinin olurdu — ve müşteri ekranda gördüğü yöntemi seçip kasada reddedilirdi.

  ── BEARER'IN ARKASINDA, KATALOGUN AKSİNE ───────────────────────────────────
  Sepet girişsiz doldurulur (satırları cihaz taşır, tutarı sunucu çözer — `cart-view.ts`), ama
  SİPARİŞ müşterinin kendisidir: adres, sipariş geçmişi ve ödeme yetkisi hesaba bağlıdır. Misafirin
  buradaki cevabı bir "boş liste" değil, bir GİRİŞ KAPISIDIR ve onu ekran gösterir (web de öyle:
  sepet misafirde dolar, ödeme adımında kimlik istenir).

  ── NİYET GÖVDEDEN ALINMAZ ──────────────────────────────────────────────────
  Sepet SUNUCUDAN okunur (`cart.customer_id`), istemcinin gönderdiği bir kalem listesinden değil.
  Gövdeden alınsaydı istemci kendi sepetini uydurabilir, checkout başka bir sepetin tutarını
  gösterebilirdi. İstemcinin söylediği tek şey SEÇİMLERDİR: hangi adres, hangi kupon, hangi grup.
*/

interface CustomerEnv {
  /* `channel` ölçümün boyutu ve BEDAVA: `resolveCustomer` profili zaten okuyor (sepet ucunun
     aynı deseni), türetme tek kapıdan (`effectiveChannelOf`). */
  Variables: V1Env['Variables'] & { customerId: string; locale: PreferredLanguage; channel: Channel };
}

/**
 * Dil ZORUNLU ve varsayılansız — sepet ailesiyle AYNI okuma (`cart-view.ts` → `localeOf`):
 * `resolveLocalizedText` dil verilmezse kanonik sıraya düşer ve Fransız müşteriye sessizce Türkçe
 * ürün adı gönderirdi. Okuma ikinci kez yazılmadı, çağrıldı.
 */
async function resolveLocale(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);
  c.set('locale', locale.data);
  await next();
}

/**
 * `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — sepetin de adresin de siparişin
 * de sahibi ikincisidir. Sepet/adres/puan uçlarının deseni birebir; profili olmayan auth kullanıcısı
 * `/me` ailesinin ortak cevabını alır.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  c.set('channel', effectiveChannelOf(profile));
  await next();
}

export const checkout = new Hono<CustomerEnv>();
// Ucuz süzgeç önce: dil sorgudan okunur (DB'siz), kimlik sonra (bir sorgu).
checkout.use('*', resolveLocale);
checkout.use('*', resolveCustomer);

/**
 * Ekranın açılış okuması; teslimat, ücret ve ödeme yolları adrese bağlı olduğu için adres değiştikçe yeniden çağrılır.
 * `?coupon=` buraya kadar taşınır (yoksa toplam kuponsuz yazılırdı), `?group=shipping` bölünmüş sepetin kargo yarısıdır.
 */
checkout.get('/', async (c) => {
  const db = serviceDb();
  const customerId = c.get('customerId');
  // NİYET SUNUCUDAN: `cart.items` → `CartEntry`. Eşleme `@lezzet/application`ın kendi kapısı
  // (`entryOfItem`) — iki tür satırın hangi alanı hangi türde taşıdığı bilgisi tek yerde durur.
  const stored = await new CartService(db).get(customerId);

  /* Huninin son adımı: native'de checkout sayfası olmadığı için ekranın verisini kuran uçtan atılır. */
  void recordNativeEvent(
    {
      db,
      channel: c.get('channel'),
      customerId,
      place: UNRESOLVED_PLACE,
      locale: c.get('locale'),
      country: null,
    },
    { type: 'checkout_start' },
  );

  const snapshot = await readCheckoutSnapshot(db, c.get('locale'), {
    customerId,
    entries: stored.items.map(entryOfItem),
    addressId: c.req.query('addressId') ?? null,
    couponCode: c.req.query('coupon') ?? null,
    shippingOrder: c.req.query('group') === 'shipping',
    /* Paket kapısı okumada da geçilir: geçilmezse paket satırı fiyatsız kalır ve ekrandaki toplam tahsil edilecek tutarla ayrışır. */
    bundles: (ids, bundleLocale, place) => getPackagesByIds(db, ids, bundleLocale, place),
  });

  // `z.input` KİLİTTİR: kapının şekli saparsa burası DERLENMEZ. `parse` de süzgeç — kapının
  // taşıdığı ama ekranın işi olmayan alanlar (adresin telefonu, alıcı adı) zarfa sızamaz.
  const body: z.input<typeof CheckoutSnapshotSchema> = {
    addresses: snapshot.addresses,
    // Teslimat dilimi kapıdan olduğu gibi geçer; seçilemeyen davet günü kapıda zaten `null`a iner.
    delivery: snapshot.delivery,
    payment: snapshot.payment === null ? null : { ...snapshot.payment, codBlockedReason: codReasonOf(snapshot.payment.codBlockedReason) },
    // Döküm de kapıdan OLDUĞU GİBİ geçer: ekranın çizeceği küme ile taslağın tahsil edeceği küme
    // aynı hesaptan çıktı (`summary` künyesi), burada yeniden şekillendirilmesi ikinci bir kaynak
    // açardı — düzeltilen arıza tam olarak buydu.
    summary: snapshot.summary,
  };
  return ok(c, CheckoutSnapshotSchema.parse(body));
});

/**
 * Siparişi açar: kural `placeOrder`dadır (web aynı kapıyı çağırır), burası gövdeyi süzer, niyeti sepetten okur, portları geçer.
 * Retler `200` ile `data`da döner, çünkü her biri müşteriden başka bir düzeltme ister ve yapısal ayrıntı taşır.
 */
checkout.post('/order', async (c) => {
  const body = CheckoutOrderBodySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const customerId = c.get('customerId');
  // NİYET SUNUCUDAN — gövdeden ASLA. İstemcinin gönderdiği bir kalem listesi, siparişin neyi
  // içereceğini istemciye yazdırırdı; sepetin sahibi `cart.customer_id`dir.
  const stored = await new CartService(db).get(customerId);

  const outcome = await placeOrder(db, {
    locale: c.get('locale'),
    customerId,
    entries: stored.items.map(entryOfItem),
    ...body.data,
    // Kapı `db`yi ilk parametreden alıyor (terfi kuralı); portun imzasında `db` YOK çünkü sepet
    // okuması onu zaten tutuyor. Bağlama burada, sarmalayıcı yazmadan.
    bundles: (ids, bundleLocale, place) => getPackagesByIds(db, ids, bundleLocale, place),
    createPaymentSession: paymentSessionCreator(),
    effects: mobileOrderEffects(db),
  });

  /* Kapının birliği `z.input<>` ile tiplenir: kapı yeni bir hâl eklerse burası derlenmez; `parse` ekranın işi olmayan alanları süzer.
     Huninin kapanışı: `order_placed` tutar ve müşteri taşımaz, ret eşlemesi `checkoutBlockedAnalyticsReason`tadır. */
  const olcumCtx = {
    db,
    channel: c.get('channel'),
    customerId,
    place: UNRESOLVED_PLACE,
    locale: c.get('locale'),
    country: null,
  };
  if (outcome.status === 'placed' || outcome.status === 'payment_required') {
    void recordNativeEvent(olcumCtx, { type: 'order_placed' });
  } else {
    const reason = checkoutBlockedAnalyticsReason(outcome.status);
    if (reason) void recordNativeEvent(olcumCtx, { type: 'checkout_blocked', reason });
  }

  const result: z.input<typeof CheckoutOrderResultSchema> = outcome;
  return ok(c, CheckoutOrderResultSchema.parse(result));
});

/**
 * Kapıda ödeme engelinin sebebi üç değere daralır, çünkü ekran her biri için ayrı cümle kurar. Tanınmayan değer `null`a düşer:
 * yanlış cümle cümlesizlikten kötüdür.
 */
function codReasonOf(reason: string | null): 'over_limit' | 'customer_blocked' | 'shipping' | null {
  return reason === 'over_limit' || reason === 'customer_blocked' || reason === 'shipping' ? reason : null;
}
