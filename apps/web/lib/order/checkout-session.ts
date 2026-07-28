import { OrderService, UserProfileService, serviceDb } from '@lezzet/database';
import { stripeClient } from '../stripe';
import { reserveOrderStock } from './reserve';

/**
 * **Rezervasyon → ödeme sırası** (07.4) — uygulama katmanı orkestrasyonu. DOMAIN §4/§5.
 *
 * Sıra tersine çevrilemez: **önce stok ayrılır, sonra ödeme açılır.** Ödeme önce açılsaydı müşteri
 * parayı ödedikten sonra "mal kalmamış" cevabını alırdı — sistemin en pahalı hatası budur.
 * Ayrılamayan tek kalem bile varsa ödeme HİÇ başlamaz.
 *
 * **Yarıda kalan ayırma temizlenir:** üçüncü kalem ayrılamazsa ilk ikisi geri bırakılır. Bırakılmasa
 * stok, hiç doğmayacak bir sipariş için TTL boyunca kilitli kalırdı.
 *
 * ---
 * **SAYFA İÇİ ÖDEMEYE GEÇİŞ (28.07 · kullanıcı kararı).** Önce Stripe'ın barındırdığı Checkout
 * sayfası kullanılıyordu (`checkout.sessions.create` → müşteri siteden çıkar). Artık kart alanı
 * kendi sayfamızda, Stripe'ın kendi iframe'i içinde (`PaymentElement`) — kart bilgisi ne sunucumuza
 * ne de istemci kodumuza uğrar, PCI kapsamı aynı kalır. Bu yüzden port artık `url` değil
 * **`clientSecret`** taşır.
 *
 * **Pencere eşitliği kuralı DÜŞTÜ ve düşmesi doğru.** Eskiden rezervasyon TTL'i ile oturumun
 * `expires_at`'i aynı dakikaya kuruluyordu; `PaymentIntent`'in son kullanma tarihi yok. Yerine
 * geçen şey daha iyisi: istemci **ertelenmiş** Elements kullanıyor (form açılışta monte olur ama
 * niyet YARATILMAZ), niyet ancak "Öde"ye basınca doğuyor. Yani ayırma ile ödeme arasındaki mesafe
 * dakikalar değil SANİYELER — müşteri formu bir saat açık bıraksa bile hiçbir mal kilitlenmemiş
 * olur. Yine de gecikirse 07.5'in geç ödeme dalı devrede: mal yeniden ayrılır, olmazsa iade edilir.
 */

type SessionOutcome =
  | { status: 'ok'; paymentIntentId: string; clientSecret: string | null; expiresAt: string }
  /** Stok yetmedi — ödeme hiç açılmadı. Hangi varyanttan ne kadar kaldığı çağırana bildirilir. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Sipariş artık taslak değil (araya biri girdi ya da ödeme zaten açılmış). */
  | { status: 'stale'; currentStatus: string }
  | { status: 'not_found' }
  /** Sağlayıcı anahtarı yok — yerelde beklenen hâl; "ödendi" ile karıştırılmaz. */
  | { status: 'provider_unavailable' };

/**
 * Ödeme niyetini açan taraf — **port**. Bugünkü uygulaması Stripe'tır; test sahte bir üreteç verir.
 * Gerçek sağlayıcıya ağdan gitmeden, "önce ayır sonra öde" sırasının doğruluğu sınanabilsin diye.
 *
 * Kalem listesi GÖNDERİLMEZ: tahsil edilecek tutar siparişin toplamıdır (kargo dahil) ve o toplam
 * `resolveCheckoutPayment` tarafından çoktan hesaplanmıştır. Kalemleri ikinci kez sağlayıcıya
 * yazmak, iki toplamın ayrışabildiği bir yol açardı — üstelik `PaymentElement` onları göstermiyor,
 * müşteri kalemleri bizim kendi özetimizde okuyor.
 */
export type CheckoutSessionCreator = (params: {
  amountCents: number;
  orderId: string;
  /** Sağlayıcı panelinde siparişi tanımaya yarar; müşteriye kart ekstresinde de görünebilir. */
  description: string;
  /** Ayırmanın bittiği an — niyetin künyesine yazılır, geç ödeme dalı (07.5) bunu okuyabilir. */
  reservationExpiresAt: string;
}) => Promise<{ id: string; clientSecret: string | null }>;

