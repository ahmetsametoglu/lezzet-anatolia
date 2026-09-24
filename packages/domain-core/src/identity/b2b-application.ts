import { isValidPostalCode } from '@lezzet/address';
import { isValidEmail, normalizePhone } from '@lezzet/helper';
import type { CompanyInfo, Country } from '@lezzet/types';

/*
  Müşterinin gönderdiği B2B formunun biçim kuralları; başvurunun iyi olup olmadığına onay kartı bakar (`b2b-approval`). Form ile
  sunucu aynı denetimi buradan okur ki ekran "gönderilebilir" derken sunucu reddetmesin.
*/

/**
 * `siret` yolunda künye resmî kayıttan gelir; `eu_vat` yolunda açık kayıt olmadığı için elle girilir ve AB vergi numarasıyla
 * doğrulanır. Yollar ülkeyle değil yöntemle adlandı; vergi yolunun bugün kabul ettiği ülke `B2B_VAT_PATH_COUNTRY`.
 */
export type B2bApplicationKind = 'siret' | 'eu_vat';

/**
 * Vergi numarası yolunun kabul ettiği tek ülke: Fransız işletme SIRET yolundan gelir ve numarası resmî kayıttan okunur. Başka
 * ülkeler AB satışı açılana kadar (`docs/GELECEK.md`) reddedilir; kabul edilseydi işletme adresi yanlış ülkeyle yazılırdı.
 */
export const B2B_VAT_PATH_COUNTRY = 'DE' satisfies Country;

/** Vergi numarasının neden kabul edilmediği; `null` = kabul. Form cümlesini bu cevaba göre seçer. */
export type VatNumberProblem = 'format' | 'use_siret' | 'unsupported_country';

export function vatNumberProblem(raw: string): VatNumberProblem | null {
  const split = splitVatNumber(raw);
  if (!split) return 'format';
  if (split.country === B2B_VAT_PATH_COUNTRY) return null;
  return split.country === 'FR' ? 'use_siret' : 'unsupported_country';
}

/** Başvuran işletmenin ülkesi; adres ve telefon bu ülkeye göre yazılır. */
export function b2bApplicantCountry(kind: B2bApplicationKind): Country {
  return kind === 'eu_vat' ? B2B_VAT_PATH_COUNTRY : 'FR';
}

export function normalizeSiret(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Varlık denetimi değil, 14 hane ve Luhn: tek hane hatası resmî kayda gitmeden yakalanır. La Poste'un SIREN'i (`356000000`)
 * Luhn'a uymaz, hane toplamının 5'e bölünmesiyle doğrulanır.
 */
export function isValidSiret(raw: string): boolean {
  const s = normalizeSiret(raw);
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith('356000000')) {
    return [...s].reduce((sum, ch) => sum + Number(ch), 0) % 5 === 0;
  }
  // Luhn: sağdan başlayarak çift sıradaki haneler ikiye katlanır, 9'u geçen 9 çıkarılır.
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = Number(s[13 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Gruplu biçim doğrulama yardımıdır: müşteri numarayı belgesinden de bu gruplarla okur. */
export function formatSiret(raw: string): string {
  const s = normalizeSiret(raw);
  if (s.length !== 14) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
}

export function normalizeVatNumber(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/**
 * Doğrulama servisi ülke kodunu ve numarayı ayrı ister. Gövde harf de kabul eder, çünkü İrlanda ve Hollanda numaralarında harf
 * var.
 */
export function splitVatNumber(raw: string): { country: string; number: string } | null {
  const v = normalizeVatNumber(raw);
  const match = /^([A-Z]{2})([0-9A-Z]{2,12})$/.exec(v);
  if (!match) return null;
  const [, country = '', number = ''] = match;
  return { country, number };
}

export interface B2bApplicationInput {
  kind: B2bApplicationKind;
  /** `siret` yolunda zorunlu. */
  siret: string;
  /** `eu_vat` yolunda elle girilir; `siret` yolunda resmî kayıttan gelir. */
  legalName: string;
  /** `eu_vat` yolunda zorunlu; `siret` yolunda hiç sorulmaz. */
  vatNumber: string;
  contactName: string;
  email: string;
  phone: string;
  /** Adres `eu_vat` yolunda elle, `siret` yolunda resmî kayıttan gelir; ikisinde de dolu olmalı. */
  line1: string;
  postalCode: string;
  city: string;
}

export type B2bApplicationField = keyof B2bApplicationInput;

/**
 * Resmî kayıttan gelen, formun denetlemediği olgular; eksikleri başvuruyu geçersiz kılmaz. Burada durur, çünkü sunucudaki yazma
 * modülü `server-only` ve ekran onu içe aktaramaz.
 */
export interface B2bCompanyFacts {
  activityCode: string | null;
  foundedYear: number | null;
  /** `null`: sorulamadı ya da AB yolunda hiç sorulmadı. */
  isActive: boolean | null;
  /**
   * SIRET yolunda resmî kayıttan gelir, AB yolunda girdiden okunur. Vermeyen yüzeyde numara yazılmaz ve kart "Numara yok"
   * der.
   */
  vatNumber?: string | null;
}

/**
 * İlk hatayı değil hepsini döner ki form düzelt-gönder döngüsüne girmesin; cümleyi ekran kurar. Adres iki yolda da zorunlu,
 * çünkü adres yoksa onay kartının rota sinyali ölçülemez.
 */
export function b2bApplicationIssues(input: B2bApplicationInput): B2bApplicationField[] {
  const issues: B2bApplicationField[] = [];

  if (input.kind === 'siret') {
    if (!isValidSiret(input.siret)) issues.push('siret');
  } else if (vatNumberProblem(input.vatNumber) !== null) {
    issues.push('vatNumber');
  }

  if (input.legalName.trim().length < 2) issues.push('legalName');
  if (input.contactName.trim().length < 2) issues.push('contactName');
  if (!isValidEmail(input.email)) issues.push('email');
  // Ayrı bir telefon deseni aynı kuralın ikinci kopyası olurdu; kaydedilen değeri de bu fonksiyon üretiyor.
  if (!normalizePhone(input.phone, b2bApplicantCountry(input.kind))) issues.push('phone');
  if (input.line1.trim().length < 3) issues.push('line1');
  if (!isValidPostalCode(input.postalCode)) issues.push('postalCode');
  if (input.city.trim().length < 2) issues.push('city');

  return issues;
}

/**
 * Durum ayrı bir kolonda değil, profil alanlarından türer. `b2bApproved === false` tek başına hem bekleyeni hem reddedileni
 * taşır; ayrımı bu fonksiyon yapar.
 */
export type B2bApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export function b2bStatusOf(
  profile: { companyInfo: CompanyInfo | null; b2bApproved: boolean | null; b2bPending: boolean } | null,
): B2bApplicationStatus {
  if (!profile?.companyInfo) return 'none';
  if (profile.b2bApproved === true) return 'approved';
  // "Bekliyor" veritabanının üretilmiş kolonundan okunur, burada yeniden hesaplanmaz. Alan zorunlu, çünkü eksik geçilse
  // reddedilen adaya "inceleniyor" denirdi.
  return profile.b2bPending ? 'pending' : 'rejected';
}
