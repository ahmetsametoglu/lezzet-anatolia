import { OrderService, UserProfileService, type Db } from '@lezzet/database';
import { reserveOrderStock } from './reserve';

/**
 * Önce stok ayrılır, sonra ödeme açılır (DOMAIN §4/§5): tersi olsaydı müşteri parayı ödedikten sonra "mal kalmamış" cevabını
 * alırdı; ayrılamayan tek kalem bile varsa ödeme hiç başlamaz. Niyet ancak "Öde"ye basınca doğduğu için ayırma ile ödeme arası
 * saniyelerdir; gecikirse geç ödeme dalı malı yeniden ayırır ya da parayı iade eder.
 */

export type CheckoutSessionOutcome =
  | { status: 'ok'; paymentIntentId: string; clientSecret: string | null; expiresAt: string }
  /** Stok yetmedi — ödeme hiç açılmadı. Hangi varyanttan ne kadar kaldığı çağırana bildirilir. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Sipariş taslak değil: araya biri girdi ya da ödeme zaten açılmış. */
  | { status: 'stale'; currentStatus: string }
  | { status: 'not_found' }
  /** Sağlayıcı anahtarı yok — yerelde beklenen hâl; "ödendi" ile karıştırılmaz. */
  | { status: 'provider_unavailable' };

/**
 * Ödeme niyetini açan port: bugün Stripe, testte sahte üreteç; sağlayıcı istemcisi pakete girmez, çünkü `stripe` bu paketin
 * bağımlılığı olamaz ve `null` "anahtar yok" demektir. Kalem listesi gönderilmez: tutar `resolveCheckoutPayment`ın hesapladığı sipariş
 * toplamıdır, kalemleri sağlayıcıya ikinci kez yazmak iki toplamın ayrışabildiği bir yol açardı.
 */
export type CheckoutSessionCreator = (params: {
  amountCents: number;
  orderId: string;
  /** Sağlayıcı panelinde siparişi tanımaya yarar; müşteriye kart ekstresinde de görünebilir. */
  description: string;
  /** Ayırmanın bittiği an — niyetin künyesine yazılır, geç ödeme dalı (07.5) bunu okuyabilir. */
  reservationExpiresAt: string;
}) => Promise<{ id: string; clientSecret: string | null }>;

export interface CheckoutSessionInput {
  orderId: string;
  /** Bülten/pazarlama izni — checkout kutusundan gelir, baştan işaretsizdir (DOMAIN §11). */
  marketingConsent?: boolean;
  /** İlk siparişte yazılacak edinim kaynağı (UTM). Sonraki siparişlerde DOKUNULMAZ. */
  acquisitionSource?: Record<string, unknown> | null;
}

export async function createCheckoutSession(
  db: Db,
  input: CheckoutSessionInput,
  createSession: CheckoutSessionCreator | null,
): Promise<CheckoutSessionOutcome> {
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  const { order, items } = found;
  // Ödeme yalnız taslaktan açılır: onaylanmış siparişin parası ya alınmıştır ya vadelidir.
  if (order.status !== 'draft') return { status: 'stale', currentStatus: order.status };

  // Sağlayıcı yoksa STOK AYRILMADAN dönülür — açılamayacak bir ödeme için mal kilitlenmemeli.
  if (!createSession) return { status: 'provider_unavailable' };

  // Ayırma TTL'li: ödeme gelmezse mal geri açılmalı ("önce ayır, sonra tahsil et" — DOMAIN §4).
  const reserved = await reserveOrderStock(db, { orderId: order.id, items, expiring: true });
  if (!reserved.ok) return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };

  // Edinim kaynağı ve izin, ödeme açılırken yazılır: müşteri buraya kadar geldiyse niyet bellidir.
  await recordCustomerContext(db, order.customerId, input);

  const expiresAt = reserved.expiresAt ?? new Date().toISOString();
  // Tahsil edilecek tutar siparişin TOPLAMIDIR: kalem toplamı + kargo − indirim, hepsi
  // `resolveCheckoutPayment` tarafından hesaplanıp siparişe yazılmış hâliyle. Burada yeniden
  // toplamak, iki hesabın ayrışabildiği ikinci bir kaynak yaratırdı.
  const intent = await createSession({
    amountCents: order.orderedTotalCents,
    orderId: order.id,
    description: order.referenceNo ?? `Sipariş ${order.id.slice(0, 8)} · ${items.length} kalem`,
    reservationExpiresAt: expiresAt,
  });

  /* Ödeme kimliği siparişe yazılır: olmasaydı siparişe dönüşün tek yolu webhook olurdu ve olay gelmezse taslak süresiz
     "onaylanıyor"da kalırdı. Kimlik siparişte olunca ödeme sayfası ve zamanlayıcı sağlayıcıya sorabilir (`reconcileDraftPayment`). */
  await new OrderService(db).update({ id: order.id, paymentRef: intent.id });

  return { status: 'ok', paymentIntentId: intent.id, clientSecret: intent.clientSecret, expiresAt };
}

/**
 * İzin yalnız kutu işaretlendiyse yazılır (AB açık eylem şartı), çünkü "izin vermedi" ile "sormadık" ayrı kayıtlardır; edinim kaynağı
 * yalnız boşsa yazılır, ilk getiren kaynak sonraki kampanyalarla ezilmesin (DOMAIN §11). jsonb anahtarları da servisin camelCase
 * dönüşümünden geçer (`utm_source` → `utmSource`); ham SQL ile okuyan rapor bunu bilmeli.
 */
async function recordCustomerContext(db: Db, customerId: string, input: CheckoutSessionInput): Promise<void> {
  const profiles = new UserProfileService(db);
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
