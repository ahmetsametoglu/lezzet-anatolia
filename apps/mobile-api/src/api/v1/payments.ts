import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type Stripe from 'stripe';
import { z } from 'zod';
import { OrderService, serviceDb, UserProfileService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import { CurrencyEnum, PaymentStatusEnum } from '@lezzet/types';
import type { Order, OrderStatus } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { PROVIDER_CURRENCY, stripeClient } from '../../lib/stripe';
import type { V1Env } from './auth';

/*
  `/api/v1/payments` — YEREL ödeme kartının (Stripe PaymentSheet) sunucu ayağı.

  ── KULLANICI KARARI (09.08) ────────────────────────────────────────────────
  Mobilde online ödeme uygulamadan ÇIKMADAN alınır: `@stripe/stripe-react-native` yerel kartı,
  Apple Pay / Google Pay dahil. Kartın istediği tek şey bir `clientSecret`tir; bu dosya onu üretir.

  ── ÖLÇÜLEN ZEMİN (dosya adı yanıltıyor, kod yanıltmıyor) ───────────────────
  Web'in `apps/web/lib/order/checkout-session.ts`i ADI oturum diyor ama 28.07'den beri
  `paymentIntents.create` çağırıyor (künyesi: "sayfa içi ödemeye geçiş") — yani web ile mobil AYNI
  akışı, aynı Stripe hesabını ve AYNI webhook'u paylaşır. Bu dosya ikinci bir ödeme akışı açmaz:
  niyetin künyesine web'in yazdığı anahtarı (`order_id`) birebir yazar, gerisini
  `apps/web/app/api/webhooks/stripe` işler (tahsilat hareketi · ödeme durumu türetimi · geç ödeme
  dallanması). Tek şart: mobile-api'nin `STRIPE_SECRET_KEY`i web ile AYNI hesabın anahtarı olsun —
  ayrı hesap, webhook'suz ödeme demektir.

  ── TUTAR İSTEMCİDEN ALINMAZ ────────────────────────────────────────────────
  Gövdede tutar ALANI YOKTUR ve olmaması sözleşmenin kendisidir: istemcinin yazabildiği bir sayı
  ödemenin miktarını belirleyemez. Tahsil edilecek para siparişin `total_cents`inden, sipariş de
  müşterinin kendi referansından çözülür.

  ── BU KAPI SİPARİŞ AÇMAZ ───────────────────────────────────────────────────
  "Önce stok ayır, sonra ödeme aç" sırası (DOMAIN §4 · 07.4) web'in `createCheckoutSession`ında
  yaşıyor ve `@lezzet/application`a HENÜZ terfi etmedi. O yüzden burada taslak sipariş bilerek
  REDDEDİLİR (`checkout_required`): ayırmayı atlayıp ödeme açmak, parası alınmış ama malı olmayan
  müşteri üretirdi. Bugün karşılanan hâl, ZATEN VAR OLAN ve ödenmemiş bir siparişin ödenmesidir.
*/

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü tek middleware'de (`orders.ts`/`points.ts` deseni birebir). Profili olmayan auth
 * kullanıcısı `/me` ailesinin ortak cevabını alır (`profile_not_found`, 404).
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}


/**
 * Ödemenin İSTEMCİYE söylenen hâli — Stripe'ın kendi sözlüğü sözleşmeye SIZMAZ.
 *
 * Sağlayıcının durum adları onun sürüm kararıdır; ekranın sorduğu soru ise dörttür: para geldi mi,
 * yolda mı, müşteriden bir hareket mi bekleniyor, yoksa kapandı mı.
 */
const PaymentOutcomeEnum = z.enum(['awaiting_payment', 'requires_action', 'processing', 'succeeded', 'canceled']);
type PaymentOutcome = z.infer<typeof PaymentOutcomeEnum>;

/**
 * Sağlayıcı durumu → bizim sözlüğümüz. `Record` TAM: Stripe yeni bir durum eklerse (SDK sürümüyle)
 * bu dosya DERLENMEZ — sessizce "bilinmiyor"a düşen bir ödeme, gözden saklanan bir ödemedir.
 *
 * `requires_payment_method` "başarısız" DEĞİLDİR: niyetin doğduğu andaki hâli de budur. Reddedilen
 * kartı bu koddan türetmek, hiç denenmemiş bir ödemeyi düşmüş göstermek olurdu.
 * `requires_capture` da `processing` sayılır: para bloke, bizim tarafımızda bir eylem beklenir.
 */
const OUTCOME_BY_PROVIDER_STATUS: Record<Stripe.PaymentIntent.Status, PaymentOutcome> = {
  requires_payment_method: 'awaiting_payment',
  requires_confirmation: 'awaiting_payment',
  requires_action: 'requires_action',
  processing: 'processing',
  requires_capture: 'processing',
  canceled: 'canceled',
  succeeded: 'succeeded',
};

