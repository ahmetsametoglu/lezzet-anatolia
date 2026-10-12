import { addDays, toCents } from '@lezzet/helper';
import {
  DOCUMENT_VAT_RATES,
  type DocumentVatLine,
  type DocumentVatRate,
  type DocumentVatRegime,
  type SalesInvoiceCandidate,
  type SalesInvoiceGap,
  type UserProfile,
} from '@lezzet/types';
import { isValidSiret, normalizeSiret } from '../identity/b2b-application';
import { isZeroRated } from '../tax/vat-treatment';
import { vatLinesOf, type SaleVatBasis } from './export';
import type { AccountingLine } from './line';

/**
 * Satış faturasının saf kararları (docs/feature/profesyonel-satis.md): fatura ne zaman ve hangi satışlarla açılır, neden bekler,
 * vadesi ve tutarı. Tutar muhasebe dökümünün KDV kırılımından gelir, çünkü fatura ile döküm aynı satışı iki ayrı hesapla yazmamalı.
 */

/** Bozulabilir gıdada toplu faturanın vadesi teslimin on günlük diliminin bitiminden en çok 30 gündür (L441-11); kural herkese. */
export const SALES_INVOICE_SLICE_TERM_DAYS = 30;

/** Ay sonu faturası ayın son günü Paris saatiyle akşam sekizden sonra açılır; günün teslimleri o saatte çoğunlukla bitmiştir. */
export const MONTH_END_INVOICE_MINUTE = 20 * 60;

/** Günün ayının son günü. */
function monthEndOf(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * Satışın faturası şimdi açılır mı: teslim başına modda hemen; ay sonu modunda satışın ayının son günü akşamı ya da ay geçtiyse.
 * Ay sonu faturası en geç ayın son günü kesilir (CGI madde 289).
 */
export function salesInvoiceOpensNow(
  sale: Pick<SalesInvoiceCandidate, 'invoiceMode' | 'saleDate'>,
  now: { day: string; minutes: number },
): boolean {
  if (sale.invoiceMode === 'per_delivery') return true;
  const monthEnd = monthEndOf(sale.saleDate);
  return now.day > monthEnd || (now.day === monthEnd && now.minutes >= MONTH_END_INVOICE_MINUTE);
}

/**
 * Aynı faturaya giren satışlar: teslim başına modda her satış tek başına; ay sonu modunda müşteri, iş, ay ve KDV rejimi aynı
 * olanlar birlikte. İş ayrı faturadır, çünkü fatura işin şablonuyla kesilir; ters yüklemeli satış ayrıdır, çünkü fatura tek rejim taşır.
 */
export function salesInvoiceGroups<
  T extends Pick<SalesInvoiceCandidate, 'orderId' | 'customerId' | 'business' | 'saleDate' | 'vatTreatment' | 'invoiceMode'>,
>(sales: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const sale of sales) {
    const key =
      sale.invoiceMode === 'per_delivery'
        ? sale.orderId
        : [sale.customerId, sale.business, sale.saleDate.slice(0, 7), isZeroRated(sale.vatTreatment)].join('|');
    groups.set(key, [...(groups.get(key) ?? []), sale]);
  }
  return [...groups.values()];
}

/** SIRET'in ilk dokuz hanesi; geçersiz SIRET'ten SIREN çıkmaz. */
export function sirenOfSiret(siret: string | null | undefined): string | null {
  if (!siret || !isValidSiret(siret)) return null;
  return normalizeSiret(siret).slice(0, 9);
}

/** FR KDV numarası `FR` + iki denetim karakteri + SIREN'dir; başka ülkenin numarasından SIREN çıkmaz. */
export function sirenOfVatNumber(vatNumber: string | null | undefined): string | null {
  const match = /^FR[0-9A-Z]{2}(\d{9})$/.exec((vatNumber ?? '').replace(/\s/g, '').toUpperCase());
  return match ? match[1]! : null;
}

