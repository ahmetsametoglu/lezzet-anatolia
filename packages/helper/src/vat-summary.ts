import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/vat-summary';
import { formatPrice } from './format';

type Messages = LocalizedCopy<typeof messages>;

/**
 * Tutar özetinin KDV sözleri; sepet, ödeme, onay ve sipariş ekranı web ve native'de aynı cümleyi yazar. KDV dahil fiyatta yalnız not
 * değişir, satır adları çağıranın kendi sözüdür (`null`).
 */
export interface VatSummaryText {
  /** "Ara toplam (KDV hariç)"; KDV dahil fiyatta `null`. */
  subtotalLabel: string | null;
  /** KDV hariç fiyatta oran başına KDV satırı; KDV dahil fiyatta ve ters yüklemede boş. */
  vatRows: Array<{ key: string; label: string; value: string }>;
  /** "Genel toplam (KDV dahil)"; KDV dahil fiyatta ve ters yüklemede `null`, çağıran kendi "toplam" sözünü yazar. */
  totalLabel: string | null;
  note: string;
}

export function vatSummaryOf(
  input: { pricesIncludeVat: boolean; vat: readonly { vatRate: number; vatCents: number }[]; zeroRated: boolean },
  locale: Locale,
): VatSummaryText {
  const t: Messages = messages[locale];
  if (input.pricesIncludeVat) return { subtotalLabel: null, vatRows: [], totalLabel: null, note: t.vatIncluded };
  return {
    subtotalLabel: t.subtotalHt,
    vatRows: input.vat.map((row) => ({
      key: `vat-${row.vatRate}`,
      label: t.vatRate.replace('{rate}', String(row.vatRate).replace('.', ',')),
      value: formatPrice(row.vatCents, locale),
    })),
    totalLabel: input.zeroRated ? null : t.totalTtc,
    note: input.zeroRated ? t.reverseCharge : t.vatAdded,
  };
}
