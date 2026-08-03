// @lezzet/brand — marka sabitleri (ad, renkler, yasal metin yolları).
// Renkler Tailwind token kaynağıyla hizalı (kesin palet Claude Design çıktısıyla gelir).
export const brand = {
  name: 'Lezzet Anatolia',
  locales: ['tr', 'fr', 'de'] as const,
  defaultLocale: 'fr' as const,
  /**
   * İşletmenin DIŞARIYA verilen iletişim künyesi (`docs/architecture/BUSINESS_CATALOG.md`).
   *
   * Buraya taşındı çünkü üç ayrı yer aynı numarayı yazıyordu: yapılandırılmış veri
   * (`lib/seo/json-ld`), footer (orada "+33 6 XX XX XX XX" yer tutucusu ASILI KALMIŞTI ve
   * ziyaretçi ona bakıyordu) ve Professionnels sayfasının WhatsApp köprüsü. Numara değiştiği gün
   * üçünün de değişmesi gerekir; iki kopya yeter ki biri unutulsun.
   *
   * `phoneE164` makinenin (WhatsApp bağı, `tel:`, schema.org), `phoneDisplay` insanın okuduğu.
   * İkisi ayrı alan çünkü ikisi ayrı biçim: `wa.me` boşluk ve `+` kabul etmez.
   */
  contact: {
    phoneE164: '+33616990681',
    phoneDisplay: '+33 (0)6 16 99 06 81',
    email: 'lezzetanatolie@gmail.com',
  },
} as const;

/**
 * WhatsApp konuşma bağı. `wa.me` numarayı ARTISIZ ve rakam dışı karaktersiz ister — biçimi
 * çağıranların hatırlamasına bırakmak, bir gün çalışmayan bir bağ demek.
 */
export function whatsappHref(): string {
  return `https://wa.me/${brand.contact.phoneE164.replace(/\D/g, '')}`;
}

export type BrandLocale = (typeof brand.locales)[number];
