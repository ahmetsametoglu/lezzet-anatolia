import { removeVat } from '@lezzet/helper';
import {
  DOCUMENT_VAT_RATES,
  type Address,
  type Business,
  type DocumentVatRegime,
  type MoneyDocument,
  type PennylaneCustomer,
  type PennylaneCustomerDraft,
  type PennylaneCustomerInvoice,
  type PennylaneCustomerInvoiceDraft,
  type PennylaneCustomerInvoiceLine,
  type PennylaneCustomerPatch,
  type PennylaneLanguage,
  type UserProfile,
  type VatTreatment,
} from '@lezzet/types';
import { chargedShippingParts } from '../../delivery/shipping-fee';
import { chargedQtyOf, fulfilledLineAmountCents, fulfilledLineOf } from '../../payment/payment-status';
import { invoiceNoteOf, type SaleVatBasis } from '../export';
import type { AccountingLine } from '../line';
import { salesInvoiceCustomerName, sirenOfSiret, sirenOfVatNumber } from '../sales-invoice';
import { normalizedVat, pennylaneVatCode } from './document';

/**
 * Satış faturasının Pennylane'e yazımı; saf karar. Satırlar muhasebe dökümünün kalem ve kargo hesabından kurulur, Pennylane toplamı
 * satırlardan kendisi hesaplar ve fatura kesinleşmeden önce bizimkiyle karşılaştırılır.
 */

/** Satış faturasının Pennylane'e yazılamama sebebi; kesilmemiş fatura kuyrukta bekler ve muhasebeye bir kez haber gider. */
/** Satış faturasının bekleme sebebi; son üçü kesilmiş faturanın e-postasınındır, `pdf_pending` haber düşürmez. */
export type PennylaneSalesInvoiceBlock =
  | 'billing_address'
  | 'vat_code'
  | 'total_mismatch'
  | 'customer_ambiguous'
  | 'customer_taken'
  | 'pdf_pending'
  | 'no_email'
  | 'email_unconfigured';

/** İşin satış faturası şablonu ayardır (Pennylane şablon kimliği); boşsa fatura Pennylane'in varsayılan şablonuyla kesilir. */
export const PENNYLANE_INVOICE_TEMPLATE_KEYS: Record<Business, string> = {
  qualite: 'pennylane_invoice_template_qualite',
  lezzet: 'pennylane_invoice_template_lezzet',
};

/** Faturanın ve e-postasının dili fatura adresinin ülkesinden: Almanya'daki müşteri Almanca, öteki herkes Fransızca alır (karar 22). */
export type SalesInvoiceLocale = 'fr' | 'de';

export function salesInvoiceLocaleOf(billingCountry: Address['country']): SalesInvoiceLocale {
  return billingCountry === 'DE' ? 'de' : 'fr';
}

/** Kargo satırının adı, faturanın dilinde. */
export const SALES_INVOICE_SHIPPING_LABEL: Record<SalesInvoiceLocale, string> = { fr: 'Livraison', de: 'Lieferung' };

/** Müşterinin Pennylane dış referansı; ayna kaybolsa da müşteri ikinci kez açılmaz, aramayla bulunur. */
export const pennylaneCustomerReference = (customerId: string): string => `cus:${customerId}`;

/** Satış faturasının dış referansı belge kimliğidir; yarıda kalan kesme denemesinin taslağı aramayla bulunur. */
export const pennylaneSalesInvoiceReference = (documentId: string): string => `sinv:${documentId}`;

export function pennylaneLanguageOf(locale: SalesInvoiceLocale): PennylaneLanguage {
  return locale === 'de' ? 'de_DE' : 'fr_FR';
}

/** Müşterinin Pennylane'deki kimliği: SIRET'ten ya da FR KDV numarasından SIREN ve KDV numarası. */
export function pennylaneCustomerIdentity(
  customer: Pick<UserProfile, 'companyInfo' | 'vatNumber'>,
): Pick<PennylaneCustomerDraft, 'regNo' | 'vatNumber'> {
  return { regNo: sirenOfSiret(customer.companyInfo?.siret) ?? sirenOfVatNumber(customer.vatNumber), vatNumber: customer.vatNumber };
}

