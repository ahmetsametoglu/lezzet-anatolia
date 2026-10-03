import { parisDateOf } from '@lezzet/helper';
import type {
  DocumentVatRate,
  DocumentVatRegime,
  MoneyDocument,
  PennylaneCategory,
  PennylaneInvoiceCategory,
  PennylaneInvoiceDraft,
  PennylaneInvoiceLine,
  PennylaneInvoicePatch,
  PennylanePaymentStatus,
} from '@lezzet/types';
import { checkDocumentFile } from '../../money/document-file';
import { BUSINESS_VAT_COUNTRY, documentVatProblem } from '../../money/document-terms';

/**
 * Alış belgesinin Pennylane'e yazımı; saf karar. Belge bizde girilir ve Pennylane'e bizden yüklenir, yüklenmiş belgenin değişikliği
 * fark olarak yazılır ve nakitle kapanan belge ödendi işaretini alır.
 */

/** AB üyeleri (ISO 3166-1 alfa-2); ters yüklemede AB içi karşı tarafın kodu `intracom_<oran>`, dışındakinin `extracom`. */
const EU_COUNTRIES = new Set('AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '));

const STANDARD_CODE: Record<DocumentVatRate, string> = { 2.1: 'FR_21', 5.5: 'FR_55', 10: 'FR_100', 20: 'FR_200' };
/** Pennylane'in listesinde AB içi %20 ters yükleme kodu yok; o belge muhasebeciyle netleşene kadar bekler. */
const INTRACOM_CODE: Partial<Record<DocumentVatRate, string>> = { 2.1: 'intracom_21', 5.5: 'intracom_55', 10: 'intracom_100' };

/** Satırın Pennylane oran kodu, karşılığı yoksa `null`; ters yüklemede ülkesi bilinmeyen karşı tarafın kodu seçilemez. */
export function pennylaneVatCode(rate: DocumentVatRate, regime: DocumentVatRegime, partyCountry: string | null): string | null {
  if (regime === 'exempt') return 'exempt';
  if (regime === 'standard') return STANDARD_CODE[rate];
  if (!partyCountry || partyCountry === BUSINESS_VAT_COUNTRY) return null;
  return EU_COUNTRIES.has(partyCountry) ? (INTRACOM_CODE[rate] ?? null) : 'extracom';
}

/** Belgenin Pennylane'e yazılamama sebebi; son dördü Pennylane okunarak bulunur. */
export type PennylaneDocumentBlock =
  | 'no_party'
  | 'no_file'
  | 'file_type'
  | 'vat'
  | 'vat_code'
  | 'kind_changed'
  | 'duplicate_number'
  | 'duplicate_file'
  | 'supplier_ambiguous'
  | 'supplier_taken';

type DocumentFields = Pick<
  MoneyDocument,
  | 'id'
  | 'kind'
  | 'direction'
  | 'number'
  | 'issuedOn'
  | 'dueOn'
  | 'supplierId'
  | 'counterpartyId'
  | 'amountCents'
  | 'vatLines'
  | 'vatRegime'
  | 'fileKey'
  | 'createdAt'
>;

export type PennylaneDocumentScope =
  { kind: 'skip' } | { kind: 'blocked'; reason: PennylaneDocumentBlock } | { kind: 'write'; lines: PennylaneInvoiceLine[] };

/**
 * Belge Pennylane'e gider mi: canlıya geçiş gününden sonra girilmiş, ödeyeceğimiz fatura ya da fiş. Yüklenmiş belge kapsamdan çıksa
 * da izlenir, çünkü Pennylane'deki faturası kalır.
 */
export function pennylaneDocumentScope(input: {
  document: DocumentFields;
  partyCountry: string | null;
  liveFrom: string;
  uploaded: boolean;
}): PennylaneDocumentScope {
  const { document } = input;
  if (!((document.kind === 'invoice' || document.kind === 'receipt') && document.direction === 'out')) {
    return input.uploaded ? { kind: 'blocked', reason: 'kind_changed' } : { kind: 'skip' };
  }
  if (!input.uploaded && parisDateOf(new Date(document.createdAt)) < input.liveFrom) return { kind: 'skip' };
  if (!document.supplierId && !document.counterpartyId) return { kind: 'blocked', reason: 'no_party' };
  if (!document.fileKey) return { kind: 'blocked', reason: 'no_file' };
  if (!checkDocumentFile(document.fileKey).ok) return { kind: 'blocked', reason: 'file_type' };
  if (documentVatProblem(document)) return { kind: 'blocked', reason: 'vat' };
  const lines = pennylaneLinesOf(document, input.partyCountry);
  return lines ? { kind: 'write', lines } : { kind: 'blocked', reason: 'vat_code' };
}