/**
 * Ödemesi AÇILAMAYAN sipariş durumları. `draft` bunlarda değil — onun kendi reddi ve kendi
 * gerekçesi var (dosya başlığı: ayırma sırası henüz terfi etmedi).
 */
const UNPAYABLE_STATUSES = new Set<OrderStatus>(['cancelled', 'returned']);

/* İSTEMCİ VE PARA BİRİMİ ORTAK KAPIDAN (`lib/stripe`, 09.08): bu dosyanın künyesi kuralı zaten
   yazmıştı — ikinci tüketici çıktığında taşınacaktı. Çıktı: checkout ucu siparişi açarken ödeme
   niyetini de açıyor. Anahtarın iki yerden okunması, birinin bir gün ötekinden geride kalması
   demekti. */

/** Sözleşmenin BÜYÜK harfli kodu — sağlayıcının küçük harflisi ayrı (`PROVIDER_CURRENCY`). */
const CURRENCY = CurrencyEnum.options[0];

/**
 * Niyet açma gövdesi — **tek alan, ve tutar YOK** (dosya başlığı). Sipariş REFERANS numarasıyla
 * adreslenir, `/me/orders/:reference` ile aynı anahtar: müşteriye gösterilen numara odur.
 */
const CreateIntentSchema = z.object({ reference: z.string().min(1) });

/**
 * Niyet cevabı. `clientSecret` yerel kartın tek girdisidir; `amountCents` ekranın doğrulama
 * amacıyla GÖSTERDİĞİ tutardır, ödemeyi belirleyen değil (o sunucuda kaldı).
 *
 * ŞEMA BURADA, ÇÜNKÜ HENÜZ TERFİ ETMEDİ: `@lezzet/types/contracts` bu görevin yazma alanı dışında.
 * Sözleşmenin tek kaynağa (`payment-api.schema.ts`) taşınması rapora yazıldı — taşınana kadar
 * istemci tarafı bu şeklin İKİNCİ bir nüshasını YAZMAZ (mobil kapı `clientSecret` alır, gövde
 * ayrıştırmaz), yani iki taraflı duplikasyon oluşmaz.
 */
const PaymentIntentSchema = z.object({
  paymentIntentId: z.string().min(1),
  clientSecret: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: CurrencyEnum,
  orderReference: z.string().min(1),
});

/** Durum cevabı — ödemenin sağlayıcıdaki hâli + bizim defterimizdeki hâli YAN YANA. */
const PaymentIntentStatusSchema = z.object({
  paymentIntentId: z.string().min(1),
  outcome: PaymentOutcomeEnum,
  amountCents: z.number().int().nonnegative(),
  currency: CurrencyEnum,
  orderReference: z.string().min(1),
  /**
   * Siparişin ÖDEME durumu — sağlayıcının `succeeded`i ile bu alan aynı anda değişmez: para geldi
   * demek defterin yazıldığı an demek değildir, arada webhook vardır. Ekran "ödeme alındı"
   * cümlesini bu alandan kurar; ikisini tek alana katlamak, henüz yazılmamış bir tahsilatı
   * yazılmış göstermek olurdu.
   */
  orderPaymentStatus: PaymentStatusEnum,
});

export const payments = new Hono<CustomerEnv>();
payments.use('*', resolveCustomer);

/**
 * Siparişin ödenmesine engel var mı — TEK yerde, çünkü iki uç da aynı soruyu soruyor ve iki ayrı
 * yazım bir gün ayrışırdı. Dönen değer HTTP değil ANAHTAR; durum kodu çağırandadır.
 *
 * Kısmi tahsilat bilerek REDDEDİLİR: kalan borcun hesabı (karşılanan miktar, iptal payı, kargo)
 * motorun işidir (`derivePaymentStatusForOrder`) ve burada ikinci kez yazılamaz — CLAUDE §1.
 * Kalanı ödeme akışı, o hesabın paylaşılan bir kapıdan okunmasıyla açılır.
 */
function paymentBlockOf(order: Order): string | null {
  if (order.status === 'draft') return 'checkout_required';
  if (UNPAYABLE_STATUSES.has(order.status)) return 'order_not_payable';
  if (order.paymentStatus !== 'pending') return 'already_settled';
  if (order.amountCollectedCents !== 0 || order.amountRefundedCents !== 0) return 'partially_settled';
  if (order.orderedTotalCents <= 0) return 'nothing_to_pay';
  return null;
}

/**
 * **Ödeme niyeti aç** — `POST /api/v1/payments/intents`.
 *
 * Sahiplik SORGUYA GÖMÜLÜ (`findByReference(reference, customerId)` — `orders.ts` ile aynı kapı):
 * bulunamayan ile başkasına ait olan AYNI cevabı alır, yoksa numara deneyerek başkasının siparişi
 * doğrulatılabilirdi.
 *
 * **Tekrarlanan istek İKİNCİ niyet yaratmaz:** Stripe'ın kendi idempotency anahtarı sipariş ve
 * tutardan türer, yani ağı kopan istemci "Öde"ye ikinci kez bastığında aynı niyeti geri alır.
 * Tutar anahtarın İÇİNDE: sipariş düzeltilip toplam değiştiyse yeni bir niyet doğmalıdır — eski
 * anahtar farklı parametrelerle çağrılsaydı Stripe zaten reddederdi.
 */
