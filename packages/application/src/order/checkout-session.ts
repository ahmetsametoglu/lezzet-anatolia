import { brand } from '@lezzet/brand';
import { OrderService, UserProfileService, type Db } from '@lezzet/database';
import { apportionShippingVat } from '@lezzet/domain-core';
import { vatPortion } from '@lezzet/helper';
import { DEFAULT_LOCALE } from '@lezzet/i18n';
import checkoutCopy from '@lezzet/i18n/customer/checkout';
import { resolveLocalizedText, type Order, type OrderItem, type PreferredLanguage } from '@lezzet/types';
import { resolveOrderLines } from './customer-orders';
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

/** Ödeme sayfasında görünen döküm; tahsil edilen tutarı belirlemez. */
export interface PaymentLine {
  kind: 'product' | 'shipping';
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  imageUrl: string | null;
  /** Ürün satırının KDV oranı; kargo satırında `null`, çünkü kargonun KDV'si kalem oranlarına paylaştırılır. */
  vatRate: number | null;
  /** Satır tutarının içindeki KDV (cent) ve adı ("TVA 5,5 %"). */
  taxes: { name: string; amountCents: number }[];
}

export interface PaymentBreakdown {
  lines: PaymentLine[];
  /** Sepet düzeyindeki indirim; satırlara dağıtılmaz, adıyla ayrı gösterilir. */
  discount: { name: string; amountCents: number } | null;
}

/**
 * Sağlayıcıda ödemeyi açan port (`revolutSessionCreator`, testte sahte); `null` "anahtar yok" demektir. Tahsil edilen tutar her zaman
 * sipariş toplamıdır; döküm yalnız gösterim içindir ve toplamı tutmazsa hiç verilmez.
 */
export type CheckoutSessionCreator = (params: {
  amountCents: number;
  orderId: string;
  customerId: string;
  /** Müşteriye sağlayıcının ödeme penceresinde görünür; bu yüzden dilden bağımsız marka ve numaradır. */
  description: string;
  /** Ayırmanın bittiği an; sağlayıcıdaki ödeme de bu sürede düşer. */
  reservationExpiresAt: string;
  /** Müşterinin dili; ödeme sayfasındaki döküm ve dönüş adresi bu dilde kurulur. */
  locale: PreferredLanguage;
  breakdown: PaymentBreakdown | null;
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
  locale?: PreferredLanguage;
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
  const locale = input.locale ?? DEFAULT_LOCALE;
  // Tahsil edilecek tutar siparişin toplamıdır (`resolveCheckoutPayment`); döküm ondan türemez, yalnız ona eşitse gösterilir.
  const payment = await createSession({
    amountCents: order.orderedTotalCents,
    orderId: order.id,
    customerId: order.customerId,
    description: order.referenceNo ? `${brand.name} · ${order.referenceNo}` : brand.name,
    reservationExpiresAt: expiresAt,
    locale,
    breakdown: await paymentBreakdownOf(db, order, items, locale),
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

/**
 * Ödeme sayfasının dökümü: kalemler, kargo ve sepet indirimi. Satırların toplamı sipariş toplamına eşit değilse `null` döner, çünkü
 * müşteriye tahsil edilenle tutmayan bir döküm göstermek yanlış bilgi olurdu.
 */
async function paymentBreakdownOf(db: Db, order: Order, items: OrderItem[], locale: PreferredLanguage): Promise<PaymentBreakdown | null> {
  const names = await resolveOrderLines(db, items, locale);
  const copy = checkoutCopy[locale].summary;
  const lines: PaymentLine[] = items
    .filter((item) => item.qty > 0)
    .map((item) => {
      const line = names.get(item.variantId);
      return {
        kind: 'product',
        name: [line?.name, line?.unit].filter(Boolean).join(' · ') || brand.name,
        quantity: item.qty,
        unitPriceCents: item.unitPriceCents,
        totalCents: item.unitPriceCents * item.qty - item.lineDiscountAmountCents,
        imageUrl: line?.image.url ?? null,
        vatRate: item.vatRate,
        taxes: [],
      };
    });
  const vatName = (rate: number) => copy.vat.replace('{rate}', String(rate).replace('.', ','));
  for (const line of lines) line.taxes = [{ name: vatName(line.vatRate!), amountCents: vatPortion(line.totalCents, line.vatRate!) }];
  if (order.shippingFeeCents > 0) {
    lines.push({
      kind: 'shipping',
      name: copy.delivery,
      quantity: 1,
      unitPriceCents: order.shippingFeeCents,
      totalCents: order.shippingFeeCents,
      imageUrl: null,
      vatRate: null,
      taxes: apportionShippingVat(
        order.shippingFeeCents,
        lines.map((line) => ({ totalCents: line.totalCents, vatRate: line.vatRate! })),
      ).map((part) => ({ name: vatName(part.vatRate), amountCents: part.vatCents })),
    });
  }
  const sum = lines.reduce((total, line) => total + line.totalCents, 0);
  if (sum === order.orderedTotalCents) return { lines, discount: null };
  if (order.discountAmountCents > 0 && sum - order.discountAmountCents === order.orderedTotalCents) {
    const name = order.discountLabel ? resolveLocalizedText(order.discountLabel, locale) : '';
    return { lines, discount: { name: name || copy.discount, amountCents: order.discountAmountCents } };
  }
  return null;
}
