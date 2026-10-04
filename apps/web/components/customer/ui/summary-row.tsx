import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import summaryMessages from './summary-messages.json';

/**
 * Sipariş özetinin ortak sözcükleri, onları çizen bileşenin yanında: sipariş geçmişi ödeme akışının sözlüğüne bağlanmasın diye ayrı
 * dosya, ve dört ekran aynı satırı aynı kelimeyle yazsın diye tek kaynak.
 */
/** Ortak sözcükleri dile göre verir; prop olarak taşınmaz, çünkü kelimeler çağıranın kararı değil bloğun kendi sözlüğü. */
export function summaryCopy(locale: Locale): LocalizedCopy<typeof summaryMessages> {
  return summaryMessages[locale];
}

/**
 * Özet satırı: solda etiket, sağda tutar; ürün kalemleri de aynı satırdır. İki yeşil hâl ayrı, çünkü indirimde kazanç satırın tamamı
 * (`olive`), ücretsiz teslimatta yalnız tutardır (`oliveValue`).
 */
type SummaryRowTone = 'default' | 'olive' | 'oliveValue';

interface SummaryRowProps {
  label: string;
  value: string;
  tone?: SummaryRowTone;
}

export function SummaryRow({ label, value, tone = 'default' }: SummaryRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-body-sm">
      <span className={tone === 'olive' ? 'text-olive' : 'text-body'}>{label}</span>
      <span className={['font-bold', tone === 'default' ? 'text-ink' : 'text-olive'].join(' ')}>{value}</span>
    </div>
  );
}
