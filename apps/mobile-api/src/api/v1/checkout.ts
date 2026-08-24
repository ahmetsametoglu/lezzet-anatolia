import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { z } from 'zod';
import {
  checkoutBlockedAnalyticsReason,
  effectiveChannelOf,
  entryOfItem,
  getPackagesByIds,
  notifyOrderStatus,
  placeOrder,
  readCheckoutSnapshot,
  UNRESOLVED_PLACE,
  type OrderEffects,
} from '@lezzet/application';
import { CartService, serviceDb, UserProfileService, type Db } from '@lezzet/database';
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

/**
 * Durum geçişinin yan etkileri — webin `webOrderEffects`inin mobil ikizi (`apps/web/lib/order/
 * transition.ts`). İkisi de AYNI paket kapılarını çağırıyor; ayrışan bir kural yok, yalnız `db`
 * bağlanıyor (`placeOrder`ın `bundles` portundaki desen).
 *
 * `refunder` BİLEREK yok: sağlayıcı iadesi `stripe` istemcisi ister ve sipariş AÇMA zincirinde iade
 * diye bir adım yoktur. Kayıtsız port sessiz kalmaz — kapı süreç başına bir kez uyarır
 * (`application/order/effects.ts` → `warnMissing`).
 *
 * **`rewardDelivered` PORTU KALKTI (17.9 · web şeridi, mobil dosyasına tek satırlık dokunuş).**
 * Sipariş puanı kaldırıldı (kullanıcı kararı 11.08) ve getirenin ödülü teslimattan ÖDEMEYE taşındı;
 * ödül artık `application/order/payment.ts` → `finalize` içinde, yani bu uçtan geçen ödemeli
 * siparişte de kendiliğinden yazılıyor. Port dışarıdan doldurulan bir kanca olarak kalsaydı iki
 * yüzey onu ayrı ayrı bağlamak zorunda kalırdı. Gerekçe: `docs/talep/not-mobil-davet-baglantisi.md`.
 */
function mobileOrderEffects(db: Db): OrderEffects {
  return {
    notifyStatus: (orderId, status) => notifyOrderStatus(db, orderId, status),
  };
}

export const checkout = new Hono<CustomerEnv>();
// Ucuz süzgeç önce: dil sorgudan okunur (DB'siz), kimlik sonra (bir sorgu).
checkout.use('*', resolveLocale);
checkout.use('*', resolveCustomer);

/**
 * Ekranın açılış okuması. Adres DEĞİŞTİKÇE yeniden çağrılır — teslimat da ücret de ödeme yolları da
 * seçilen adrese bağlı; birini değiştirip ötekini eski bırakmak ekranı kendi kendisiyle çelişkiye
 * düşürürdü.
 *
 * `?addressId=` yoksa kapı varsayılan adresi, o da yoksa ilkini seçer — ilk açılışta istemcinin
 * "hangisi varsayılan" sorusunu sorup ikinci bir tura çıkması gerekmesin.
 *
 * `?coupon=` sepette girilen koddur ve BURAYA KADAR taşınmak zorundadır: taşınmadığında ekran
 * kendisiyle çelişiyordu — satırlar ve indirim sepet bağlamından (kuponlu), toplam buradan
 * (kuponsuz) geliyor, üstelik siparişe yazılan tutar da kuponsuz oluyordu; müşteri kuponu kullanmış
 * görünüp TAM FİYAT ödüyordu (web'de ölçülmüş arıza, 29.07).
 *
 * `?group=shipping` bölünmüş sepetin KARGO yarısıdır. Bayrak TÜRETİLMEZ, açıkça gelir (kapının
 * kendi künyesi): türetilseydi ekran adresin cevabını gösterir, siparişi açan taslak kargo siparişi
 * açardı.
 */
