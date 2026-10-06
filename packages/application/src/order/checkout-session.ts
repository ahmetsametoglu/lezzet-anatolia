import { brand } from '@lezzet/brand';
import { OrderService, UserProfileService, type Db } from '@lezzet/database';
import type { Order, OrderItem } from '@lezzet/types';
import type { BackgroundRunner } from './effects';
import { reserveOrderStock } from './reserve';

/**
 * Önce stok ayrılır, sonra ödeme açılır (DOMAIN §4/§5): tersi olsaydı müşteri parayı ödedikten sonra "mal kalmamış" cevabını
 * alırdı; ayrılamayan tek kalem bile varsa ödeme hiç başlamaz. Niyet ancak "Öde"ye basınca doğduğu için ayırma ile ödeme arası
 * saniyelerdir; gecikirse geç ödeme dalı malı yeniden ayırır ya da parayı iade eder.
 */

export type CheckoutSessionOutcome =
  | { status: 'ok'; paymentRef: string; paymentToken: string | null; expiresAt: string }
  /** Stok yetmedi — ödeme hiç açılmadı. Hangi varyanttan ne kadar kaldığı çağırana bildirilir. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  /** Sipariş taslak değil: araya biri girdi ya da ödeme zaten açılmış. */
  | { status: 'stale'; currentStatus: string }
  | { status: 'not_found' }
  /** Sağlayıcı anahtarı yok — yerelde beklenen hâl; "ödendi" ile karıştırılmaz. */
  | { status: 'provider_unavailable' };

/**
 * Sağlayıcıda ödemeyi açan port (`revolutSessionCreator`, testte sahte); `null` "anahtar yok" demektir. Kalem listesi gönderilmez:
 * tutar `resolveCheckoutPayment`ın hesapladığı sipariş toplamıdır, kalemleri ikinci kez yazmak iki toplamın ayrışabildiği bir yol açardı.
 */
export type CheckoutSessionCreator = (params: {
  amountCents: number;
  orderId: string;
  customerId: string;
  /** Müşteriye sağlayıcının ödeme penceresinde görünür; bu yüzden dilden bağımsız marka ve numaradır. */
  description: string;
  /** Ayırmanın bittiği an; sağlayıcıdaki ödeme de bu sürede düşer. */
  reservationExpiresAt: string;
}) => Promise<{ id: string; paymentToken: string | null }>;

export interface CheckoutSessionInput {
  orderId: string;
  /** Bülten/pazarlama izni — checkout kutusundan gelir, baştan işaretsizdir (DOMAIN §11). */
  marketingConsent?: boolean;
  /** İlk siparişte yazılacak edinim kaynağı (UTM). Sonraki siparişlerde DOKUNULMAZ. */
  acquisitionSource?: Record<string, unknown> | null;
  /** Bu istekte az önce yazılıp geri okunmuş sipariş ve kalemleri; verilirse yeniden okunmaz. */
  placed?: { order: Order; items: OrderItem[] };
  /** Stok eşiği uyarısını yanıttan sonra koşturan kapı. */
  runLater?: BackgroundRunner;
}

export async function createCheckoutSession(
  db: Db,
  input: CheckoutSessionInput,
  createSession: CheckoutSessionCreator | null,
): Promise<CheckoutSessionOutcome> {
  const found = input.placed ?? (await new OrderService(db).getWithItems(input.orderId));
  if (!found) return { status: 'not_found' };

  const { order, items } = found;
  // Ödeme yalnız taslaktan açılır: onaylanmış siparişin parası ya alınmıştır ya vadelidir.
  if (order.status !== 'draft') return { status: 'stale', currentStatus: order.status };

  // Sağlayıcı yoksa STOK AYRILMADAN dönülür — açılamayacak bir ödeme için mal kilitlenmemeli.
  if (!createSession) return { status: 'provider_unavailable' };

  // Ayırma TTL'li: ödeme gelmezse mal geri açılmalı ("önce ayır, sonra tahsil et" — DOMAIN §4).
  const reserved = await reserveOrderStock(db, { orderId: order.id, order, items, expiring: true, runLater: input.runLater });
  if (!reserved.ok) return { status: 'insufficient_stock', variantId: reserved.variantId, available: reserved.available };

  // Edinim kaynağı ve izin, ödeme açılırken yazılır: müşteri buraya kadar geldiyse niyet bellidir.
  await recordCustomerContext(db, order.customerId, input);

  const expiresAt = reserved.expiresAt ?? new Date().toISOString();
  // Tahsil edilecek tutar siparişin TOPLAMIDIR: kalem toplamı + kargo − indirim, hepsi
  // `resolveCheckoutPayment` tarafından hesaplanıp siparişe yazılmış hâliyle. Burada yeniden
  // toplamak, iki hesabın ayrışabildiği ikinci bir kaynak yaratırdı.
  const payment = await createSession({
    amountCents: order.orderedTotalCents,
    orderId: order.id,
    customerId: order.customerId,
    description: order.referenceNo ? `${brand.name} · ${order.referenceNo}` : brand.name,
    reservationExpiresAt: expiresAt,
  });

  /* Ödeme kimliği siparişe yazılır: olmasaydı siparişe dönüşün tek yolu webhook olurdu ve olay gelmezse taslak süresiz
     "onaylanıyor"da kalırdı. Kimlik siparişte olunca ödeme sayfası ve zamanlayıcı sağlayıcıya sorabilir (`reconcileDraftPayment`). */
  await new OrderService(db).update({ id: order.id, paymentRef: payment.id });

  return { status: 'ok', paymentRef: payment.id, paymentToken: payment.paymentToken, expiresAt };
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
