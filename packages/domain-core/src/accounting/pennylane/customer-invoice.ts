import { removeVat } from '@lezzet/helper';
import {
  DOCUMENT_VAT_RATES,
  type Address,
  type Business,
  type DocumentVatRegime,
  type MoneyDocument,
  type PennylaneCustomerDraft,
  type PennylaneCustomerInvoice,
  type PennylaneCustomerInvoiceDraft,
  type PennylaneCustomerInvoiceLine,
  type PennylaneLanguage,
  type PreferredLanguage,
  type UserProfile,
  type VatTreatment,
} from '@lezzet/types';
import { chargedShippingParts } from '../../delivery/shipping-fee';
import { chargedQtyOf, fulfilledLineAmountCents, fulfilledLineOf } from '../../payment/payment-status';
import { invoiceNoteOf, type SaleVatBasis } from '../export';
import type { AccountingLine } from '../line';
import { sirenOfSiret, sirenOfVatNumber } from '../sales-invoice';
import { pennylaneVatCode } from './document';

/**
 * Satış faturasının Pennylane'e yazımı; saf karar. Satırlar muhasebe dökümünün kalem ve kargo hesabından kurulur, Pennylane toplamı
 * satırlardan kendisi hesaplar ve fatura kesinleşmeden önce bizimkiyle karşılaştırılır.
 */

/** Satış faturasının Pennylane'e yazılamama sebebi; kesilmemiş fatura kuyrukta bekler ve muhasebeye bir kez haber gider. */
export type PennylaneSalesInvoiceBlock = 'billing_address' | 'vat_code' | 'total_mismatch';

/** İşin satış faturası şablonu ayardır (Pennylane şablon kimliği); boşsa fatura Pennylane'in varsayılan şablonuyla kesilir. */
export const PENNYLANE_INVOICE_TEMPLATE_KEYS: Record<Business, string> = {
  qualite: 'pennylane_invoice_template_qualite',
  lezzet: 'pennylane_invoice_template_lezzet',
};

/** Faturanın dili; Pennylane Türkçe tanımaz, Türkçe konuşan müşteri faturayı Fransızca alır. */
export type SalesInvoiceLocale = 'fr' | 'de';

export function salesInvoiceLocaleOf(language: PreferredLanguage): SalesInvoiceLocale {
  return language === 'de' ? 'de' : 'fr';
}

/** Kargo satırının adı, faturanın dilinde. */
export const SALES_INVOICE_SHIPPING_LABEL: Record<SalesInvoiceLocale, string> = { fr: 'Livraison', de: 'Lieferung' };

/** Müşterinin Pennylane dış referansı; ayna kaybolsa da müşteri ikinci kez açılmaz, aramayla bulunur. */
export const pennylaneCustomerReference = (customerId: string): string => `cus:${customerId}`;

/** Satış faturasının dış referansı belge kimliğidir; yarıda kalan kesme denemesinin taslağı aramayla bulunur. */
export const pennylaneSalesInvoiceReference = (documentId: string): string => `sinv:${documentId}`;

export function pennylaneLanguageOf(language: PreferredLanguage): PennylaneLanguage {
  return salesInvoiceLocaleOf(language) === 'de' ? 'de_DE' : 'fr_FR';
}

/** Şirket müşterisinin Pennylane kaydı: yasal ad, SIREN, KDV numarası ve fatura adresi; Pennylane fatura adresiz müşteri açmaz. */
export function pennylaneCustomerDraft(
  customer: Pick<UserProfile, 'id' | 'name' | 'email' | 'companyInfo' | 'vatNumber' | 'preferredLanguage'>,
  billing: Pick<Address, 'line1' | 'line2' | 'postalCode' | 'city' | 'country'>,
): PennylaneCustomerDraft {
  return {
    name: customer.companyInfo?.legalName || customer.name,
    externalReference: pennylaneCustomerReference(customer.id),
    regNo: sirenOfSiret(customer.companyInfo?.siret) ?? sirenOfVatNumber(customer.vatNumber),
    vatNumber: customer.vatNumber,
    emails: customer.email ? [customer.email] : [],
    billingAddress: {
      address: [billing.line1, billing.line2].filter(Boolean).join(', '),
      postalCode: billing.postalCode,
      city: billing.city,
      countryAlpha2: billing.country,
    },
    language: pennylaneLanguageOf(customer.preferredLanguage),
  };
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
  language: PreferredLanguage;
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
