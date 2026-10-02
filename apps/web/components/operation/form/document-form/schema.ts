import { z } from 'zod';
import { documentDueOn, documentVatProblem, expectedVatCents, suggestVatRegime, vatLinesTotals } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import {
  DOCUMENT_VAT_RATES,
  DocumentKindEnum,
  DocumentVatLineSchema,
  DocumentVatRateSchema,
  DocumentVatRegimeEnum,
  MovementDirectionEnum,
  type DocumentKind,
  type DocumentVatLine,
  type DocumentVatRegime,
  type MovementDirection,
} from '@lezzet/types';
import { DOCUMENT_VAT_PROBLEM_LABEL } from './labels';

/**
 * Belge formunun şeması; Para ekranının "+ Belge" penceresi ile asistanın belge gövdesi aynı tanımı paylaşır. Faturanın para
 * künyesi (`InvoiceFields`) ayrı parça çünkü mal kabul ve faturalı sipariş gövdeleri de faturayı aynı alanlarla yazar; tutarlar
 * formda euro, kapıya giderken `toCents` ile cent olur.
 */

/** KDV kırılımının form satırı — tutarlar **EURO**, `null` = boş kutu; KDV hariç tutarı boş ya da sıfır satır sayılmaz. */
export const InvoiceVatLineSchema = DocumentVatLineSchema.pick({ vatRate: true }).extend({
  net: z.number().nonnegative().nullable(),
  vat: z.number().nonnegative().nullable(),
});
export type InvoiceVatLine = z.infer<typeof InvoiceVatLineSchema>;

export const InvoiceFieldsSchema = z.object({
  /** **EURO** — KDV dâhil belge toplamı; kırılım doluysa satırlardan yazılır (`settled`). */
  amount: z.number().positive().nullable(),
  /** KDV kırılımı, oran başına; belgenin KDV'sinin tek kaynağı. */
  vatLines: z.array(InvoiceVatLineSchema),
  vatRegime: DocumentVatRegimeEnum,
  /** Vade — `YYYY-MM-DD` ya da boş. */
  dueOn: z.string(),
});
export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>;

/** Kırılımın yeni satırı, kullanılmamış ilk oranla: oran tekrar etmez; dört oran da kullanıldıysa `null`. */
export function nextVatLine(lines: readonly InvoiceVatLine[]): InvoiceVatLine | null {
  const rate = DOCUMENT_VAT_RATES.find((candidate) => !lines.some((line) => line.vatRate === candidate));
  return rate === undefined ? null : { vatRate: rate, net: null, vat: null };
}

export function emptyInvoiceFields(): InvoiceFields {
  return {
    amount: null,
    vatLines: [{ vatRate: DocumentVatRateSchema.options[0].value, net: null, vat: null }],
    vatRegime: 'standard',
    dueOn: '',
  };
}

/** Önerinin faturası (cent) → formun alanları. */
export function invoiceFieldsOf(terms: {
  amountCents: number | null;
  vatLines: readonly DocumentVatLine[];
  vatRegime: DocumentVatRegime;
  dueOn: string | null;
}): InvoiceFields {
  return {
    amount: terms.amountCents === null ? null : fromCents(terms.amountCents),
    vatLines: terms.vatLines.map((line) => ({ vatRate: line.vatRate, net: fromCents(line.netCents), vat: fromCents(line.vatCents) })),
    vatRegime: terms.vatRegime,
    dueOn: terms.dueOn ?? '',
  };
}

/** Formun kırılımı → kapının satırları (cent): boş satır sayılmaz, ters yüklemede KDV sıfır, muaf belgede kırılım yok. */
export function vatLinesOf(invoice: Pick<InvoiceFields, 'vatLines' | 'vatRegime'>): DocumentVatLine[] {
  if (invoice.vatRegime === 'exempt') return [];
  return invoice.vatLines.flatMap((line) =>
    line.net === null || line.net <= 0
      ? []
      : [
          {
            vatRate: line.vatRate,
            netCents: toCents(line.net),
            vatCents: invoice.vatRegime === 'reverse_charge' ? 0 : toCents(line.vat ?? 0),
          },
        ],
  );
}

