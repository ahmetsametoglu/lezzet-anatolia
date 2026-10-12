import { SELLER_COUNTRY, type Channel, type Country, type Product, type ProductVatRate } from '@lezzet/types';

/** Ürünün oranları: kendi oranı satıcının ülkesinindir, öteki ülkelerinki ayrı satırdadır (`product_vat_rate`). */
export type ProductVatRates = Pick<Product, 'vatRate'> & { countryRates: readonly Pick<ProductVatRate, 'country' | 'vatRate'>[] };

/**
 * Kalemin uygulanan oranı, KDV kararının `rateCountry`sinden: ters yüklemede sıfır, satıcının ülkesinde ürünün oranı, öteki ülkede o
 * ülkenin satırı. Satır yoksa `null` döner, çünkü Fransız oranı Almanya'nınkinin yerine geçemez (lokum FR %20, DE %7).
 */
export function applicableVatRate(rateCountry: Country | null, rates: ProductVatRates): number | null {
  if (rateCountry === null) return 0;
  if (rateCountry === SELLER_COUNTRY) return rates.vatRate;
  return rates.countryRates.find((row) => row.country === rateCountry)?.vatRate ?? null;
}

/**
 * Ürün bu ülkedeki müşteriye satılabilir mi: AB'deki tüketiciye satışta varış ülkesinin oranı eşik beklenmeden zorunludur, yoksa eşik
 * aşıldığı gün ürün satılamaz olurdu. İşletme satışında o oran kullanılmaz; `channel` KDV kararının kanalıdır (`deriveChannel`).
 */
export function sellableIn(input: {
  country: Country;
  channel: Channel;
  countryRates: readonly Pick<ProductVatRate, 'country'>[];
}): boolean {
  if (input.country === SELLER_COUNTRY || input.channel === 'b2b') return true;
  return input.countryRates.some((row) => row.country === input.country);
}
