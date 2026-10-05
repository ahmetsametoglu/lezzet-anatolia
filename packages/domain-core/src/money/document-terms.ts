import { addVat } from '@lezzet/helper';
import type { Business, DocumentKind, DocumentVatLine, DocumentVatRegime, MovementDirection } from '@lezzet/types';

/**
 * Belgenin koşulları: KDV rejimi, KDV kırılımı ve vade; saf, DB'siz. Belge penceresi, asistanın önerisi ve kapı aynı kuralı buradan
 * okur ki pencere "ters yükleme" önerip kapı reddetmesin.
 */

/**
 * İşletmenin KDV ülkesi — faturaları alan şirket Fransa'da (SAS QUALITE, Lingolsheim). Satış
 * motorunun ülke kararı ayrı bir soru (`resolveVatTreatment`: malın gittiği ülke); bu, gelen belgenin
 * kesildiği ülke ile bizim ülkemizin karşılaştırması.
 */
export const BUSINESS_VAT_COUNTRY = 'FR';

/**
 * Satırın KDV'si orandan en çok bu kadar sapabilir (en az 2 cent ya da beklenenin binde beşi): fatura KDV'yi kalem kalem
 * yuvarlayabilir. Pay yanlış seçilen oranı ve yanlış yazılan tutarı yakalar, yuvarlamayı değil.
 */
const VAT_LINE_TOLERANCE = { minCents: 2, share: 0.005 } as const;

/**
 * Tedarikçinin ülkesinden ve belgenin KDV'sinden rejim önerisi; Fransa dışından KDV'siz fatura ters yüklemedir (autoliquidation).
 * Ülkesi bilinmeyende öneri standart kalır, `exempt` hiç önerilmez: muafiyet belgenin konusundan okunur, ülkeden değil.
 */
export function suggestVatRegime(input: {
  supplierCountry: string | null | undefined;
  vatAmountCents: number | null | undefined;
}): DocumentVatRegime {
  if ((input.vatAmountCents ?? 0) > 0) return 'standard';
  if (input.supplierCountry && input.supplierCountry !== BUSINESS_VAT_COUNTRY) return 'reverse_charge';
  return 'standard';
}

/** Kırılımın toplamları (cent); satırsız belgede KDV `null`, çünkü belgede yazmıyordur. */
export function vatLinesTotals(lines: readonly DocumentVatLine[]): { netCents: number; vatCents: number | null; grossCents: number } {
  const netCents = lines.reduce((sum, line) => sum + line.netCents, 0);
  const vatCents = lines.length === 0 ? null : lines.reduce((sum, line) => sum + line.vatCents, 0);
  return { netCents, vatCents, grossCents: netCents + (vatCents ?? 0) };
}

/** Oranın KDV hariç tutardan beklediği KDV (cent). */
export function expectedVatCents(netCents: number, vatRate: number): number {
  return addVat(netCents, vatRate) - netCents;
}

function vatOffRate(line: DocumentVatLine): boolean {
  const expected = expectedVatCents(line.netCents, line.vatRate);
  return Math.abs(line.vatCents - expected) > Math.max(VAT_LINE_TOLERANCE.minCents, Math.round(expected * VAT_LINE_TOLERANCE.share));
}

/** Kırılım ister mi: ödeyeceğimiz fatura ve fiş, muaf olmadıkça; muhasebeye giden alış belgesi bu kümedir. */
export function vatLinesRequired(document: { kind: DocumentKind; direction: MovementDirection; vatRegime: DocumentVatRegime }): boolean {
  return (document.kind === 'invoice' || document.kind === 'receipt') && document.direction === 'out' && document.vatRegime !== 'exempt';
}

export type DocumentVatProblem =
  'vat_lines_required' | 'vat_with_regime' | 'vat_rate_duplicate' | 'vat_rate_mismatch' | 'vat_total_mismatch';

/**
 * Belgenin KDV'sinin ilk sorunu: veri kısıtlarının (`money_document_vat_*`) okunur hâli ve onların tutamadığı iki kural, kırılımın
 * zorunluluğu ve KDV'nin orana uyması. Ters yüklemede satırın KDV'si sıfırdır, muaf belgenin satırı olmaz.
 */
export function documentVatProblem(document: {
  kind: DocumentKind;
  direction: MovementDirection;
  vatRegime: DocumentVatRegime;
  amountCents: number;
  vatLines: readonly DocumentVatLine[];
}): DocumentVatProblem | null {
  const lines = document.vatLines;
  if (lines.length === 0) return vatLinesRequired(document) ? 'vat_lines_required' : null;
  if (document.vatRegime === 'exempt') return 'vat_with_regime';
  if (document.vatRegime === 'reverse_charge' && lines.some((line) => line.vatCents > 0)) return 'vat_with_regime';
  if (new Set(lines.map((line) => line.vatRate)).size !== lines.length) return 'vat_rate_duplicate';
  if (document.vatRegime === 'standard' && lines.some(vatOffRate)) return 'vat_rate_mismatch';
  return vatLinesTotals(lines).grossCents === document.amountCents ? null : 'vat_total_mismatch';
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

export type DocumentBusiness = { business: Business } | { problem: 'business_required' | 'business_stock_mismatch' };

/**
 * Belgenin işi: mal kabule bağlı belgede deponun, tedarik siparişine bağlı belgede siparişin işi, değilse açık seçim, tedarikçinin ya da
 * carinin varsayılanı. Bağla çelişen seçim ve hiçbir kaynağın iş söylemediği belge reddedilir, çünkü sessiz bir varsayılan belgeyi yanlış işe
 * yazardı.
 */
export function documentBusinessOf(input: {
  stockBusiness: Business | null | undefined;
  chosen: Business | null | undefined;
  supplierDefault: Business | null | undefined;
  counterpartyDefault: Business | null | undefined;
}): DocumentBusiness {
  if (input.stockBusiness) {
    return input.chosen && input.chosen !== input.stockBusiness
      ? { problem: 'business_stock_mismatch' }
      : { business: input.stockBusiness };
  }
  const business = input.chosen ?? input.supplierDefault ?? input.counterpartyDefault;
  return business ? { business } : { problem: 'business_required' };
}