/** Belgenin KDV dâhil toplamı (cent): kırılım doluysa satırlardan, değilse toplam kutusundan; ikisi de boşsa `null`. */
export function invoiceTotalCents(invoice: InvoiceFields): number | null {
  const lines = vatLinesOf(invoice);
  if (lines.length > 0) return vatLinesTotals(lines).grossCents;
  return invoice.amount === null ? null : toCents(invoice.amount);
}

/** Belgenin KDV'si (cent); kırılımsız belgede `null`, çünkü belgede yazmıyordur. */
export function invoiceVatCents(invoice: Pick<InvoiceFields, 'vatLines' | 'vatRegime'>): number | null {
  return vatLinesTotals(vatLinesOf(invoice)).vatCents;
}

/** Satırın KDV hariç tutarı ya da oranı değişince KDV orandan yeniden yazılır; belgedeki KDV kalem kalem yuvarlandıysa operatör düzeltir. */
export function withVatFromRate(line: InvoiceVatLine): InvoiceVatLine {
  return { ...line, vat: line.net === null ? null : fromCents(expectedVatCents(toCents(line.net), line.vatRate)) };
}

/** Kırılım doluysa toplam kutusu satırlardan yazılır: kutu satırlardan ayrışmasın, rejim muafa dönünce son toplam kalsın. */
export function settled(invoice: InvoiceFields): InvoiceFields {
  const total = vatLinesOf(invoice).length > 0 ? invoiceTotalCents(invoice) : null;
  return total === null ? invoice : { ...invoice, amount: fromCents(total) };
}

/**
 * Rejim değişince toplam yeniden yazılır. Satırın KDV kutusu korunur: ters yüklemede kapıya sıfır gider (`vatLinesOf`), standarda
 * dönünce operatörün düzelttiği KDV geri gelir.
 */
export function withRegime(invoice: InvoiceFields, vatRegime: DocumentVatRegime): InvoiceFields {
  return vatRegime === invoice.vatRegime ? invoice : settled({ ...invoice, vatRegime });
}

/** Faturanın türü ve yönü; mal kabul ve sipariş gövdelerinde fatura hep tedarikçinin ödenecek faturasıdır. */
interface InvoiceSubject {
  kind: DocumentKind;
  direction: MovementDirection;
}
const SUPPLIER_INVOICE: InvoiceSubject = { kind: 'invoice', direction: 'out' };

/** Faturanın engeli, tek cümlede. KDV kuralı motordan (`documentVatProblem`): kapı ve veri kısıtı aynı kuralı sorar. */
export function invoiceBlock(invoice: InvoiceFields, issuedOn: string, subject: InvoiceSubject = SUPPLIER_INVOICE): string | null {
  const amountCents = invoiceTotalCents(invoice) ?? 0;
  const problem = documentVatProblem({ ...subject, vatRegime: invoice.vatRegime, amountCents, vatLines: vatLinesOf(invoice) });
  if (problem) return DOCUMENT_VAT_PROBLEM_LABEL[problem];
  if (amountCents <= 0) return 'Belge toplamı sıfırdan büyük olmalı.';
  if (invoice.dueOn && issuedOn && invoice.dueOn < issuedOn) return 'Vade belgenin tarihinden önce olamaz.';
  return null;
}

/** Fatura alanları → kapının cent'li girdisi. */
export function invoiceTermsOf(invoice: InvoiceFields): {
  amountCents: number;
  vatLines: DocumentVatLine[];
  vatRegime: DocumentVatRegime;
  dueOn: string | null;
} {
  return {
    amountCents: invoiceTotalCents(invoice) ?? 0,
    vatLines: vatLinesOf(invoice),
    vatRegime: invoice.vatRegime,
    dueOn: invoice.dueOn || null,
  };
}

/** Tedarikçi seçeneği — ülkesi ve vadesiyle: faturanın rejimi ve vadesi bunlardan önerilir. */
export interface SupplierOption {
  value: string;
  label: string;
  country: string | null;
  paymentTermDays: number | null;
}