/** Şirket müşterisinin Pennylane kaydı: yasal ad, SIREN, KDV numarası ve fatura adresi; Pennylane fatura adresiz müşteri açmaz. */
export function pennylaneCustomerDraft(
  customer: Pick<UserProfile, 'id' | 'name' | 'email' | 'companyInfo' | 'vatNumber'>,
  billing: Pick<Address, 'line1' | 'line2' | 'postalCode' | 'city' | 'country'>,
): PennylaneCustomerDraft {
  return {
    name: salesInvoiceCustomerName(customer),
    externalReference: pennylaneCustomerReference(customer.id),
    ...pennylaneCustomerIdentity(customer),
    emails: customer.email ? [customer.email] : [],
    billingAddress: {
      address: [billing.line1, billing.line2].filter(Boolean).join(', '),
      postalCode: billing.postalCode,
      city: billing.city,
      countryAlpha2: billing.country,
    },
    language: pennylaneLanguageOf(salesInvoiceLocaleOf(billing.country)),
  };
}

/** Pennylane kayıt numarasındaki SIREN; kayıt SIREN ya da SIRET tutabilir. */
function sirenOfRegNo(regNo: string | null): string | null {
  const digits = (regNo ?? '').replace(/\D/g, '');
  return digits.length === 9 ? digits : sirenOfSiret(digits);
}

/** Kaydın kimlik anahtarları: kayıt numarasındaki ve FR KDV numarasındaki SIREN, KDV numarası. */
function identityKeys(party: Pick<PennylaneCustomer, 'regNo' | 'vatNumber'>): string[] {
  const vat = normalizedVat(party.vatNumber);
  const sirens = [sirenOfRegNo(party.regNo), sirenOfVatNumber(vat)].filter((siren): siren is string => siren !== null);
  return [...sirens.map((siren) => `siren:${siren}`), ...(vat ? [`vat:${vat}`] : [])];
}

/**
 * Pennylane'de aynı firmanın müşteri kayıtları: SIREN ya da KDV numarası tutanlar. Ad eşleştirilmez, çünkü aynı adı taşıyan iki firma
 * olabilir ve yanlış müşteriye kesilen fatura düzeltilemez.
 */
export function pennylaneCustomerCandidates<T extends Pick<PennylaneCustomer, 'regNo' | 'vatNumber'>>(
  customers: readonly T[],
  party: Pick<PennylaneCustomer, 'regNo' | 'vatNumber'>,
): T[] {
  const wanted = new Set(identityKeys(party));
  if (wanted.size === 0) return [];
  return customers.filter((customer) => identityKeys(customer).some((key) => wanted.has(key)));
}

/**
 * Pennylane'deki kaydın bizden farkı, fark yoksa `null`: unvan, kimlik ve fatura adresi bizdendir. SIRET tutan kaydın SIREN'i aynıysa
 * kimlik değişmiş sayılmaz; bizde boş olan alan Pennylane'deki değeri silmez, e-posta hiç karşılaştırılmaz.
 */
