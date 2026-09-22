import type { Locale } from '@lezzet/i18n';
import { formatCompactEuro } from './format';

/*
  İlan edilen tutarları cümleye çeviren, web ile native'in ortak kuralı: iki yüzey aynı satırları üretmezse aynı sözleşmenin iki sürümü
  görünür. Tutarlar paragrafa gömülmez, kendi bölümünde durur ki okuma düştüğünde yalnız o bölüm tek cümleye insin.
*/

/** Cümleyi kuran taraf için gereken tutarlar — sözleşme tipine bağlanmaz, yapısal okunur. */
export interface DeliveryTermsAmounts {
  minBasketRouteCents: number;
  minBasketShippingCents: number;
  freeShippingCents: number;
  shippingFeeCents: number;
  codMaxCents: number;
  shippingCountries: readonly string[];
}

/** Yer tutuculu cümleler — her yüzeyin sözlüğünden gelir, üç dilde aynı anahtar ağacı. */
export interface DeliveryTermsCopy {
  /** `{fee}` + `{threshold}` */
  fee: string;
  /** `{amount}` — kapıya teslimin alt sınırı. */
  minBasketRoute: string;
  /** Alt sınır 0 olduğunda: "kapıya teslimde asgari sepet tutarı yoktur". */
  minBasketRouteNone: string;
  /** `{amount}` — kargo siparişinin alt sınırı (kanal şartı varsa doğar). */
  minBasketShipping: string;
  /** Alt sınır 0 olduğunda — VARSAYILAN hâl (`min-basket.ts`: kargoda lojistik taban yoktur). */
  minBasketShippingNone: string;
  /** `{amount}` — kapıda ödemenin üst sınırı. */
  cod: string;
  /** `{countries}` — kargo çıkışı olan ülkeler. */
  countries: string;
  /** Ülke adları arasındaki bağlaç (" ve " · " et " · " und "). */
  and: string;
  /** Ülke KODU → o dildeki ad. Sunucu kod gönderir; adı yazan taraf her zaman ekrandır. */
  countryNames: Record<string, string>;
}

/**
 * Ülke kodlarını okunur listeye çevirir. `Intl.ListFormat` kullanılmıyor, çünkü Hermes'in ICU kapsamı sürüme göre değişiyor; tanınmayan
 * kod olduğu gibi yazılır ki ülke yutulmasın.
 */
export function joinCountries(codes: readonly string[], names: Record<string, string>, and: string): string {
  const labels = codes.map((code) => names[code] ?? code);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')}${and}${labels[labels.length - 1]}`;
}

/** "Güncel tutarlar" bölümünün paragrafları, sabit sırayla; kargo çıkışı hiç yoksa ülke cümlesi kurulmaz, "hiçbir yere" yazılmaz. */
export function deliveryTermsLines(
  amounts: DeliveryTermsAmounts,
  copy: DeliveryTermsCopy,
  locale: Locale,
): string[] {
  const euro = (cents: number) => formatCompactEuro(cents, locale);
  const lines = [
    copy.fee.replace('{fee}', euro(amounts.shippingFeeCents)).replace('{threshold}', euro(amounts.freeShippingCents)),
    amounts.minBasketRouteCents === 0
      ? copy.minBasketRouteNone
      : copy.minBasketRoute.replace('{amount}', euro(amounts.minBasketRouteCents)),
    amounts.minBasketShippingCents === 0
      ? copy.minBasketShippingNone
      : copy.minBasketShipping.replace('{amount}', euro(amounts.minBasketShippingCents)),
    copy.cod.replace('{amount}', euro(amounts.codMaxCents)),
  ];
  if (amounts.shippingCountries.length > 0) {
    lines.push(
      copy.countries.replace('{countries}', joinCountries(amounts.shippingCountries, copy.countryNames, copy.and)),
    );
  }
  return lines;
}