payments.post('/intents', async (c) => {
  const body = CreateIntentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const order = await new OrderService(serviceDb()).findByReference(body.data.reference, c.get('customerId'));
  if (!order?.referenceNo) return fail(c, 'order_not_found', 404);

  const block = paymentBlockOf(order);
  if (block) return fail(c, block, 409);

  const stripe = stripeClient();
  if (!stripe) return fail(c, 'provider_unavailable', 503);

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: order.orderedTotalCents,
        currency: PROVIDER_CURRENCY,
        description: order.referenceNo,
        // Kart yeterli: cüzdanlar (Apple/Google Pay) da kart yöntemidir (web'in kararı, birebir).
        // Otomatik yöntemler açık bırakılsaydı sepete uymayan seçenekler (Klarna, taksit) belirirdi.
        payment_method_types: ['card'],
        // Siparişe geri dönüşün TEK yolu: webhook bu alanı okur (`toVerifiedEvent`). `surface`
        // yalnız künyedir — hangi yüzeyden ödendiği sağlayıcı panelinde görünsün diye.
        metadata: { order_id: order.id, surface: 'mobile' },
      },
      { idempotencyKey: `mobile:order:${order.id}:${order.orderedTotalCents}` },
    );
  } catch (error) {
    // Sağlayıcı hatası BİZİM içsel hatamız değil — 502 ve adlı anahtar. Yutulmuyor: iz düşülüyor
    // ve bağlam yalnız KİMLİK taşıyor (CLAUDE §1 · OBSERVABILITY §5).
    await captureError(error, {
      source: SOURCES.mobileApiHttp,
      path: c.req.path,
      context: { reqId: c.get('reqId'), orderId: order.id },
    });
    return fail(c, 'provider_error', 502);
  }

  // Niyet doğdu ama sırrı yok: kart açılamaz. Sessizce boş dönmek, ekranı sebepsiz bir yükleme
  // döngüsünde bırakırdı.
  if (!intent.client_secret) return fail(c, 'provider_unavailable', 503);

  const payload: z.input<typeof PaymentIntentSchema> = {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    amountCents: intent.amount,
    currency: CURRENCY,
    orderReference: order.referenceNo,
  };
  return ok(c, PaymentIntentSchema.parse(payload));
});

/**
 * **Ödemenin durumu** — `GET /api/v1/payments/intents/:id`.
 *
 * Kart kapandıktan sonra ekran burayı yoklar: sağlayıcı "succeeded" dese bile tahsilat defterine
 * webhook yazar ve arada saniyeler vardır.
 *
 * **SAHİPLİK NİYETİN KÜNYESİNDEN DOĞRULANIR.** Bearer taşıyan herkes `pi_...` deneyebilir; künyeye
 * yazdığımız `order_id` siparişe, sipariş de müşteriye bağlanır. Eşleşmeyen her hâl (künyesiz
 * niyet, silinmiş sipariş, başkasının siparişi) AYNI cevabı alır — ayrım söylenirse sağlayıcı
 * kimliği deneyerek başkasının ödemesi doğrulatılabilirdi.
 */
payments.get('/intents/:id', async (c) => {
  const stripe = stripeClient();
  if (!stripe) return fail(c, 'provider_unavailable', 503);

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(c.req.param('id'));
  } catch (error) {
    // Var olmayan kimlik de buraya düşer; "bulunamadı" ile "sağlayıcı düştü" ayrımını Stripe'ın
    // hata tipinden okumak yerine tek retle dönüyoruz — ayrım çağırana bir şey kazandırmaz.
    await captureError(error, {
      source: SOURCES.mobileApiHttp,
      path: c.req.path,
      context: { reqId: c.get('reqId') },
    });
    return fail(c, 'payment_not_found', 404);
  }

  const orderId = intent.metadata?.['order_id'];
  const order = orderId ? await new OrderService(serviceDb()).getById(orderId) : null;
  if (!order?.referenceNo || order.customerId !== c.get('customerId')) return fail(c, 'payment_not_found', 404);

  const payload: z.input<typeof PaymentIntentStatusSchema> = {
    paymentIntentId: intent.id,
    outcome: OUTCOME_BY_PROVIDER_STATUS[intent.status],
    // `amount_received` GERÇEKTEN alınan, `amount` yalnız niyetti (webhook'un aynı kararı):
    // ikisi ayrıştığında doğru olan paranın kendisidir.
    amountCents: intent.amount_received || intent.amount,
    currency: CURRENCY,
    orderReference: order.referenceNo,
    orderPaymentStatus: order.paymentStatus,
  };
  return ok(c, PaymentIntentStatusSchema.parse(payload));
});