export function pennylaneCustomerPatch(current: PennylaneCustomer, draft: PennylaneCustomerDraft): PennylaneCustomerPatch | null {
  const patch: PennylaneCustomerPatch = {};
  if (current.name.trim() !== draft.name.trim()) patch.name = draft.name;
  if (draft.regNo && sirenOfRegNo(current.regNo) !== draft.regNo) patch.regNo = draft.regNo;
  if (draft.vatNumber && normalizedVat(current.vatNumber) !== normalizedVat(draft.vatNumber)) patch.vatNumber = draft.vatNumber;
  const address = current.billingAddress;
  const wanted = draft.billingAddress;
  const sameAddress =
    address !== null &&
    address.address.trim() === wanted.address.trim() &&
    address.postalCode.trim() === wanted.postalCode.trim() &&
    address.city.trim() === wanted.city.trim() &&
    address.countryAlpha2.toUpperCase() === wanted.countryAlpha2.toUpperCase();
  if (!sameAddress) patch.billingAddress = wanted;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Faturanın kalemi: muhasebe kalemi ve faturada okunacak adı. */
export type SalesInvoiceItem = AccountingLine & { label: string };

/** Ondalık dize; Pennylane birim fiyatı dize ister ve sondaki sıfırlar anlam taşımaz. */
const decimal = (cents: number, divisor = 1): string => String(Number((cents / divisor / 100).toFixed(6)));

/**
 * Faturanın satırları: kalem başına teslim edilen adet ve KDV hariç birim fiyat, kargo oran payı başına bir satır. Ters yüklemede
 * fiyat zaten KDV'sizdir; oranın Pennylane kodu yoksa (AB içi %20 ters yükleme) `null` döner ve fatura muhasebeciyle netleşir.
 */
export function pennylaneSalesInvoiceLines(
  orders: ReadonlyArray<{ sale: SaleVatBasis; items: readonly SalesInvoiceItem[]; shippingLabel: string }>,
  regime: DocumentVatRegime,
  partyCountry: string,
): PennylaneCustomerInvoiceLine[] | null {
  const lines: PennylaneCustomerInvoiceLine[] = [];
  const codeOf = (rate: number): string | null => {
    const known = DOCUMENT_VAT_RATES.find((candidate) => candidate === rate);
    return known === undefined ? null : pennylaneVatCode(known, regime, partyCountry);
  };
  const htOf = (sale: SaleVatBasis, cents: number, rate: number) =>
    regime === 'standard' && sale.pricesIncludeVat ? removeVat(cents, rate) : cents;
  for (const order of orders) {
    const charged: Array<{ vatRate: number; totalCents: number }> = [];
    for (const item of order.items) {
      const line = fulfilledLineOf(item);
      const qty = chargedQtyOf(line);
      if (qty <= 0) continue;
      const amountCents = fulfilledLineAmountCents(line);
      const code = codeOf(item.vatRate);
      if (code === null) return null;
      charged.push({ vatRate: item.vatRate, totalCents: amountCents });
      lines.push({
        label: item.label,
        quantity: qty,
        unit: 'piece',
        unitPrice: decimal(htOf(order.sale, amountCents, item.vatRate), qty),
        vatCode: code,
      });
    }
    // Kargo KDV dahil yazılır ve oran payıyla bölünür (dökümün `chargedShippingParts` kuralı); ters yüklemede KDV ayrılmaz.
    for (const part of chargedShippingParts(order.sale.shippingFeeCents, charged)) {
      const code = codeOf(part.vatRate);
      if (code === null) return null;
      const ht = regime === 'standard' ? removeVat(part.amountCents, part.vatRate) : part.amountCents;
      lines.push({ label: order.shippingLabel, quantity: 1, unit: 'piece', unitPrice: decimal(ht), vatCode: code });
    }
  }
  return lines;
}

/** Kesilecek faturanın taslağı; dış referans belge kimliğidir, ters yüklemede dökümün ibaresi faturaya basılır. */
export function pennylaneSalesInvoiceDraft(input: {
  documentId: string;
  customerId: number;
  date: string;
  deadline: string;
  templateId: number | null;
  language: SalesInvoiceLocale;
  vatTreatment: VatTreatment;
  lines: PennylaneCustomerInvoiceLine[];
}): PennylaneCustomerInvoiceDraft {
  return {
    customerId: input.customerId,
    date: input.date,
    deadline: input.deadline,
    externalReference: pennylaneSalesInvoiceReference(input.documentId),
    templateId: input.templateId,
    language: pennylaneLanguageOf(input.language),
    specialMention: invoiceNoteOf(input.vatTreatment),
    lines: input.lines,
  };
}

/** Pennylane'in satırlardan hesapladığı toplam bizimkiyle aynı mı; değilse fatura kesinleşmez, çünkü kesinleşen fatura düzeltilemez. */
export function pennylaneTotalsMatch(
  document: Pick<MoneyDocument, 'amountCents' | 'vatLines'>,
  invoice: Pick<PennylaneCustomerInvoice, 'amountCents' | 'netCents' | 'taxCents'>,
): boolean {
  const netCents = document.vatLines.reduce((sum, line) => sum + line.netCents, 0);
  const taxCents = document.vatLines.reduce((sum, line) => sum + line.vatCents, 0);
  return invoice.amountCents === document.amountCents && invoice.netCents === netCents && invoice.taxCents === taxCents;
}
