import type { Locale } from '@lezzet/i18n';

/*
  HESAP TEST/DEMO VERİSİ — 21.14 ilk etabı UI-only. `/api/v1/me` sözleşmesi (`MeSchema`) VAR ama
  hesap ekranının gösterdiklerinin tamamını taşımıyor (puan bakiyesi, kupon listesi, referans
  kodu ayrı uçların işi) ve bu etapta uca BAĞLANMIYORUZ. Tipler bu yüzden sayfaya özel; alan
  adları sözleşmedekilerle aynı yazıldı ki taşınma günü çeviri gerekmesin. ADRESLER ARTIK BURADA
  DEĞİL: 21.15'te gerçek uçlara bağlandı (`use-addresses.hook.ts`), fixture yalnız kalan
  UI-only bölümleri taşıyor.
*/

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
    preferredLanguage: 'tr',
    marketingEmail: true,
    marketingWhatsApp: false,
    ...overrides,
  };
}
