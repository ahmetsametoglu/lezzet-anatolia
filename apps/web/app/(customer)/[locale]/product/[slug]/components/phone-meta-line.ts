import { formatPrice } from '@lezzet/helper';
import productMessages from '@lezzet/i18n/customer/product';
import type { Locale } from '@lezzet/i18n';
import type { StorefrontVariant } from '@lezzet/application';

/** Kartın da boyun da taşıdığı satış alanları; üst bölüm ikisinden aynı hesapla çizilir. */
export type HeadSelling = Pick<
  StorefrontVariant,
  'priceCents' | 'wasCents' | 'comparisonCents' | 'comparisonUnit' | 'limitLabel' | 'stockStatus' | 'soldOut'
>;

/** Fiyatın altındaki satır. Birim fiyatın birimi veriden gelir, çünkü sıvıyı kiloyla yazmak kıyası yanlış yapar. */
export function phoneMetaLine(selling: HeadSelling | null, locale: Locale): string {
  const copy = productMessages[locale];
  const comparison = selling?.comparisonCents ?? null;
  const unit = selling?.comparisonUnit ?? null;
  const was = selling?.wasCents;
  return [
    comparison === null || unit === null
      ? null
      : copy.meta.perUnit.replace('{price}', formatPrice(comparison, locale)).replace('{unit}', unit),
    copy.meta.vat,
    was === undefined ? null : copy.meta.was.replace('{price}', formatPrice(was, locale)),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}
