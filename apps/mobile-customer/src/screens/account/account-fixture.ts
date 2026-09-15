/*
  HESAP TEST/DEMO VERİSİ — artık yalnız KİMLİK KARTININ ve henüz ucu olmayan iki bloğun
  başlangıç değeri. Ekranın gerisi gerçek uçlardan okuyor ve fixture o alanları TAŞIMIYOR:
  adresler 21.15'te (`use-addresses.hook`), dil/izinler 21.16'da (`/me` + `/me/preferences`),
  puan ve kuponlar 21.17'de (`use-points.hook`) bağlandı — her biri kalktıkça bu dosya küçüldü.

  KALAN İKİSİ: `company` (B2B künyesi — okuma ucu yok) ve `points`in eski alanı DEĞİL, yalnız
  `referralCode`ün geldiği `/me`. Tipler sayfaya özel; alan adları sözleşmedekilerle aynı ki
  bağlanma günü çeviri gerekmesin.
*/

export interface AccountCompanyView {
  name: string;
  siret: string;
  vatNumber: string;
}

export interface AccountData {
  /** Girilmemişse BOŞ gelir — kartın e-postaya düşmesi ekranın kararı (MB-66, `account-screen`). */
  name: string;
  email: string;
  phone: string;
  /** Onaylı profesyonel hesap; yoksa `null` (B2C). Okuma ucu YOK — girişli hesapta `null` taşınır. */
  company: AccountCompanyView | null;
  /** Arkadaş getirme kodu; `/me`den gelir, kapalıysa `null`. */
  referralCode: string | null;
  marketingEmail: boolean;
  marketingWhatsApp: boolean;
}

/** Şablonun B2C müşterisi. `overrides` ile misafir/B2B/boş hâller kurulur. */
export function accountData(overrides: Partial<AccountData> = {}): AccountData {
  return {
    name: 'Ayşe Demir',
    email: 'ayse.demir@example.fr',
    phone: '+33 6 24 51 09 88',
    company: null,
    referralCode: 'AYSE-LEZZET',
    marketingEmail: true,
    marketingWhatsApp: false,
    ...overrides,
  };
}