/**
 * Kesmeyi bekleten eksikler: Fransız alıcı faturaya SIREN'iyle yönlenir, AB'deki alıcının SIREN'i olmaz ve geçerli KDV numarasıyla
 * yönlenir. Fatura adresi ve B2B onayı her faturanın şartıdır.
 */
export function salesInvoiceGaps(
  customer: Pick<UserProfile, 'country' | 'companyInfo' | 'vatNumber' | 'vatNumberValid' | 'b2bApproved'>,
  hasBillingAddress: boolean,
): SalesInvoiceGap[] {
  const identified =
    customer.country === 'FR'
      ? sirenOfSiret(customer.companyInfo?.siret) !== null || sirenOfVatNumber(customer.vatNumber) !== null
      : customer.vatNumberValid === true;
  const gaps: SalesInvoiceGap[] = [];
  if (!identified) gaps.push('siren');
  if (!hasBillingAddress) gaps.push('billing_address');
  if (customer.b2bApproved !== true) gaps.push('b2b_approval');
  return gaps;
}

/** Günün on günlük diliminin son günü: ayın 10'u, 20'si ya da son günü. */
export function tenDaySliceEnd(day: string): string {
  const date = Number(day.slice(8, 10));
  if (date <= 10) return `${day.slice(0, 8)}10`;
  if (date <= 20) return `${day.slice(0, 8)}20`;
  return monthEndOf(day);
}

/**
 * Vade: fatura günü + müşterinin vadesi, ama ilk teslimin on günlük diliminin bitiminden 30 günü geçmez; geç kesilen faturada
 * sınır fatura gününden önceye düşerse fatura kesildiği gün vadelidir.
 */
export function salesInvoiceDueOn(input: { issuedOn: string; termDays: number; firstDeliveryOn: string }): string {
  const byTerm = addDays(input.issuedOn, input.termDays);
  const cap = addDays(tenDaySliceEnd(input.firstDeliveryOn), SALES_INVOICE_SLICE_TERM_DAYS);
  const due = byTerm < cap ? byTerm : cap;
  return due < input.issuedOn ? input.issuedOn : due;
}

export interface SalesInvoiceTotals {
  amountCents: number;
  vatLines: DocumentVatLine[];
  vatRegime: DocumentVatRegime;
}

/**
 * Faturanın tutarı ve KDV kırılımı: her siparişin döküm kırılımı oran oran toplanır. Ters yüklemeli satış ile yurt içi satış aynı
 * faturaya giremez, çünkü fatura tek KDV rejimi taşır; çağıran onları ayrı faturalara böler.
 */
export function salesInvoiceTotals(parts: ReadonlyArray<{ sale: SaleVatBasis; items: readonly AccountingLine[] }>): SalesInvoiceTotals {
  const regimes = new Set(parts.map((part) => isZeroRated(part.sale.vatTreatment)));
  if (regimes.size > 1) throw new Error('Ters yüklemeli ve yurt içi satış aynı faturaya giremez');
  const byRate = new Map<DocumentVatRate, { netCents: number; vatCents: number }>();
  for (const part of parts) {
    for (const line of vatLinesOf(part.sale, part.items, true, true)) {
      const rate = DOCUMENT_VAT_RATES.find((candidate) => candidate === line.vatRate);
      if (rate === undefined) throw new Error(`Belgede olmayan KDV oranı: ${line.vatRate}`);
      const sum = byRate.get(rate) ?? { netCents: 0, vatCents: 0 };
      byRate.set(rate, { netCents: sum.netCents + toCents(line.net), vatCents: sum.vatCents + toCents(line.vat) });
    }
  }
  const vatLines = [...byRate.entries()]
    .filter(([, sum]) => sum.netCents > 0)
    .sort(([a], [b]) => a - b)
    .map(([vatRate, sum]) => ({ vatRate, netCents: sum.netCents, vatCents: sum.vatCents }));
  return {
    amountCents: vatLines.reduce((total, line) => total + line.netCents + line.vatCents, 0),
    vatLines,
    vatRegime: regimes.has(true) ? 'reverse_charge' : 'standard',
  };
}
