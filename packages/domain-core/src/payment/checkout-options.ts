import type { DeliveryType, PaymentMethod } from '@lezzet/types';

/**
 * Checkout ödeme seçenekleri (03.7 + 03.8) — DOMAIN §7. "Bu müşteri bu siparişi nasıl ödeyebilir"
 * kararı. Saf: tahsilat yapmaz, seçenek listesi ve gerekçesini döner.
 *
 * İki fren birlikte çalışır:
 * - **Kapıda ödeme** (03.8): değer tavanı (parametrik `Setting`) + `Customer.cod_allowed` +
 *   nakit yasal sınırı (uyarı, engel DEĞİL — karar sahada).
 * - **Vade / "hesaba"** (03.7): yalnız `credit_enabled` müşteride; açık bakiye + yeni sipariş
 *   limiti aşarsa **veya** gecikmiş sipariş varsa kapanır. Limit içinde onay OTOMATİKTİR
 *   (limit, önceden verilmiş onaydır — B2B hızı bozulmaz); limit aşımı admin'e düşer.
 *
 * Açık bakiye ve gecikme SAKLANMAZ, türetilir — çağıran hesaplayıp verir (DOMAIN §7).
 */

export interface CheckoutOptionsInput {
  orderTotalCents: number;
  /** Rota içi teslimat mı — kargoda kapıda ödeme yoktur (peşin). */
  deliveryType: DeliveryType;
  /** Kapıda ödeme değer tavanı (Setting, cent). */
  codMaxCents: number;
  /** Müşteri bazlı kapı — geçmişte ödememiş müşteride admin kapatır. */
  codAllowed?: boolean;
  /** Nakit yasal sınırı (FR ~1.000 €) — aşımda UYARI, engel değil. */
  cashLegalLimitCents?: number;

  /** Vade müşteri yetkisidir, varsayılan kapalı. */
  creditEnabled?: boolean;
  creditLimitCents?: number | null;
  /** Ödenmemiş `on_account` siparişlerin toplamı (türetilmiş). */
  openBalanceCents?: number;
  /** Vade süresini aşmış ödenmemiş sipariş var mı (türetilmiş). */
  hasOverdue?: boolean;
}

export interface CheckoutOptions {
  methods: PaymentMethod[];
  /**
   * Vadeli ("hesaba") satın alma açık mı. Ödeme YÖNTEMİ değildir — siparişin `on_account` bayrağıdır
   * ve tahsilat sonradan havaleyle olur (DOMAIN §7); bu yüzden `methods` içine karıştırılmaz.
   */
  creditAvailable: boolean;
  /** Kapıda ödeme kapalıysa sebebi — arayüz bunu sade dille gösterir. */
  codBlockedReason: 'over_limit' | 'customer_blocked' | 'shipping' | null;
  /** Nakit yasal sınırı aşıldı mı — kurye ekranında uyarı çıkar, işlem engellenmez. */
  cashWarning: boolean;
  /** Vade kapalıysa sebebi. */
  creditBlockedReason: 'not_enabled' | 'overdue' | 'limit_exceeded' | null;
  /** Limit aşımı: sipariş reddedilmez, admin onayına düşer (DOMAIN §7). */
  creditRequiresApproval: boolean;
}

export function resolveCheckoutOptions(input: CheckoutOptionsInput): CheckoutOptions {
  const methods: PaymentMethod[] = ['online', 'bank_transfer'];

  // ── Kapıda ödeme ────────────────────────────────────────────────────────────
  let codBlockedReason: CheckoutOptions['codBlockedReason'] = null;
  if (input.deliveryType === 'shipping') codBlockedReason = 'shipping';
  else if (input.codAllowed === false) codBlockedReason = 'customer_blocked';
  else if (input.orderTotalCents > input.codMaxCents) codBlockedReason = 'over_limit';

  if (codBlockedReason === null) methods.push('cash', 'card', 'cheque');

  // Nakit yasal sınırı: engel değil, uyarı. Kart/çek ayrı değerlendirilir.
  const cashWarning =
    codBlockedReason === null &&
    input.cashLegalLimitCents != null &&
    input.orderTotalCents > input.cashLegalLimitCents;

  // ── Vade ("hesaba") ─────────────────────────────────────────────────────────
  let creditBlockedReason: CheckoutOptions['creditBlockedReason'] = null;
  let creditRequiresApproval = false;
  let creditAvailable = false;

  if (!input.creditEnabled) {
    creditBlockedReason = 'not_enabled';
  } else if (input.hasOverdue) {
    // Gecikmiş sipariş varsa yeni vade açılmaz — diğer (peşin) yollar açık kalır.
    creditBlockedReason = 'overdue';
  } else {
    const limit = input.creditLimitCents ?? 0;
    const yeniBakiye = (input.openBalanceCents ?? 0) + input.orderTotalCents;
    if (yeniBakiye > limit) {
      // Otomatik REDDEDİLMEZ: admin tek seferlik onay verebilir ya da limiti kalıcı artırabilir.
      creditBlockedReason = 'limit_exceeded';
      creditRequiresApproval = true;
    } else {
      creditAvailable = true; // limit içinde → otomatik onay (limit önceden verilmiş onaydır)
    }
  }

  return { methods, creditAvailable, codBlockedReason, cashWarning, creditRequiresApproval, creditBlockedReason };
}
