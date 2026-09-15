import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/price-label';
import { formatPrice } from './format';

/*
  Kartın fiyat etiketi vitrinde, katalogda ve benzer ürün rafında buradan kurulur ki bir ürün iki ekranda iki farklı fiyat
  cümlesiyle görünmesin. Kart fiyatı eksiz yazılır, çünkü yazan sayı detayın açıldığı en ucuz boyun gerçek fiyatıdır; "'dan"
  eki yalnız aile şeridinde, orada sayı başka bir ürünün en ucuz boyu ve o ürünün boy sayısı taşınmıyor.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Kartın fiyat çipi; `undefined` = fiyat bilinmiyor ve çip çizilmez, sıfır yazmak satılmayan ürünü bedava gösterirdi. */
export function productPriceLabel(priceCents: number | null, locale: Locale): string | undefined {
  return priceCents === null ? undefined : formatPrice(priceCents, locale);
}

/** Aile kartının "'dan" ekli etiketi; `null` = fiyat yok, çağıran satırı çizmez. */
export function fromPriceLabel(priceCents: number | null, locale: Locale): string | null {
  if (priceCents === null) return null;
  const t: Messages = messages[locale];
  return t.from.replace('{price}', formatPrice(priceCents, locale));
}
