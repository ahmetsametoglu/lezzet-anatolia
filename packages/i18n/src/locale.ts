/**
 * Dil birimleri — paketin EN ALT katmanı (14.15'te `index`ten ayrıldı): `notification-copy` de
 * `index` de bunları okur; tanım index'te kalsaydı ikisi arasında modül döngüsü doğardı
 * (`no-circular` — tip-only da olsa bağ bağdır). Dışarıya karşı değişen bir şey yok: `index`
 * yeniden yayımlar, tüketiciler `@lezzet/i18n`den okumaya devam eder.
 */

/** Müşteri yüzeyinde desteklenen diller. Operasyon yüzeyi yalnız Türkçedir. */
export const LOCALES = ['tr', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Öneksiz varsayılan (birincil pazar Fransa) — `/connexion` = fr, `/de/...`, `/tr/...`. */
export const DEFAULT_LOCALE: Locale = 'fr';
