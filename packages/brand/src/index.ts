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
   * Dışarıya verilen iletişim künyesi; `phoneE164` makinenin (WhatsApp, `tel:`, schema.org), `phoneDisplay` insanın okuduğu biçim,
   * çünkü `wa.me` boşluk ve `+` kabul etmez.
   */
  contact: {
    phoneE164: '+33616990681',
    phoneDisplay: '+33 (0)6 16 99 06 81',
    email: 'lezzetanatolie@gmail.com',
  },
  /**
   * Resmî kayıttaki tüzel kişi. `name` (marka) ile `legalName` (unvan) ayrı, çünkü ziyaretçi markayı arar, yasal kayıt unvanı taşır.
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

/** Merkezin adres satırı, ülkesiz: ülke adı okuyanın dilinde yazılır (Fransa · France · Frankreich), o yüzden satıra gömülmedi. */
export const companyAddressLine = `${brand.company.address.street}, ${brand.company.address.postalCode} ${brand.company.address.city}`;

/** Yasal metinlerin künye yer tutucuları; metin `{siret}` gibi yer tutucu taşır ki künye değiştiğinde üç dilde elle düzeltilmesin. */
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
 * Müşteriden bize yazan WhatsApp bağı; `wa.me` numarayı artısız ve rakam dışı karaktersiz ister. Önceden yazılı metin parametredir,
 * çünkü müşteriye görünen kopya sayfanın kendi sözlüğünde yaşar; boş metin `?text=` göndermez, yoksa sohbet boş taslakla açılır.
 */
export function whatsappHref(text?: string | null): string {
  const number = brand.contact.phoneE164.replace(/\D/g, '');
  const message = text?.trim();
  return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}
