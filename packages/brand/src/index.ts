// @lezzet/brand — marka kimliği: ad (`./name`), dışarıya verilen iletişim künyesi, şirket künyesi,
// yasal metinlerin künye yer tutucularını dolduran `fillBrandFacts` ve WhatsApp bağlantısı. Dil listesi
// burada DEĞİL — tek kaynak `@lezzet/i18n` (`LOCALES`, `DEFAULT_LOCALE`); renkler ve ikon sözlüğü de
// değil — `@lezzet/design-tokens` (`./icons`).
import { BRAND_NAME } from './name';

/* Şirket künyesinin parçaları — her bilgi BİR kez yazılır, birleşik biçimler bunlardan türer:
   unvan = ad + tür, SIRET = SIREN + merkez işyerinin sıra numarası (NIC). */
const DENOMINATION = 'QUALITE';
const LEGAL_FORM = 'SAS';
const SIREN = '907 496 640';
const HEAD_OFFICE_NIC = '00026';

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
   * SIREN ve SIRET insanın okuduğu biçimde (üçlü gruplar) — yasal metinler bu biçimi basıyor.
   */
  company: {
    denomination: DENOMINATION,
    legalName: `${DENOMINATION} ${LEGAL_FORM}`,
    siren: SIREN,
    siret: `${SIREN} ${HEAD_OFFICE_NIC}`,
    vatId: 'FR50907496640',
    address: { street: '46 rue des Prés', postalCode: '67380', city: 'Lingolsheim', countryCode: 'FR' },
  },
} as const;

/**
 * Merkezin adres satırı, ÜLKESİZ — "46 rue des Prés, 67380 Lingolsheim". Ülke adı okuyanın dilinde
 * yazılır (Fransa · France · Frankreich), o yüzden satıra gömülmedi. Bildirim mailinin yasal alt satırı
 * (`notify`) ve yasal metinler (`fillBrandFacts`) bu satırı okur.
 */
export const companyAddressLine = `${brand.company.address.street}, ${brand.company.address.postalCode} ${brand.company.address.city}`;

/**
 * Yasal metinlerin künye yer tutucuları (15.09). Unvan, SIREN/SIRET, KDV no, adres, e-posta ve
 * telefon web'in yasal sayfalarında ve native yasal ekranda (`content.json` · `legal.json`) ELLE
 * yazılıydı — her biri üç dilde ve iki kopyada; künye değiştiği gün yetmişi aşkın yerin birlikte
 * değişmesi gerekirdi. Metin artık `{siret}` gibi bir yer tutucu taşır, değer buradan gelir.
 */
const LEGAL_FACTS = {
  legalName: brand.company.legalName,
  denomination: brand.company.denomination,
  siren: brand.company.siren,
  siret: brand.company.siret,
  vatId: brand.company.vatId,
  address: companyAddressLine,
  email: brand.contact.email,
  phone: brand.contact.phoneDisplay,
} as const;

const FACT_TOKEN = new RegExp(`\\{(${Object.keys(LEGAL_FACTS).join('|')})\\}`, 'g');

/**
 * Bir belgedeki bütün metinlerde künye yer tutucularını doldurur — yapıdan bağımsız (dizi, iç içe
 * nesne), tipi korur. Tanınmayan yer tutucuya DOKUNMAZ: sayfa metninin kendi yer tutucuları (`{date}`
 * gibi) onu çizen bileşenin işidir.
 */
export function fillBrandFacts<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(FACT_TOKEN, (_token, key: keyof typeof LEGAL_FACTS) => LEGAL_FACTS[key]) as T;
  }
  if (Array.isArray(value)) return value.map((item: unknown) => fillBrandFacts(item)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillBrandFacts(item)])) as T;
  }
  return value;
}

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