/** Muaf belgenin kırılımı olmaz, Pennylane'e tek `exempt` satırıyla gider. */
function pennylaneLinesOf(document: DocumentFields, partyCountry: string | null): PennylaneInvoiceLine[] | null {
  if (document.vatRegime === 'exempt') return [{ grossCents: document.amountCents, vatCents: 0, vatCode: 'exempt' }];
  const lines: PennylaneInvoiceLine[] = [];
  for (const line of document.vatLines) {
    const vatCode = pennylaneVatCode(line.vatRate, document.vatRegime, partyCountry);
    if (!vatCode) return null;
    lines.push({ grossCents: line.netCents + line.vatCents, vatCents: line.vatCents, vatCode });
  }
  return lines;
}

/** Faturanın Pennylane'deki dış referansı; tekil olduğu için yarıda kalan yükleme aramayla bulunur, ikinci kez yüklenmez. */
export const pennylaneDocumentReference = (documentId: string): string => `doc:${documentId}`;

/** Karşı tarafın Pennylane'deki tedarikçisinin dış referansı. */
export const pennylanePartyReference = (party: { supplierId: string } | { counterpartyId: string }): string =>
  'supplierId' in party ? `sup:${party.supplierId}` : `cp:${party.counterpartyId}`;

/** Belgenin taslağı; vadesi yoksa ödeme belge günündedir, Pennylane vadeyi zorunlu tutar. */
export function pennylaneInvoiceDraft(
  document: Pick<MoneyDocument, 'id' | 'number' | 'issuedOn' | 'dueOn'>,
  supplierId: number,
  lines: PennylaneInvoiceLine[],
): PennylaneInvoiceDraft {
  return {
    supplierId,
    date: document.issuedOn,
    deadline: document.dueOn ?? document.issuedOn,
    invoiceNumber: document.number?.trim() || null,
    externalReference: pennylaneDocumentReference(document.id),
    lines,
  };
}

