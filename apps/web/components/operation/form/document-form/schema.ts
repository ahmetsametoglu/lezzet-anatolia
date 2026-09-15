import { z } from 'zod';
import { documentDueOn, suggestVatRegime, vatRegimeProblem } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DocumentKindEnum, DocumentVatRegimeEnum, MovementDirectionEnum, type DocumentVatRegime } from '@lezzet/types';

/**
 * **BELGE FORMUNUN ŞEMASI** — Para ekranının "+ Belge" penceresi ile asistan kuyruğunun belge gövdesi
 * aynı tanımı paylaşır (12.26 · 22.44; `movement-form`un gerekçesi: form iki yerde açılıyor, ikinci
 * yüzey için yeniden yazmak iki gerçek doğururdu).
 *
 * ── FATURANIN PARA KÜNYESİ AYRI BİR PARÇA ────────────────────────────────────
 * Toplam · KDV · KDV rejimi · vade dört alanı yalnız bu formun değil: asistanın mal kabul ve faturalı
 * tedarik siparişi gövdeleri de faturayı aynı dört alanla yazar. `InvoiceFields` o ortak parça —
 * engeli (`invoiceBlock`) ve cent'e çevrimi (`invoiceTermsOf`) tek yerde.
 *
 * Tutarlar formda **EURO** (kutu euro yazar), kapıya giderken `toCents` ile cent olur (`STACK §8`).
 */
export const InvoiceFieldsSchema = z.object({
  /** **EURO** — KDV dâhil belge toplamı. */
  amount: z.number().positive().nullable(),
  /** **EURO**; `null` = belgede KDV yazmıyor (sıfır "KDV yok" demek olurdu). */
  vatAmount: z.number().nonnegative().nullable(),
  vatRegime: DocumentVatRegimeEnum,
  /** Vade — `YYYY-MM-DD` ya da boş. */
  dueOn: z.string(),
});
export type InvoiceFields = z.infer<typeof InvoiceFieldsSchema>;

export function emptyInvoiceFields(): InvoiceFields {
  return { amount: null, vatAmount: null, vatRegime: 'standard', dueOn: '' };
}

const vatCentsOf = (invoice: Pick<InvoiceFields, 'vatAmount'>) => (invoice.vatAmount === null ? null : toCents(invoice.vatAmount));

/**
 * Faturanın engeli, tek cümlede. Rejim kuralı motordan (`vatRegimeProblem`) — kapı ve veri kısıtı aynı
 * kuralı soruyor, form ikinci bir kopya yazmıyor.
 */
export function invoiceBlock(invoice: InvoiceFields, issuedOn: string): string | null {
  if (!invoice.amount || invoice.amount <= 0) return 'Belge toplamı sıfırdan büyük olmalı.';
  if (invoice.vatAmount !== null && invoice.vatAmount > invoice.amount) return 'KDV, belge toplamını aşamaz — toplam KDV dâhildir.';
  if (vatRegimeProblem(invoice.vatRegime, vatCentsOf(invoice))) return 'Ters yüklemeli ya da muaf belgede KDV tutarı olamaz.';
  if (invoice.dueOn && issuedOn && invoice.dueOn < issuedOn) return 'Vade belgenin tarihinden önce olamaz.';
  return null;
}

/** Fatura alanları → kapının cent'li girdisi. */
export function invoiceTermsOf(invoice: InvoiceFields): {
  amountCents: number;
  vatAmountCents: number | null;
  vatRegime: DocumentVatRegime;
  dueOn: string | null;
} {
  return { amountCents: toCents(invoice.amount ?? 0), vatAmountCents: vatCentsOf(invoice), vatRegime: invoice.vatRegime, dueOn: invoice.dueOn || null };
}

/** Tedarikçi seçeneği — ülkesi ve vadesiyle: faturanın rejimi ve vadesi bunlardan önerilir (12.26). */
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
    vatRegime: suggestVatRegime({ supplierCountry: supplier?.country, vatAmountCents: vatCentsOf(invoice) }),
    dueOn: invoice.dueOn || (supplier ? (documentDueOn(issuedOn, supplier.paymentTermDays) ?? '') : ''),
  };
}

/**
 * "Neyin faturası" seçeneği (12.26) — değer `intake:<kimlik>` ya da `order:<kimlik>`. Tek seçicide iki
 * tür, çünkü soru tek: bu fatura hangi alımın? Mal geldiyse kabul, mal gelmeden kesildiyse sipariş.
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
  /** Cari (13.09) — boş dize = cari değil. Tedarikçiyle birlikte seçilemez. */
  counterpartyId: z.string(),
  /** Boş dize = tedarikçi değil. */
  supplierId: z.string(),
  /** Neyin faturası (12.26) — `parseStockLink` biçimi; boş = bağsız. Yalnız tedarikçinin ödenecek belgesinde. */
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
  return invoiceBlock(values.invoice, values.issuedOn);
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
    vatAmountCents: terms.vatAmountCents,
    vatRegime: terms.vatRegime,
    tags: values.tags,
    note: values.note,
  };
}
