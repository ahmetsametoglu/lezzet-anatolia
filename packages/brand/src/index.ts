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
 * WhatsApp konuşma bağı (15.3). `wa.me` numarayı ARTISIZ ve rakam dışı karaktersiz ister — biçimi
 * çağıranların hatırlamasına bırakmak, bir gün çalışmayan bir bağ demek.
 *
 * **Önceden yazılı metin PARAMETRE, burada kurulmuyor** ve bu bilinçli: metin müşteriye görünen
 * i18n kopyasıdır, sayfanın kendi `messages.json`'unda yaşar (`CLAUDE §2`). Burada kurulsaydı marka
 * paketi üç dilin sözlüğünü taşımak zorunda kalır ve sayfa metnini değiştiren kişi onu bulamazdı.
 * Boş/boşluk metin METİNSİZ bağ üretir — `?text=` ile boş bir parametre göndermek, WhatsApp'ta boş
 * bir taslakla açılan sohbet demek.
 *
 * Yön farkı önemli: bu bağ MÜŞTERİDEN BİZE yazar (numara bizim). Kuryenin "yoldayım" bağı
 * (`domain-core/delivery/on-the-way`) ters yöndedir — numara müşterinindir, metin de bizim
 * ağzımızdan kuruludur. İkisi ayrı kurucu, çünkü ayrı iki cümle kuruyorlar.
 */
export function whatsappHref(text?: string | null): string {
  const number = brand.contact.phoneE164.replace(/\D/g, '');
  const message = text?.trim();
  return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}

export type BrandLocale = (typeof brand.locales)[number];