/** Yüklenmiş faturanın farkı, fark yoksa `null`; satırlar alan alan karşılaştırılır, çünkü jsonb anahtar sırasını korumaz. */
export function pennylaneInvoicePatch(written: PennylaneInvoiceDraft, next: PennylaneInvoiceDraft): PennylaneInvoicePatch | null {
  const patch: PennylaneInvoicePatch = {};
  if (written.supplierId !== next.supplierId) patch.supplierId = next.supplierId;
  if (written.date !== next.date) patch.date = next.date;
  if (written.deadline !== next.deadline) patch.deadline = next.deadline;
  if (written.invoiceNumber !== next.invoiceNumber) patch.invoiceNumber = next.invoiceNumber;
  const sameLines =
    written.lines.length === next.lines.length &&
    written.lines.every((line, i) => {
      const other = next.lines[i]!;
      return line.grossCents === other.grossCents && line.vatCents === other.vatCents && line.vatCode === other.vatCode;
    });
  if (!sameLines) patch.lines = next.lines;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Pennylane'e yazılacak ödeme durumu, yazılacak bir şey yoksa `null`. Bağlı hareketi banka satırı olmayan ve tamamen kapanan belge
 * ödendi işaretini alır; bankadan ödenen belge Pennylane'de eşleşmeyle kapanır.
 */
export function pennylanePaymentStatus(input: {
  openAmountCents: number;
  allocations: ReadonlyArray<{ bank: boolean }>;
  written: PennylanePaymentStatus | null;
}): PennylanePaymentStatus | null {
  const paidOffline =
    input.openAmountCents <= 0 && input.allocations.length > 0 && input.allocations.every((allocation) => !allocation.bank);
  if (paidOffline) return input.written === 'paid' ? null : 'paid';
  return input.written === 'paid' ? 'to_be_paid' : null;
}

/** Belge satırındaki Pennylane durumu. */
export type PennylaneDocumentStatus =
  | { kind: 'uploaded' }
  | { kind: 'different'; pennylaneOpenCents: number }
  | { kind: 'pending' }
  | { kind: 'failing' }
  | { kind: 'blocked'; reason: string };

type PennylaneOpenMirror = { paymentStatus: PennylanePaymentStatus | null; pennylaneOpenCents: number | null };

/**
 * Pennylane'deki açık kalan bizimkinden ayrılıyorsa o kalan, ayrılmıyorsa `null`. Nakitle ödenen ya da kalanı okunmamış belge
 * karşılaştırılmaz, çünkü Pennylane "ödendi" işaretinde kalan tutarı düşürmüyor.
 */
export function pennylaneOpenDifference(openAmountCents: number, mirror: PennylaneOpenMirror): number | null {
  const pennylaneOpen = mirror.pennylaneOpenCents;
  if (mirror.paymentStatus === 'paid' || pennylaneOpen === null || pennylaneOpen === Math.max(0, openAmountCents)) return null;
  return pennylaneOpen;
}

/** Belgenin Pennylane durumu; Pennylane canlıya geçmemişse ya da belge kapsam dışıysa `null`, kuyruktaki belge kuyruğun hâlini söyler. */
export function pennylaneDocumentStatus(input: {
  live: boolean;
  openAmountCents: number;
  mirror: PennylaneOpenMirror | null;
  queue: { attempts: number; blockReason: string | null } | null;
}): PennylaneDocumentStatus | null {
  if (!input.live) return null;
  if (input.queue) {
    if (input.queue.blockReason) return { kind: 'blocked', reason: input.queue.blockReason };
    return input.queue.attempts > 0 ? { kind: 'failing' } : { kind: 'pending' };
  }
  if (!input.mirror) return null;
  const difference = pennylaneOpenDifference(input.openAmountCents, input.mirror);
  return difference === null ? { kind: 'uploaded' } : { kind: 'different', pennylaneOpenCents: difference };
}

const normalizedVat = (vat: string | null): string | null => vat?.replace(/[\s.-]/g, '').toUpperCase() || null;
/** Türkçe adın Fransızca yazılışı da tutsun: noktasız ı ayrışmayla i'ye inmez, ayrıca eşlenir. */
const normalizedName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Pennylane'de karşı tarafın firması olan tedarikçiler: KDV numarası tutanlar, tutan yoksa adı aynı olup KDV numarası çelişmeyenler.
 * Aynı şirketi kullanan başka operasyon tedarikçiyi elle açar ve Pennylane aynı firmanın ikinci kaydını reddetmez.
 */
export function pennylaneSupplierCandidates<T extends { name: string; vatNumber: string | null }>(
  suppliers: readonly T[],
  party: { name: string; vatNumber: string | null },
): T[] {
  const vat = normalizedVat(party.vatNumber);
  const byVat = vat ? suppliers.filter((supplier) => normalizedVat(supplier.vatNumber) === vat) : [];
  if (byVat.length > 0) return byVat;
  const name = normalizedName(party.name);
  return suppliers.filter((supplier) => normalizedName(supplier.name) === name && (!vat || !normalizedVat(supplier.vatNumber)));
}

/** Lezzet'in faturasına yazılan analitik kategorinin adı ayardır; boşsa kategori yazılmaz. */
export const PENNYLANE_CATEGORY_KEY = 'pennylane_category';
export const PENNYLANE_CATEGORY_DEFAULT = 'Lezzet';
/** Kategori Pennylane'de yoksa bu adlı grupta açılır. */
export const PENNYLANE_CATEGORY_GROUP = 'Activité';

/** Ada göre kayıt; büyük-küçük harf ve aksan farkı sayılmaz, aynı adlı birden çok kayıtta önce açılan seçilir. */
export function pennylaneByLabel<T extends { id: number; label: string }>(rows: readonly T[], label: string): T | null {
  const wanted = normalizedName(label);
  return [...rows].filter((row) => normalizedName(row.label) === wanted).sort((a, b) => a.id - b.id)[0] ?? null;
}

/**
 * Faturaya yazılacak kategoriler: bizim gruptaki kategori ağırlık 1 ile bizimki olur, öteki grupların kategorileri olduğu gibi kalır,
 * çünkü Pennylane yazımda faturanın bütün kategorilerini değiştirir. Fatura zaten öyleyse `null`.
 */
export function pennylaneInvoiceCategories(
  current: readonly PennylaneInvoiceCategory[],
  target: Pick<PennylaneCategory, 'id' | 'groupId'>,
): Array<{ id: number; weight: number }> | null {
  const sameGroup = current.filter((row) => row.groupId === target.groupId);
  if (sameGroup.length === 1 && sameGroup[0]!.id === target.id && sameGroup[0]!.weight === 1) return null;
  return [
    ...current.filter((row) => row.groupId !== target.groupId).map((row) => ({ id: row.id, weight: row.weight })),
    { id: target.id, weight: 1 },
  ];
}