checkout.get('/', async (c) => {
  const db = serviceDb();
  const customerId = c.get('customerId');
  // NİYET SUNUCUDAN: `cart.items` → `CartEntry`. Eşleme `@lezzet/application`ın kendi kapısı
  // (`entryOfItem`) — iki tür satırın hangi alanı hangi türde taşıdığı bilgisi tek yerde durur.
  const stored = await new CartService(db).get(customerId);

  /* HUNİNİN SON ADIMI BAŞLIYOR (24.08 · MB-63). Web bunu checkout SAYFASINDAN atıyor; native'de
     sayfa yok, o yüzden ekranın verisini kuran uçtan atılıyor — aynı an, aynı niyet.
     Depo boyutu snapshot'tan SONRA bilinecek ama olay "başladı" diyor, "nereye" demiyor. */
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
    /* PAKET KAPISI BURADA DA GEÇİLİR (20.08) — `placeOrder` geçiyordu, OKUMA geçmiyordu ve ikisinin
       ayrışması ekranda ölçüldü: özet paketi listeliyor ve ara toplama katıyor, GENEL TOPLAM ise
       saymıyordu (92,97 − 6,28 = 86,69 iken ekranda 49,31 €; fark tam olarak paketin 37,38 €'su).
       Sebebi kapının yokluğu: paket satırı `orphanLine`a düşüyor — adı boş, fiyatı `null`, engelli —
       ve fiyatsız satır toplama girmiyor. Ekran kendi kendini yalanlıyordu.

       Sipariş AÇILIRKEN kapı zaten geçiliyordu, yani müşteri doğru tutarı ödeyecekti ama ekranda
       yanlışını görüyordu. İki yerin aynı kapıyı görmesi şart: biri paketi tanıyıp öteki tanımazsa
       "gördüğüm tutar ile tahsil edilen tutar" bir gün ayrışır. */
    bundles: (ids, bundleLocale, place) => getPackagesByIds(db, ids, bundleLocale, place),
  });

  // `z.input` KİLİTTİR: kapının şekli saparsa burası DERLENMEZ. `parse` de süzgeç — kapının
  // taşıdığı ama ekranın işi olmayan alanlar (adresin telefonu, alıcı adı) zarfa sızamaz.
  const body: z.input<typeof CheckoutSnapshotSchema> = {
    addresses: snapshot.addresses,
    // Teslimat dilimi kapıdan OLDUĞU GİBİ geçer — bekleyen komşu daveti dâhil (21.45). Alanın
    // süzgeci de kapıda: davetin günü seçilebilir günlerden biri değilse orada `null` oluyor,
    // yani ekran seçilemeyen bir günü hiç görmüyor (`CheckoutDeliverySchema` künyesi).
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
 * SİPARİŞİ AÇ — checkout'un yazma yarısı.
 *
 * ── RET BİR HATA DEĞİL, BİR CEVAPTIR ────────────────────────────────────────
 * On beş ret hâlinin hepsi `200` ile ve zarfın `data`sında döner, `error` anahtarıyla DEĞİL. Sebep:
 * her ret müşteriden BAŞKA bir şey istiyor ve çoğu YAPISAL ayrıntı taşıyor — hangi satır engelli,
 * hangi üründen kaç tane kaldı, fiyat neyden neye çıktı, hangi günler açık. `fail()` yalnız bir
 * anahtar taşıyabilir; ayrıntıyı düşürmek müşteriye "olmadı" deyip nedenini yutmak olurdu.
 * Taşıma hataları (bozuk gövde, kimliksizlik) yine `error` tarafındadır — ayrım korunuyor.
 *
 * ── KURAL BURADA DEĞİL ──────────────────────────────────────────────────────
 * Bağlayıcı fiyatın sabitlenmesi, stok ayırma, durum geçişi, sepetin O SİPARİŞİN kalemlerinden
 * temizlenmesi ve ödeme niyetinin açılması `@lezzet/application`ın `placeOrder`ında — web checkout'u
 * AYNI kapıyı çağırıyor. Bu dosya gövdeyi süzer, niyeti sunucudan okur, iki portu geçer ve cevabı
 * sözleşme şekline indirger.
 *
 * ── ÜÇ PORT GEÇİLİR ─────────────────────────────────────────────────────────
 * · `bundles` — paket çözümü (terfi 09.08). Geçilmezse paket satırı ENGELLİ görünür ve sepetinde
 *   paket olan müşteri sipariş veremezdi.
 * · `createPaymentSession` — sağlayıcı kapısı (`lib/stripe`). `null` = anahtar yok; `placeOrder`
 *   bunu `provider_unavailable` diye okur ve "ödendi" ile KARIŞTIRMAZ.
 * · `effects` — durum haberi + sipariş puanı (`mobileOrderEffects`). Bir süre GEÇİLMİYORDU ve
 *   sonucu ölçülmüş bir ayrışmaydı: webden verilen kapıda/vadeli ödemeli siparişte müşteriye
 *   "siparişiniz alındı" maili gidiyor, mobilden verilende GİTMİYORDU (online ödemede gidiyordu,
 *   çünkü Stripe webhook'u web köprüsünden geçiyor — arıza tek bir dala saklanmıştı). Engel
 *   gönderimin `apps/web` içinde olmasıydı; 21.21'de `@lezzet/application`a terfi etti ve port
 *   doldu.
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

  /* SÖZLEŞMENİN KİLİDİ: kapının birliği `z.input<>` ile TİPLENİR. Birlik bilerek DÜZ ve sözleşmeye
     yakın kuruldu (kapının kendi künyesi) — taslağın on iki ret hâli BİREBİR geçiyor, elle eşleme
     YOK. Kapı yarın bir hâl eklerse burası DERLENMEZ ve fark edilir; elle yazılmış bir `switch`
     olsaydı yeni hâl sessizce eski bir cümleye düşerdi. `parse` de süzgeç: kapının taşıdığı ama
     ekranın işi olmayan alanlar zarfa sızamaz. */
  /* HUNİNİN KAPANIŞI (24.08 · MB-63) — iki olay, tek yer.
     `order_placed` `ANALYTICS §1`in TEK bilinçli istisnası: sipariş kendi tablosunda zaten duruyor
     ama huniyi defterde kapatmanın öteki yolu oturum anahtarını siparişe yazmaktı. İstisna
     mahremiyeti bozan değil, KORUYAN seçenek — tutar ve müşteri taşımaz, yalnız "oturum siparişle
     bitti" der.
     Ret eşlemesi ortak kapıdan (`checkoutBlockedAnalyticsReason`): hangi retlerin ölçülmediği ve
     NEDEN ölçülmediği orada yazılı — `price_changed` engel değil, onay yenilemesidir. */
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
 * Kapının `codBlockedReason`u bugün ham `string | null`; sözleşme onu ÜÇ değere daraltıyor
 * (`over_limit` · `customer_blocked` · `shipping`) çünkü ekran her biri için AYRI cümle kuruyor —
 * "bu tutarda kapıda ödeme sunulamıyor" ile "kargoda kapıda ödeme yok" aynı şey değil ve
 * birincisinde müşteri sepetini küçültüp yöntemi açabilir.
 *
 * Tanınmayan değer `null`a düşer, uydurulmuş bir sebebe DEĞİL: yanlış bir cümle, cümlesizlikten
 * kötüdür — müşteriyi düzeltemeyeceği bir şeyi düzeltmeye uğraştırırdı. Kapı bir gün dördüncü bir
 * sebep eklerse yöntem yine kapalı görünür, yalnız gerekçesi yazılmaz.
 */
function codReasonOf(reason: string | null): 'over_limit' | 'customer_blocked' | 'shipping' | null {
  return reason === 'over_limit' || reason === 'customer_blocked' || reason === 'shipping' ? reason : null;
}
