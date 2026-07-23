// @lezzet/i18n — dil birimleri (locale union) + ortak yerelleştirme sabitleri.
// Arayüz metinleri her sayfanın kendi colocated JSON'unda; burada yalnız locale tanımı.
// URL locale routing + tarayıcı dili tespiti apps/web'de next-intl ile yapılır.
export const PACKAGE = '@lezzet/i18n' as const;

/** Müşteri yüzeyinde desteklenen diller. Operasyon yüzeyi yalnız Türkçedir. */
export const LOCALES = ['tr', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Öneksiz varsayılan (birincil pazar Fransa) — `/connexion` = fr, `/de/...`, `/tr/...`. */
export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Locale-anahtarlı bir metin nesnesinden ({tr,fr,de:{…}}) seçili dilin şeklini verir.
 * Sayfa metin tiplerini `messages.json`'dan türetmek için: `type M = LocalizedCopy<typeof messages>`.
 * Diller özdeş varsayılır; değilse `[Locale]` birleşimi paritesizliği tipçe yüzeye çıkarır.
 */
export type LocalizedCopy<T extends Record<Locale, unknown>> = T[Locale];
