import type { Locale } from '@lezzet/i18n';

/*
  HESAP TEST/DEMO VERİSİ — 21.14 ilk etabı UI-only. `/api/v1/me` sözleşmesi (`MeSchema`) VAR ama
  hesap ekranının gösterdiklerinin tamamını taşımıyor (puan bakiyesi, kupon listesi, adres
  listesi, referans kodu ayrı uçların işi) ve bu etapta uca BAĞLANMIYORUZ. Tipler bu yüzden
  sayfaya özel; alan adları sözleşmedekilerle aynı yazıldı ki taşınma günü çeviri gerekmesin.
*/

export interface AccountAddressView {
  id: string;
  /** Etiket — "Ev", "İş". */
  label: string;
  /** Sokak ve kapı numarası. */
  street: string;
  postalCode: string;
  city: string;
  isDefault: boolean;
}

/**
 * Kartta okunan tek satır — şablonun kendi birleşimi (`l + ', ' + zip + ' ' + city`, v3:2023).
 * SAKLANMAZ, TÜRETİLİR: parçalar zaten satırda duruyor ve iki yerde tutulan aynı gerçek bir gün
 * ayrışır — düzenleme formu parçaları yazar, liste satırı okur.
 */
export function addressLine(address: AccountAddressView): string {
  return `${address.street}, ${address.postalCode} ${address.city}`;
}

export interface AccountCouponView {
  code: string;
  /** İndirim değeri — biçimlenmiş metin ("5 € indirim"). */
  valueLabel: string;
}

export interface AccountCompanyView {
  name: string;
  siret: string;
  vatNumber: string;
}

export interface AccountData {
  name: string;
  email: string;
  phone: string;
  /** Onaylı profesyonel hesap; yoksa `null` (B2C). */
  company: AccountCompanyView | null;
  /** Puan bakiyesi; B2B'de `null` (şablon: puan yalnız B2C'de). */
  points: number | null;
  coupons: AccountCouponView[];
  /** Arkadaş getirme kodu; kapalıysa `null`. */
  referralCode: string | null;
  addresses: AccountAddressView[];
  preferredLanguage: Locale;
  marketingEmail: boolean;
  marketingWhatsApp: boolean;
}

/** Puan → kupon dönüşümünün eşiği ve karşılığı (şablon: 200 puan = 5 €). */
export const POINTS_PER_COUPON = 200;
export const COUPON_VALUE_CENTS = 500;

/** Şablonun B2C müşterisi. `overrides` ile misafir/B2B/boş hâller kurulur. */
export function accountData(overrides: Partial<AccountData> = {}): AccountData {
  return {
    name: 'Ayşe Demir',
    email: 'ayse.demir@example.fr',
    phone: '+33 6 24 51 09 88',
    company: null,
    points: 145,
    coupons: [],
    referralCode: 'AYSE-LEZZET',
    addresses: [
      { id: 'home', label: 'Ev', street: '12 Quai des Bateliers', postalCode: '67000', city: 'Strasbourg', isDefault: true },
      { id: 'work', label: 'İş', street: '3 Rue du Dôme', postalCode: '67000', city: 'Strasbourg', isDefault: false },
    ],
    preferredLanguage: 'tr',
    marketingEmail: true,
    marketingWhatsApp: false,
    ...overrides,
  };
}
