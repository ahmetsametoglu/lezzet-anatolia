import { OrderService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import {
  apportionShippingVat,
  meetsMinBasket,
  resolveCheckoutOptions,
  resolveShippingFee,
  type ShippingVatPart,
} from '@lezzet/domain-core';
import type { DeliveryType, PaymentMethod } from '@lezzet/types';
// Müşteriye söz veren iki eşik: sepet ve checkout AYNI satırı okumalı (`lib/settings-keys`).
import { FREE_SHIPPING_THRESHOLD_DEFAULT, FREE_SHIPPING_THRESHOLD_KEY, MIN_BASKET_KEY } from '@/lib/settings-keys';

/**
 * Checkout ödeme seçenekleri (07.3) — **uygulama katmanı orkestrasyonu**. DOMAIN §6, §7.
 *
 * Motor (03.7/03.8) "bu müşteri bu siparişi nasıl ödeyebilir" kararını zaten veriyordu; burada
 * gerçek girdilere bağlanıyor: müşteri kartı (vade yetkisi, limit, `cod_allowed`), işletme ayarları
 * (kapıda ödeme tavanı, nakit yasal sınırı) ve teslimat türü.
 *
 * **Açık bakiye ve gecikme SAKLANMAZ, türetilir** (DOMAIN §7): ödenmemiş vadeli siparişlerden
 * hesaplanır. Burada o hesap yapılır, karar yine motorundur.
 */

interface CheckoutOptionsResult {
  methods: PaymentMethod[];
  /** Vadeli ("hesaba") satın alma açık mı — ödeme yöntemi değil, siparişin bayrağı. */
  creditAvailable: boolean;
  codBlockedReason: 'over_limit' | 'customer_blocked' | 'shipping' | null;
  cashWarning: boolean;
  creditBlockedReason: 'not_enabled' | 'overdue' | 'limit_exceeded' | null;
  creditRequiresApproval: boolean;

  /** Kargo ücreti (cent) ve neden ücretsiz olduğu. */
  shippingFeeCents: number;
  shippingFreeReason: 'route' | 'threshold' | null;
  /** "X € daha ekleyin, kargo bedava" mesajının girdisi. */
  remainingForFreeShippingCents: number;
  /** Ücretin KDV kırılımı — taşıdığı malın oranını izler (karışık sepette oransal). */
  shippingVat: ShippingVatPart[];

  /** Asgari sepet tutmuyorsa checkout açılmaz. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Müşteriden tahsil edilecek toplam (sepet + kargo, cent). */
  orderTotalCents: number;
}

interface CheckoutOptionsInput {
  customerId: string;
  deliveryType: DeliveryType;
  /** Sepet ara toplamı — indirim uygulanmış, kanal tabanında (cent). */
  basketCents: number;
  /** KDV kırılımı için kalem tutarları + oranları. */
  lines: readonly { totalCents: number; vatRate: number }[];
}

export async function resolveCheckoutPayment(input: CheckoutOptionsInput): Promise<CheckoutOptionsResult> {
  const db = serviceDb();
  const settings = new SettingsService(db);
  const scope = { channel: undefined as string | undefined };

  const [customer, codMaxCents, cashLegalLimitCents, freeThresholdCents, feeCents, minBasketCents] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    settings.getNumber('cod_max_cents', 30_000, scope),
    settings.getNumber('cash_legal_limit_cents', 100_000, scope),
    settings.getNumber(FREE_SHIPPING_THRESHOLD_KEY, FREE_SHIPPING_THRESHOLD_DEFAULT, scope),
    settings.getNumber('shipping_fee_cents', 790, scope),
    settings.getNumber(MIN_BASKET_KEY, 0, scope),
  ]);
  if (!customer) throw new Error(`checkout: müşteri bulunamadı (${input.customerId})`);

  // ── Kargo ücreti önce: sipariş toplamı ona bağlı, kapıda ödeme tavanı da toplama bakar.
  const shipping = resolveShippingFee({
    deliveryType: input.deliveryType,
    basketCents: input.basketCents,
    freeThresholdCents,
    feeCents,
  });
  const orderTotalCents = input.basketCents + shipping.feeCents;

  // ── Vade freni için açık bakiye ve gecikme TÜRETİLİR (saklanmaz).
  const { openBalanceCents, hasOverdue } = await deriveCreditPosition(
    db,
    input.customerId,
    customer.paymentTermDays ?? (await settings.getNumber('payment_term_days', 30)),
  );

  const options = resolveCheckoutOptions({
    orderTotalCents,
    deliveryType: input.deliveryType,
    codMaxCents,
    codAllowed: customer.codAllowed,
    cashLegalLimitCents,
    creditEnabled: customer.creditEnabled,
    creditLimitCents: customer.creditLimit != null ? Math.round(customer.creditLimit * 100) : null,
    openBalanceCents,
    hasOverdue,
  });

  const minBasket = meetsMinBasket(input.basketCents, minBasketCents);

  return {
    ...options,
    shippingFeeCents: shipping.feeCents,
    shippingFreeReason: shipping.freeReason,
    remainingForFreeShippingCents: shipping.remainingForFreeCents,
    shippingVat: apportionShippingVat(shipping.feeCents, input.lines),
    minBasketOk: minBasket.ok,
    missingForMinBasketCents: minBasket.missingCents,
    orderTotalCents,
  };
}

/**
 * Açık bakiye ve gecikme — **ödenmemiş vadeli siparişlerden türetilir**, hiçbir yerde saklanmaz
 * (DOMAIN §7). Saklanan bakiye kayarsa fark edilmez; türetilen kayamaz.
 *
 * Gecikme ölçütü: vade süresini aşmış, hâlâ ödenmemiş sipariş.
 */
async function deriveCreditPosition(
  db: ReturnType<typeof serviceDb>,
  customerId: string,
  paymentTermDays: number,
): Promise<{ openBalanceCents: number; hasOverdue: boolean }> {
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 200 });
  const acikSiparisler = orders.rows.filter((order) => order.onAccount && order.paymentStatus !== 'paid' && order.status !== 'cancelled');

  const vadeSiniri = Date.now() - paymentTermDays * 86_400_000;
  let openBalanceCents = 0;
  let hasOverdue = false;

  for (const order of acikSiparisler) {
    openBalanceCents += Math.round((order.total - order.amountCollected + order.amountRefunded) * 100);
    if (new Date(order.createdAt).getTime() < vadeSiniri) hasOverdue = true;
  }
  return { openBalanceCents: Math.max(0, openBalanceCents), hasOverdue };
}
