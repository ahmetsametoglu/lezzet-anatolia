import type { z } from 'zod';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { CartDiscountReasonSchema, MeCartView } from '@lezzet/types';

import messages from './discount-label-messages.json';

/*
  İndirimin müşteriye görünen künyesi, sepet ve sipariş özeti için tek türetme. Ad sunucuda çözülür (`discount.label`);
  ad yoksa kampanyanın iç adı değil indirimin sebebi yazılır.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Özet satırının iki parçası; başına gelen "İndirim"/"Remise" öneki ÇAĞIRANIN metnidir. */
interface DiscountSummary {
  /**
   * Müşterinin okuduğu künye: kampanyanın adı, kupon kodu ya da sebebin okunabilir hâli.
   * `null` yalnız TEK hâlde doğar — kupon reddedilmiş ve yerine inen indirimin künyesi hiç yok;
   * o zaman çağıran öneki tek başına yazar.
   */
  name: string | null;
  amountCents: number;
}

type DiscountReason = z.infer<typeof CartDiscountReasonSchema>;

/** Kendiliğinden inen indirimin sebebi — kampanyanın İÇ adı değil, müşterinin okuduğu gerekçe. */
function reasonLabel(reason: DiscountReason, t: Messages): string {
  if (reason.kind === 'customer_rate') return t.customerRate.replace('{percent}', String(reason.percent));
  return reason.percent === null ? t.campaign : t.campaignPercent.replace('{percent}', String(reason.percent));
}

/**
 * Görünümün indirimi → özet satırının künyesi ve tutarı; kupon reddedilse de yerine inen indirim adıyla gösterilir. Yoksa `null`.
 */
export function discountSummaryOf(discount: MeCartView['discount'], locale: Locale): DiscountSummary | null {
  const t: Messages = messages[locale];

  if (discount.status === 'applied') {
    return { name: discount.label ?? discount.code, amountCents: discount.amountCents };
  }
  if (discount.status === 'automatic') {
    return { name: discount.label ?? reasonLabel(discount.reason, t), amountCents: discount.amountCents };
  }
  if (discount.status === 'rejected' && discount.appliedInsteadCents > 0) {
    const instead = discount.appliedInstead;
    return {
      name: instead === null ? null : (instead.label ?? reasonLabel(instead.reason, t)),
      amountCents: discount.appliedInsteadCents,
    };
  }
  return null;
}

/**
 * Sipariş özetinin indirimi → aynı künye; özet çözülmüş sonucu taşır, sebep cümleleri sepetle paylaşılır.
 */
export function orderDiscountSummaryOf(
  discount: { amountCents: number; label: string | null; reason: DiscountReason | null } | null,
  locale: Locale,
): DiscountSummary | null {
  if (discount === null) return null;
  const t: Messages = messages[locale];
  return {
    name: discount.label ?? (discount.reason === null ? null : reasonLabel(discount.reason, t)),
    amountCents: discount.amountCents,
  };
}
