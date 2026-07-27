import type { Locale } from '@lezzet/i18n';

/**
 * Vitrin para biçimi — sözleşme HAM cent taşır (`storefront-types`), gösterim burada kurulur.
 * Ayrı durmasının sebebi: aynı fiyat masaüstü ve mobil dosyada iki kez biçimlendirilmesin.
 *
 * Para birimi her dilde EUR — işletme Fransa'dadır; `tr` Fransa'daki Türk diasporasının dilidir,
 * ayrı bir para birimi değil. Ayraç ve simge yeri dile göre değişir (`1 290` → "12,90 €" / "12,90 €"
 * / "12,90 €" ama Almanca ayracı farklıdır) — bunu `Intl` çözer, elle biçim kurulmaz.
 */
const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

export function formatPrice(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Karşılaştırma fiyatı ("12,90 €/kg") — INCO gereği raf fiyatının yanında bulunur. */
export function formatComparison(cents: number, locale: Locale): string {
  return `${formatPrice(cents, locale)}/kg`;
}