interface SessionInput {
  orderId: string;
  /** Bülten/pazarlama izni — checkout kutusundan gelir, baştan işaretsizdir (DOMAIN §11). */
  marketingConsent?: boolean;
  /** İlk siparişte yazılacak edinim kaynağı (UTM). Sonraki siparişlerde DOKUNULMAZ. */
  acquisitionSource?: Record<string, unknown> | null;
}

export async function createCheckoutSession(
  input: SessionInput,
  createSession: CheckoutSessionCreator | null = stripeSessionCreator(),
): Promise<SessionOutcome> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  const { order, items } = found;
  // Ödeme yalnız taslaktan açılır: onaylanmış siparişin parası ya alınmıştır ya vadelidir.
  if (order.status !== 'draft') return { status: 'stale', currentStatus: order.status };

  // Sağlayıcı yoksa STOK AYRILMADAN dönülür — açılamayacak bir ödeme için mal kilitlenmemeli.
  if (!createSession) return { status: 'provider_unavailable' };

  // Ayırma TTL'li: ödeme gelmezse mal geri açılmalı ("önce ayır, sonra tahsil et" — DOMAIN §4).
  const reserved = await reserveOrderStock({ orderId: order.id, items, expiring: true });
  if (!reserved.ok) return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };

  // Edinim kaynağı ve izin, ödeme açılırken yazılır: müşteri buraya kadar geldiyse niyet bellidir.
  await recordCustomerContext(order.customerId, input);

  const expiresAt = reserved.expiresAt ?? new Date().toISOString();
  // Tahsil edilecek tutar siparişin TOPLAMIDIR: kalem toplamı + kargo − indirim, hepsi
  // `resolveCheckoutPayment` tarafından hesaplanıp siparişe yazılmış hâliyle. Burada yeniden
  // toplamak, iki hesabın ayrışabildiği ikinci bir kaynak yaratırdı.
  const intent = await createSession({
    amountCents: Math.round(order.total * 100),
    orderId: order.id,
    description: order.referenceNo ?? `Sipariş ${order.id.slice(0, 8)} · ${items.length} kalem`,
    reservationExpiresAt: expiresAt,
  });

  return { status: 'ok', paymentIntentId: intent.id, clientSecret: intent.clientSecret, expiresAt };
}

/** Portun bugünkü uygulaması. Anahtar yoksa `null` — çağıran `provider_unavailable` döner. */
function stripeSessionCreator(): CheckoutSessionCreator | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  return async (params) => {
    const intent = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: 'eur',
      description: params.description,
      // Kart yeterli: cüzdanlar (Apple/Google Pay) da kart yöntemidir, ayrı tip gerektirmez.
      // Otomatik yöntemler açık bırakılsaydı sepete uymayan (Klarna, taksit) seçenekler belirirdi.
      payment_method_types: ['card'],
      // Siparişe geri dönüşün TEK yolu: webhook bu alanı okur. Ayrı eşleme tablosu tutmuyoruz —
      // sağlayıcının taşıdığı kimlik, bizim kopyamızdan güvenilirdir.
      metadata: { order_id: params.orderId, reservation_expires_at: params.reservationExpiresAt },
    });
    return { id: intent.id, clientSecret: intent.client_secret };
  };
}

/**
 * İzin ve edinim kaynağı. **İzin kutusu baştan işaretsizdir** (AB açık eylem şartı) ve yalnız
 * işaretlenmişse yazılır: "izin vermedi" ile "sormadık" aynı şey değildir, ikincisi kaydı bozar.
 *
 * `acquisition_source` YALNIZ boşsa yazılır — müşteriyi bize ilk getiren kaynak sonraki
 * kampanyalarla ezilmemelidir (DOMAIN §11).
 *
 * NOT: jsonb anahtarları da servis katmanının case dönüşümünden geçer (`utm_source` → `utmSource`).
 * Uygulama sözleşmesi camelCase olduğu için tutarlıdır; ham SQL ile okuyan bir rapor bunu bilmeli.
 */
async function recordCustomerContext(customerId: string, input: SessionInput): Promise<void> {
  const profiles = new UserProfileService(serviceDb());
  const customer = await profiles.getById(customerId);
  if (!customer) return;

  const patch: Record<string, unknown> = {};
  if (input.marketingConsent) {
    patch.marketingConsent = {
      ...(customer.marketingConsent ?? {}),
      email: { granted: true, at: new Date().toISOString(), source: 'checkout' },
    };
  }
  if (input.acquisitionSource && !customer.acquisitionSource) patch.acquisitionSource = input.acquisitionSource;

  if (Object.keys(patch).length > 0) await profiles.update({ id: customerId, ...patch });
}
