import { registerBlockReasonLabel } from '@lezzet/i18n';
import { PAYMENT_METHOD_LABELS, type RegisterDayDifference } from '@lezzet/types';
import { money, percent } from '@/components/operation/ui/format';
import { queueBlockReason } from '@/lib/queue/block-reason';

/** `last_error` `blocked:<sebep>` biçimindeyse sebebin etiketi, değilse `null` (satır durmamış, hata almış). */
export function blockReasonOf(lastError: string | null): string | null {
  const reason = queueBlockReason(lastError);
  return reason ? registerBlockReasonLabel(reason) : null;
}

/** Gün sonu farkının cümlesi: "bizde" defterimiz ya da aynamız, "kasada" Hiboutik'in gün verisidir. */
export function registerDifferenceText(difference: RegisterDayDifference): string {
  switch (difference.kind) {
    case 'vat':
      return `${percent(difference.vatRate, Number.isInteger(difference.vatRate) ? 0 : 1)} KDV'li satış bizde ${money(difference.oursCents)}, kasada ${money(difference.registerCents)}`;
    case 'payment':
      return `${difference.method ? PAYMENT_METHOD_LABELS[difference.method] : 'yöntemi bilinmeyen'} ödeme bizde ${money(difference.oursCents)}, kasada ${money(difference.registerCents)}`;
    case 'unknown_sale':
      return `kasada bizde olmayan satış #${difference.saleId}`;
    case 'missing_sale':
      return `bizdeki satış #${difference.saleId} kasada yok`;
    case 'cash':
      return `çekmecenin günlük neti bizde ${money(difference.oursCents)}, kasada ${money(difference.registerCents)}`;
    case 'ledger':
      return `${difference.entry === 'payment' ? 'ödeme' : 'kasa hareketi'} ${difference.movementId.slice(0, 8)} kasaya ${money(difference.expectedCents)} yazılmalıydı, yazılan ${money(difference.writtenCents)}`;
  }
}
