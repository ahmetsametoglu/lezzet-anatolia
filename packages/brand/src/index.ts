// @lezzet/brand — marka kimliği: ad (`./name`), dışarıya verilen iletişim künyesi, şirket künyesi ve
// WhatsApp bağlantısı. Dil listesi burada DEĞİL — tek kaynak `@lezzet/i18n` (`LOCALES`,
// `DEFAULT_LOCALE`); renkler ve ikon sözlüğü de değil — `@lezzet/design-tokens` (`./icons`).
import { BRAND_NAME } from './name';

export const brand = {
  /** Ad TEK yerde yazılı (`./name` — native `app.config.ts`in Node'dan okuduğu yaprak dosya). */
  name: BRAND_NAME,
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
  /**
   * Şirket künyesi — resmî kayıttaki tüzel kişi (INPI/RNE; `docs/architecture/BUSINESS_CATALOG.md`).
   *
   * Buraya taşındı çünkü aynı künye iki yerde ayrı yazılıydı ve biri eskimişti: web'in yapılandırılmış
   * verisi (`lib/seo/json-ld`) 03.08'deki resmî düzeltmeyle Lingolsheim adresini taşıyordu, müşteriye
   * giden bildirim maillerinin yasal alt satırı (`notify`) ise hâlâ "12 Rue du Marché, 67000 Strasbourg"
   * yazıyordu (ölçüldü 15.09).
   *
   * `name` (marka) ile `legalName` (unvan) AYRI: ziyaretçi markayı arar, yasal kayıt unvanı taşır.
   */
  company: {
    legalName: 'QUALITE SAS',
    vatId: 'FR50907496640',
    address: { street: '46 rue des Prés', postalCode: '67380', city: 'Lingolsheim', countryCode: 'FR' },
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
