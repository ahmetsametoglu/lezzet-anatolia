// @lezzet/brand — marka sabitleri (ad, renkler, yasal metin yolları).
// Renkler Tailwind token kaynağıyla hizalı (kesin palet Claude Design çıktısıyla gelir).
export const brand = {
  name: 'Lezzet Anatolia',
  locales: ['tr', 'fr', 'de'] as const,
  defaultLocale: 'fr' as const,
} as const;

export type BrandLocale = (typeof brand.locales)[number];