/**
 * Tedarikçi seçilince faturanın ÖNERİLERİ — rejim ülkesinden (`suggestVatRegime`), vade kartın
 * vadesinden (`documentDueOn`). Operatörün yazdığı vade ezilmez; rejim her seçimde yeniden önerilir çünkü
 * önceki tedarikçinin rejimi yenisine taşınmamalı.
 */
export function supplierSuggestion(
  supplier: SupplierOption | undefined,
  invoice: InvoiceFields,
  issuedOn: string,
): Pick<InvoiceFields, 'vatRegime' | 'dueOn'> {
  return {
    vatRegime: suggestVatRegime({ supplierCountry: supplier?.country, vatAmountCents: invoiceVatCents(invoice) }),
    dueOn: invoice.dueOn || (supplier ? (documentDueOn(issuedOn, supplier.paymentTermDays) ?? '') : ''),
  };
}

/**
 * "Neyin faturası" seçeneği: değer `intake:<kimlik>` ya da `order:<kimlik>`. Soru tek olduğu için tek seçicide iki tür: mal
 * geldiyse kabul, mal gelmeden kesildiyse sipariş.
 */
export interface StockLinkOption {
  value: string;
  label: string;
}

export function parseStockLink(value: string): { stockIntakeId: string | null; purchaseOrderId: string | null } {
  const [kind, id] = value.split(':');
  return { stockIntakeId: kind === 'intake' && id ? id : null, purchaseOrderId: kind === 'order' && id ? id : null };
}

export const DocumentFormSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string(),
  issuedOn: z.string(),
  /** Cari — boş dize = cari değil. Tedarikçiyle birlikte seçilemez. */
  counterpartyId: z.string(),
  /** Boş dize = tedarikçi değil. */
  supplierId: z.string(),
  /** Neyin faturası — `parseStockLink` biçimi; boş = bağsız. Yalnız tedarikçinin ödenecek belgesinde. */
  stockLink: z.string(),
  direction: MovementDirectionEnum,
  /** Belgenin türü — boş dize = türsüz; ödemesi bağlanınca harekete de geçer. */
  nature: z.string(),
  tags: z.array(z.string()),
  note: z.string(),
  invoice: InvoiceFieldsSchema,
});
export type DocumentForm = z.infer<typeof DocumentFormSchema>;

export function emptyDocumentForm(today: string): DocumentForm {
  return {
    kind: 'invoice',
    number: '',
    issuedOn: today,
    counterpartyId: '',
    supplierId: '',
    stockLink: '',
    direction: 'out',
    nature: '',
    tags: [],
    note: '',
    invoice: emptyInvoiceFields(),
  };
}

/** Kaydetmenin engeli, tek cümlede — "neden düğme kapalı" sorusunun cevabı. */
export function documentBlock(values: DocumentForm): string | null {
  if (!values.issuedOn) return 'Belgenin tarihi seçilmeli.';
  if (!values.counterpartyId && !values.supplierId) return 'Karşı taraf seçilmeli — cari ya da tedarikçi.';
  return invoiceBlock(values.invoice, values.issuedOn, values);
}

/** Form → belge kapısının girdisi (`createDocumentAction`). Seçici "seçilmedi"yi boş dizeyle söyler; kapı `null` bekler. */
export function documentInputOf(values: DocumentForm) {
  const terms = invoiceTermsOf(values.invoice);
  return {
    kind: values.kind,
    number: values.number,
    issuedOn: values.issuedOn,
    dueOn: terms.dueOn,
    counterpartyId: values.counterpartyId || null,
    supplierId: values.supplierId || null,
    // Bağ yalnız tedarikçinin ödenecek belgesinde anlamlı — öteki hâlde seçici çizilmiyor, kalıntı da gitmez.
    ...(values.supplierId && values.direction === 'out' ? parseStockLink(values.stockLink) : { stockIntakeId: null, purchaseOrderId: null }),
    direction: values.direction,
    nature: values.nature || null,
    amountCents: terms.amountCents,
    vatLines: terms.vatLines,
    vatRegime: terms.vatRegime,
    tags: values.tags,
    note: values.note,
  };
}
