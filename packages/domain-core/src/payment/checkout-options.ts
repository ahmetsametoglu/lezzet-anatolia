import type { Channel, DeliveryType, PaymentMethod } from '@lezzet/types';

/**
 * Checkout ödeme seçenekleri: "bu müşteri bu siparişi nasıl ödeyebilir" kararı; iki fren birlikte çalışır: kapıda ödeme (tavan, `cod_allowed`, nakit sınırı uyarısı) ve vade (limit, gecikme).
 * Ertelenmiş tahsilat yalnız vade izni olan onaylı işletmeye açıktır ve havale yalnız onun yöntemidir: teslimden sonra gelen paranın arkasında vergi numarası, vade kaydı ve limit olmalı.
 */

export interface CheckoutOptionsInput {
  orderTotalCents: number;
  /** Siparişi veren kim — vade ve havale yalnız `b2b`'de açılır. */
  channel: Channel;
  /** Rota içi teslimat mı — kargoda kapıda ödeme yoktur (peşin). */
  deliveryType: DeliveryType;
  /** Kapıda ödeme değer tavanı (Setting, cent). */
  codMaxCents: number;
  /** Müşteri bazlı kapı — geçmişte ödememiş müşteride admin kapatır. */
  codAllowed?: boolean;
  /** Nakit yasal sınırı (Fransa'da bin avro civarı); aşımda uyarı verilir, engel değil. */
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
  const isBusiness = input.channel === 'b2b';

  // ── Kapıda ödeme ────────────────────────────────────────────────────────────
  let codBlockedReason: CheckoutOptions['codBlockedReason'] = null;
  if (input.deliveryType === 'shipping') codBlockedReason = 'shipping';
  else if (input.codAllowed === false) codBlockedReason = 'customer_blocked';
  else if (input.orderTotalCents > input.codMaxCents) codBlockedReason = 'over_limit';

  // Nakit yasal sınırı: engel değil, uyarı. Kart ayrı değerlendirilir.
  const cashWarning =
    codBlockedReason === null &&
    input.cashLegalLimitCents != null &&
    input.orderTotalCents > input.cashLegalLimitCents;

  // ── Vade ("hesaba") ─────────────────────────────────────────────────────────
  let creditBlockedReason: CheckoutOptions['creditBlockedReason'] = null;
  let creditRequiresApproval = false;
  let creditAvailable = false;

  // Bireysel kayıtta vade izni verilmiş olsa da açılmaz (künyedeki gerekçe).
  if (!isBusiness || !input.creditEnabled) {
    creditBlockedReason = 'not_enabled';
  } else if (input.hasOverdue) {
    // Gecikmiş sipariş varsa yeni vade açılmaz — diğer (peşin) yollar açık kalır.
    creditBlockedReason = 'overdue';
  } else {
    const limit = input.creditLimitCents ?? 0;
    const newBalance = (input.openBalanceCents ?? 0) + input.orderTotalCents;
    if (newBalance > limit) {
      // Otomatik REDDEDİLMEZ: admin tek seferlik onay verebilir ya da limiti kalıcı artırabilir.
      creditBlockedReason = 'limit_exceeded';
      creditRequiresApproval = true;
    } else {
      creditAvailable = true; // limit içinde → otomatik onay (limit önceden verilmiş onaydır)
    }
  }

  // Kart her zaman; havale yalnız açık vadeyle, çünkü peşin havale beklenmeden teslim edilir ve fiilen limitsiz vade olurdu.
  const methods: PaymentMethod[] = creditAvailable ? ['online', 'bank_transfer'] : ['online'];
  // Nakit ve kart mal ile aynı anda el değiştirir — iki kanalda da açık.
  if (codBlockedReason === null) methods.push('cash', 'card');

  return { methods, creditAvailable, codBlockedReason, cashWarning, creditRequiresApproval, creditBlockedReason };
}
