/*
  Hesap ekranının test verisi ve kimlik kartının başlangıç değeri; ekranın gerisi gerçek uçlardan okur. Alan adları
  sözleşmedekilerle aynı ki bağlanırken çeviri gerekmesin.
*/

export interface AccountCompanyView {
  name: string;
  siret: string;
  vatNumber: string;
}

export interface AccountData {
  /** Girilmemişse boş gelir; kartın e-postaya düşmesi ekranın kararı. */
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
