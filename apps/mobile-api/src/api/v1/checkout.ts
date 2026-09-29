import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { z } from 'zod';
import {
  checkoutBlockedAnalyticsReason,
  checkoutServicePoints,
  effectiveChannelOf,
  entryOfItem,
  getPackagesByIds,
  placeOrder,
  readCheckoutOrderStatus,
  readCheckoutSnapshot,
  UNRESOLVED_PLACE,
} from '@lezzet/application';
import { CartService, serviceDb, UserProfileService } from '@lezzet/database';
// Yan etki portu ortak dosyada: kurye uçları da aynı nesneyi geçirir.
import { mobilePaymentEffects } from '../../lib/order-effects';
import {
  CheckoutOrderBodySchema,
  CheckoutOrderResultSchema,
  CheckoutOrderStatusSchema,
  CheckoutServicePointsSchema,
  CheckoutSnapshotSchema,
  type Channel,
  type PreferredLanguage,
} from '@lezzet/types';
import { readJsonBody, UuidSchema } from '../../lib/request';
import { fail, ok } from '../../lib/respond';
import { recordNativeEvent } from '../../lib/analytics';
import { paymentGateway, paymentSessionCreator } from '../../lib/stripe';
import type { V1Env } from './auth';
import { localeOf } from './cart-view';

/*
  `/me/checkout`: "Siparişi tamamla" ekranının okuması ve sipariş açma. Kural `@lezzet/application`da ve web aynı kapıyı çağırır;
  sepet sunucudan okunur, istemciden yalnız seçimler (adres, kupon, grup) alınır.
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
    // Gel-al seçimi de bir SEÇİMDİR (`shippingOrder` gibi): tanınmayan kimliği kapı düşürür, adresin cevabına döner.
    pickupWarehouseId: c.req.query('pickupWarehouseId') ?? null,
    // Seçilen servis yalnız kod olarak gelir; ücret bu koda göre sunucuda çözülür, istemciden tutar alınmaz.
    shippingOptionCode: c.req.query('shippingOptionCode') ?? null,
    /* Paket kapısı okumada da geçilir: geçilmezse paket satırı fiyatsız kalır ve ekrandaki toplam tahsil edilecek tutarla ayrışır. */
    bundles: (ids, bundleLocale, place) => getPackagesByIds(db, ids, bundleLocale, place),
  });

  // `z.input` KİLİTTİR: kapının şekli saparsa burası DERLENMEZ. `parse` de süzgeç — kapının
  // taşıdığı ama ekranın işi olmayan alanlar (adresin telefonu, alıcı adı) zarfa sızamaz.
  const body: z.input<typeof CheckoutSnapshotSchema> = {
    addresses: snapshot.addresses,
    // Teslimat dilimi kapıdan olduğu gibi geçer; seçilemeyen davet günü kapıda zaten `null`a iner.
    delivery: snapshot.delivery,
    shipping: snapshot.shipping,
    payment: snapshot.payment === null ? null : { ...snapshot.payment, codBlockedReason: codReasonOf(snapshot.payment.codBlockedReason) },
    // Döküm de kapıdan olduğu gibi geçer: ekranın çizeceği küme ile taslağın tahsil edeceği küme aynı hesaptan çıkar, burada
    // yeniden şekillendirilmesi ikinci bir kaynak açardı.
    summary: snapshot.summary,
    pickup: snapshot.pickup,
  };
  return ok(c, CheckoutSnapshotSchema.parse(body));
});

/**
 * Haritanın teslim noktaları; web'in `loadServicePointsAction`ıyla aynı kapı. Adres müşterinin kendi adresleri arasında aranır,
 * taşıyıcılar anlık görüntünün noktaya teslim servislerinden gelir (`?carriers=a,b`).
 */
checkout.get('/service-points', async (c) => {
  const addressId = UuidSchema.safeParse(c.req.query('addressId'));
  if (!addressId.success) return fail(c, 'invalid_query', 400);
  const carrierCodes = (c.req.query('carriers') ?? '').split(',').filter((code) => code !== '');
  const result = await checkoutServicePoints(serviceDb(), { customerId: c.get('customerId'), addressId: addressId.data, carrierCodes });
  return ok(c, CheckoutServicePointsSchema.parse(result));
});

/**
 * Onay ekranının ödeme beklemesi: kart taslağında sağlayıcıya sorar ve netleşen durumu döndürür. Başkasının siparişi de bulunamayan
 * gibi 404 alır, numara deneyen biri ayrımı öğrenmesin.
 */
checkout.get('/order/:orderId/status', async (c) => {
  const orderId = UuidSchema.safeParse(c.req.param('orderId'));
  if (!orderId.success) return fail(c, 'order_not_found', 404);

  const db = serviceDb();
  const status = await readCheckoutOrderStatus(
    db,
    { orderId: orderId.data, customerId: c.get('customerId') },
    { gateway: paymentGateway(), effects: mobilePaymentEffects(db) },
  );
  if (!status) return fail(c, 'order_not_found', 404);
  return ok(c, CheckoutOrderStatusSchema.parse(status));
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
    // Paket kapısı `db`yi ilk parametreden alır; bağlama burada, sarmalayıcı yazmadan.
    bundles: (ids, bundleLocale, place) => getPackagesByIds(db, ids, bundleLocale, place),
    createPaymentSession: paymentSessionCreator(),
    paymentGateway: paymentGateway(),
    // Ödeme etkileri, çünkü aynı basışın taslağına dönüşte kapanan ödemenin müşteri haberi de gider.
    effects: mobilePaymentEffects(db),
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
