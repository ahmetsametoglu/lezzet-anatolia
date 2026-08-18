import type { Locale } from '@lezzet/i18n';
import { formatCompactEuro } from './format';

/*
  İLAN EDİLEN TUTARLARIN CÜMLEYE DÖNÜŞMESİ — iki yüzeyin ortak kuralı (18.08 · kullanıcı kararı).

  Yasal "Teslimat ve iade" ve "Satış koşulları" sayfalarındaki tutarlar bugüne kadar cümlenin İÇİNE
  yazılıydı ("Kargo ücreti 7,90 €'dur"). Hepsi `settings` satırıdır; operatör değiştirdiği gün sepet
  yeni sayıyı keser, sayfa eskisini ilan ederdi. Sayılar artık veriden geliyor ve cümleyi kuran yer
  BURASI — web sunucu bileşeni ve native ekran aynı satırları üretmek zorunda, yoksa iki yüzey aynı
  sözleşmenin iki farklı sürümünü gösterir.

  ── TUTARLAR PROZANIN İÇİNE GİRMİYOR, KENDİ BÖLÜMÜNDE ───────────────────────
  Sebep native tarafın gerçeği: uç düşebilir (çevrimdışı okuma). Sayı paragrafın içine gömülü
  olsaydı, okuma düştüğünde ya paragrafı komple gizlemek (hukuki metinden cümle düşürmek) ya da
  `{fee}` diye ham bir yer tutucu basmak gerekirdi. Tutarlar kendi bölümünde durunca üçüncü bir yol
  açılıyor: bölüm okunamadığında TEK bir cümleye iner ("tutarları sepetinizde görürsünüz") ve
  sayfanın kuralları anlatan kısmı hiç etkilenmez.

  ── SÖZLÜK ÇAĞIRANDAN ───────────────────────────────────────────────────────
  Bu dosya tek bir cümle yazmıyor: yer tutucuları dolduruyor. Metin her yüzeyin kendi
  `content.json`/`messages.json`ında kalır (i18n kuralı), buradaki tek şey DOLGU SIRASI ve hangi
  hâlde hangi cümlenin seçileceği.
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
 * Ülke kodlarını okunur bir listeye çevirir: `['FR','DE']` → "Fransa ve Almanya".
 *
 * `Intl.ListFormat` BİLEREK kullanılmıyor: Hermes'in ICU kapsamı sürümden sürüme değişiyor ve iki
 * ülkelik bir liste için cihaza bağlı bir davranış almak, kazandırdığından çoğunu geri alırdı.
 * Tanınmayan kod OLDUĞU GİBİ yazılır — ad sözlüğü eksikse kodu göstermek, ülkeyi yutmaktan iyidir.
 */
export function joinCountries(codes: readonly string[], names: Record<string, string>, and: string): string {
  const labels = codes.map((code) => names[code] ?? code);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')}${and}${labels[labels.length - 1]}`;
}

/**
 * "Güncel tutarlar" bölümünün paragrafları. Sıra sabittir: ücret → alt sınırlar → kapıda ödeme →
 * kargo kapsamı. Kargo çıkışı hiç yoksa ülke cümlesi HİÇ kurulmaz — "hiçbir yere" diye yazmayız.
 */
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
