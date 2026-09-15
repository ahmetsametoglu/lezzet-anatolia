import type { DocumentVatRegime } from '@lezzet/types';

/**
 * BELGENİN KOŞULLARI (12.26 · kullanıcı kararı 14.09) — KDV rejimi ve vade; saf, DB'siz.
 *
 * Belge penceresi, asistanın belge önerisi ve kapı aynı üç soruyu soruyor: bu faturanın KDV rejimi
 * ne olmalı, vadesi ne, ve rejimle KDV tutarı birbirini tutuyor mu. Üçü ayrı yerde yazılsaydı biri bir
 * gün ötekinden ayrılırdı — pencere "ters yükleme" önerir, kapı reddederdi.
 */

/**
 * İşletmenin KDV ülkesi — faturaları alan şirket Fransa'da (SAS QUALITE, Lingolsheim). Satış
 * motorunun ülke kararı ayrı bir soru (`resolveVatTreatment`: malın gittiği ülke); bu, gelen belgenin
 * kesildiği ülke ile bizim ülkemizin karşılaştırması.
 */
export const BUSINESS_VAT_COUNTRY = 'FR';

/**
 * Tedarikçinin ülkesinden ve belgenin KDV'sinden rejim ÖNERİSİ. Karar operatörün — form önerir,
 * değiştirilebilir.
 *
 * Fransa dışındaki tedarikçinin KDV'siz faturası ters yüklemedir: AB içi alımda da ithalatta da
 * Fransız KDV'si bizim beyanımızda hesaplanır (autoliquidation). KDV yazan belge her zaman
 * standarttır; ülkesi bilinmeyen tedarikçide öneri standart kalır — bilinmeyen ülkeden rejim
 * türetmek, olmayan bir bilgiyi yazmak olurdu. `exempt` hiç önerilmez: muafiyet belgenin konusundan
 * (sigorta, banka masrafı) okunur, ülkeden değil.
 */
export function suggestVatRegime(input: { supplierCountry: string | null | undefined; vatAmountCents: number | null | undefined }): DocumentVatRegime {
  if ((input.vatAmountCents ?? 0) > 0) return 'standard';
  if (input.supplierCountry && input.supplierCountry !== BUSINESS_VAT_COUNTRY) return 'reverse_charge';
  return 'standard';
}

/**
 * Rejim ile KDV tutarı çelişiyor mu — standart dışındaki rejimde belgede KDV olamaz. Veri kısıtının
 * (`money_document_vat_regime`) okunur hâli: kapı önce sorar ki ret bir cümle olsun, PG hatası değil.
 */
export function vatRegimeProblem(regime: DocumentVatRegime, vatAmountCents: number | null | undefined): 'vat_with_regime' | null {
  return regime !== 'standard' && (vatAmountCents ?? 0) > 0 ? 'vat_with_regime' : null;
}

/**
 * Vadenin önerisi — belge günü + tedarikçinin tanıdığı gün sayısı. Vadesiz (`null`) tedarikçi PEŞİN
 * çalışır (kartın sözleşmesi), yani vade belgenin kendi günüdür. Tarih biçimi bozuksa `null`:
 * uydurulmuş bir gün, ödeme takvimini yanlış kurardı.
 */
export function documentDueOn(issuedOn: string, paymentTermDays: number | null | undefined): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) return null;
  const day = new Date(`${issuedOn}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return null;
  day.setUTCDate(day.getUTCDate() + Math.max(0, paymentTermDays ?? 0));
  return day.toISOString().slice(0, 10);
}
