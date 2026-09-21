/**
 * Dil birimleri — paketin en alt katmanı: `notification-copy` de `index` de bunları okur, tanım
 * index'te kalsaydı ikisi arasında modül döngüsü doğardı.
 */

/** Müşteri yüzeyinde desteklenen diller. Operasyon yüzeyi yalnız Türkçedir. */
export const LOCALES = ['tr', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Öneksiz varsayılan (birincil pazar Fransa) — `/connexion` = fr, `/de/...`, `/tr/...`. */
export const DEFAULT_LOCALE: Locale = 'fr';

/** Dil → ICU yerel kimliği; tarih/sayı biçimleri ve paylaşım kartının `og:locale`i bundan türer. */
export const INTL_LOCALE: Record<Locale, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };
