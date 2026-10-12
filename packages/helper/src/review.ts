import type { Locale } from '@lezzet/i18n';
import { formatDecimal } from './format';

interface RatingCopy {
  ratingCountOne: string;
  ratingCount: string;
}

/** "5 değerlendirme"; tekil ve çoğul cümle sözlükten gelir, çünkü Fransızca ve Almanca tekilde ad değişir. */
export function ratingCountLabel(count: number, copy: RatingCopy): string {
  return count === 1 ? copy.ratingCountOne : copy.ratingCount.replace('{count}', String(count));
}

/**
 * Ürün başlığının puan parçası, "4,4 (5 değerlendirme)"; yıldız ikonu çizimde durur. Puan yoksa `null` döner, çünkü "0,0" kötü ürün
 * demektir ve henüz değerlendirilmemiş ürünle karışırdı.
 */
export function headRatingLabel(summary: { average: number | null; totalCount: number }, copy: RatingCopy, locale: Locale): string | null {
  if (summary.average === null) return null;
  return `${formatDecimal(summary.average, locale, 1)} (${ratingCountLabel(summary.totalCount, copy)})`;
}
