import type { DocumentVatRegime } from '@lezzet/types';

/**
 * Belgenin koşulları: KDV rejimi ve vade; saf, DB'siz. Belge penceresi, asistanın önerisi ve kapı aynı kuralı buradan okur ki
 * pencere "ters yükleme" önerip kapı reddetmesin.
 */

/**
 * İşletmenin KDV ülkesi — faturaları alan şirket Fransa'da (SAS QUALITE, Lingolsheim). Satış
 * motorunun ülke kararı ayrı bir soru (`resolveVatTreatment`: malın gittiği ülke); bu, gelen belgenin
 * kesildiği ülke ile bizim ülkemizin karşılaştırması.
 */
export const BUSINESS_VAT_COUNTRY = 'FR';

/**
 * Tedarikçinin ülkesinden ve belgenin KDV'sinden rejim önerisi; Fransa dışından KDV'siz fatura ters yüklemedir (autoliquidation).
 * Ülkesi bilinmeyende öneri standart kalır, `exempt` hiç önerilmez: muafiyet belgenin konusundan okunur, ülkeden değil.
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
 * Vade önerisi: belge günü + tedarikçinin gün sayısı; vadesiz tedarikçi peşin çalışır, vade belgenin kendi günüdür.
 * Tarih biçimi bozuksa `null`: uydurulmuş gün ödeme takvimini yanlış kurardı.
 */
export function documentDueOn(issuedOn: string, paymentTermDays: number | null | undefined): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) return null;
  const day = new Date(`${issuedOn}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return null;
  day.setUTCDate(day.getUTCDate() + Math.max(0, paymentTermDays ?? 0));
  return day.toISOString().slice(0, 10);
}
