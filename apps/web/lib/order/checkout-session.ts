import { OrderService, ReservationService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import type { OrderItem } from '@lezzet/types';
import { stripeClient } from '../stripe';

/**
 * **Rezervasyon → ödeme sırası** (07.4) — uygulama katmanı orkestrasyonu. DOMAIN §4/§5.
 *
 * Sıra tersine çevrilemez: **önce stok ayrılır, sonra ödeme açılır.** Ödeme önce açılsaydı müşteri
 * parayı ödedikten sonra "mal kalmamış" cevabını alırdı — sistemin en pahalı hatası budur.
 * Ayrılamayan tek kalem bile varsa ödeme HİÇ başlamaz.
 *
 * **Pencereler eşitlenir:** rezervasyon TTL'i ile Stripe oturumunun son kullanma anı aynı dakikadır.
 * Ayrı olsalardı iki kötü hâl doğardı: oturum daha uzunsa müşteri ödeme yapar ama stok çoktan
 * başkasına gitmiştir; oturum daha kısaysa stok boşuna kilitli kalır.
 *
 * **Yarıda kalan ayırma temizlenir:** üçüncü kalem ayrılamazsa ilk ikisi geri bırakılır. Bırakılmasa
 * stok, hiç doğmayacak bir sipariş için TTL boyunca kilitli kalırdı.
 */

type SessionOutcome =
  | { status: 'ok'; sessionId: string; url: string | null; expiresAt: string }
  /** Stok yetmedi — ödeme hiç açılmadı. Hangi varyanttan ne kadar kaldığı çağırana bildirilir. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Sipariş artık taslak değil (araya biri girdi ya da ödeme zaten açılmış). */
  | { status: 'stale'; currentStatus: string }
  | { status: 'not_found' }
  /** Sağlayıcı anahtarı yok — yerelde beklenen hâl; "ödendi" ile karıştırılmaz. */
  | { status: 'provider_unavailable' };

/**
 * Ödeme oturumu açan taraf — **port**. Bugünkü uygulaması Stripe'tır; test sahte bir üreteç verir.
 * Gerçek sağlayıcıya ağdan gitmeden, "önce ayır sonra öde" sırasının doğruluğu sınanabilsin diye.
 */
export type CheckoutSessionCreator = (params: {
  lineItems: readonly { name: string; unitAmountCents: number; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  expiresAtEpoch: number;
  orderId: string;
}) => Promise<{ id: string; url: string | null }>;

interface SessionInput {
  orderId: string;
  successUrl: string;
  cancelUrl: string;
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

  const ttlMinutes = await new SettingsService(db).getNumber('reservation_ttl_minutes', 30);
  const reservations = new ReservationService(db);

  for (const item of items) {
    const result = await reservations.reserve({
      orderId: order.id,
      variantId: item.variantId,
      qty: item.qty,
      ttlMinutes,
      stockId: item.stockId,
    });
    if (!result.ok) {
      // Yarıda kalan ayırmalar geri bırakılır — bu siparişe ait olduğu için toplu silmek güvenli.
      await reservations.releaseByOrder(order.id);
      return { status: 'insufficient_stock', variantId: item.variantId, available: result.available };
    }
  }

  // Edinim kaynağı ve izin, ödeme açılırken yazılır: müşteri buraya kadar geldiyse niyet bellidir.
  await recordCustomerContext(order.customerId, input);

  const expiresAt = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
  const session = await createSession({
    lineItems: items.map((item) => lineItem(item, order.referenceNo)),
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    expiresAtEpoch: expiresAt,
    orderId: order.id,
  });

  return { status: 'ok', sessionId: session.id, url: session.url, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

/**
 * Kalem satırı. Fiyat **sipariş anında sabitlenmiş** birimdir (DOMAIN §5) — Stripe'a katalogdan
 * değil, siparişten gider; aradaki fiyat değişikliği ödemeyi kaydırmaz.
 *
 * Kalem indirimi birime yansıtılır: Stripe'a ayrı bir "indirim satırı" göndermek toplamı
 * bozardı (negatif satır kabul edilmez).
 */
function lineItem(item: OrderItem, referenceNo: string | null): { name: string; unitAmountCents: number; quantity: number } {
  const grossCents = Math.round(item.unitPrice * 100) * item.qty;
  const discountCents = Math.round(item.lineDiscountAmount * 100);

  return {
    // Ürün adı ödeme ekranında görünür; referans izi birlikte gider.
    name: referenceNo ? `${referenceNo} · ${item.variantId.slice(0, 8)}` : item.variantId.slice(0, 8),
    unitAmountCents: Math.max(0, Math.round((grossCents - discountCents) / item.qty)),
    quantity: item.qty,
  };
}

/** Portun bugünkü uygulaması. Anahtar yoksa `null` — çağıran `provider_unavailable` döner. */
function stripeSessionCreator(): CheckoutSessionCreator | null {
  const stripe = stripeClient();
  if (!stripe) return null;

  return async (params) => {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: params.lineItems.map((line) => ({
        price_data: { currency: 'eur', unit_amount: line.unitAmountCents, product_data: { name: line.name } },
        quantity: line.quantity,
      })),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      expires_at: params.expiresAtEpoch,
      // Siparişe geri dönüşün TEK yolu: webhook bu alanı okur. Ayrı eşleme tablosu tutmuyoruz —
      // sağlayıcının taşıdığı kimlik, bizim kopyamızdan güvenilirdir.
      client_reference_id: params.orderId,
      metadata: { order_id: params.orderId },
    });
    return { id: session.id, url: session.url };
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
