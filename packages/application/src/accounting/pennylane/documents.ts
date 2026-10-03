import {
  CounterpartyService,
  MoneyAllocationService,
  MoneyDocumentService,
  MoneyMovementService,
  PennylaneDocumentService,
  PennylaneSupplierService,
  SupplierService,
  type Db,
} from '@lezzet/database';
import {
  checkDocumentFile,
  pennylaneDocumentScope,
  pennylaneInvoiceDraft,
  pennylaneInvoicePatch,
  pennylanePartyReference,
  pennylanePaymentStatus,
  pennylaneSupplierCandidates,
  type PennylaneDocumentBlock,
} from '@lezzet/domain-core';
import { privateReadUrl } from '@lezzet/storage';
import type { MoneyDocument, PennylaneCategory, PennylaneInvoiceDraft, PennylanePaymentStatus } from '@lezzet/types';
import { resolvePennylaneCategory, writeInvoiceCategory } from './category';
import { refreshPennylaneOpen } from './matches';
import type { PennylanePort } from './port';

/**
 * Alış belgesinin Pennylane'e yazımı (docs/feature/kasa-muhasebe.md §8, akış 2–3): kuyruktaki belgenin kararı motordan çıkar, karşı
 * tarafın tedarikçisi bulunur ya da açılır, belge yüklenir ya da farkı güncellenir, nakitle kapandıysa ödendi işaretlenir.
 */

/** Belgenin dosyası; okuma testte ağa çıkmayan bir kaynakla değiştirilir. */
export interface DocumentFileReader {
  read(fileKey: string): Promise<Uint8Array>;
}

export type DocumentWriteResult =
  { status: 'uploaded' | 'updated' | 'paid' | 'unchanged' | 'skipped' } | { status: 'blocked'; reason: PennylaneDocumentBlock };

/** Karşı taraf: tedarikçinin ülkesi ters yüklemenin kodunu seçer, carinin ülkesi tutulmaz. */
type Party =
  | { kind: 'supplier'; id: string; name: string; country: string | null; vatNumber: string | null; dueDays: number | null }
  | { kind: 'counterparty'; id: string; name: string };

export async function writeDocument(
  db: Db,
  pennylane: PennylanePort,
  documentId: string,
  ctx: { liveFrom: string; files: DocumentFileReader; category?: () => Promise<PennylaneCategory | null> },
): Promise<DocumentWriteResult> {
  const document = await new MoneyDocumentService(db).getById(documentId);
  if (!document) return { status: 'skipped' };
  const mirrors = new PennylaneDocumentService(db);
  const [mirror, party] = await Promise.all([mirrors.findByDocument(documentId), partyOf(db, document)]);
  const scope = pennylaneDocumentScope({
    document,
    partyCountry: party?.kind === 'supplier' ? party.country : null,
    liveFrom: ctx.liveFrom,
    uploaded: mirror !== null,
  });
  if (scope.kind === 'skip') return { status: 'skipped' };
  if (scope.kind === 'blocked') return { status: 'blocked', reason: scope.reason };
  // Kapsam karşı tarafı ve dosyayı denetledi; kayıt okunamadıysa da yazılmaz.
  if (!party) return { status: 'blocked', reason: 'no_party' };
  if (!document.fileKey) return { status: 'blocked', reason: 'no_file' };

  const supplier = await ensureSupplier(db, pennylane, party);
  if (supplier.status === 'blocked') return supplier;
  const draft = pennylaneInvoiceDraft(document, supplier.id, scope.lines);
  let invoiceId: number;
  let outcome: 'uploaded' | 'updated' | 'unchanged';
  if (!mirror) {
    const uploaded = await upload(pennylane, document.fileKey, draft, ctx.files);
    if (uploaded.status === 'blocked') return uploaded;
    invoiceId = uploaded.invoiceId;
    await mirrors.save({ documentId, pennylaneInvoiceId: invoiceId, written: draft });
    await refreshPennylaneOpen(db, pennylane, [invoiceId]);
    outcome = 'uploaded';
  } else {
    invoiceId = mirror.pennylaneInvoiceId;
    const patch = pennylaneInvoicePatch(mirror.written, draft);
    if (patch?.invoiceNumber && (await numberTaken(pennylane, draft.supplierId, patch.invoiceNumber, invoiceId))) {
      return { status: 'blocked', reason: 'duplicate_number' };
    }
    if (patch) {
      await pennylane.updateInvoice(invoiceId, patch);
      await mirrors.save({ documentId, pennylaneInvoiceId: invoiceId, written: draft });
      await refreshPennylaneOpen(db, pennylane, [invoiceId]);
    }
    outcome = patch ? 'updated' : 'unchanged';
  }
  const categorized = await writeInvoiceCategory(db, pennylane, {
    documentId,
    invoiceId,
    written: mirror?.categoryId ?? null,
    category: await (ctx.category ?? (() => resolvePennylaneCategory(db, pennylane)))(),
  });
  const paid = await writePaymentStatus(db, pennylane, document, invoiceId, mirror?.paymentStatus ?? null);
  if (outcome !== 'unchanged') return { status: outcome };
  return { status: paid ? 'paid' : categorized ? 'updated' : 'unchanged' };
}

/**
 * Yarıda kalan yükleme dış referansla bulunur, aynı tedarikçide aynı numara Pennylane'e sorulur. Aynı içerikli dosya başka faturada
 * duruyorsa belge bekler: Pennylane'e elle girilmiş faturayı sahiplenmek, sonraki yazımla o kaydı ezmek olurdu.
 */
async function upload(
  pennylane: PennylanePort,
  fileKey: string,
  draft: PennylaneInvoiceDraft,
  files: DocumentFileReader,
): Promise<{ status: 'uploaded'; invoiceId: number } | { status: 'blocked'; reason: PennylaneDocumentBlock }> {
  const [existing] = await pennylane.findInvoices({ externalReference: draft.externalReference });
  if (existing) return { status: 'uploaded', invoiceId: existing.id };
  if (draft.invoiceNumber && (await numberTaken(pennylane, draft.supplierId, draft.invoiceNumber, null))) {
    return { status: 'blocked', reason: 'duplicate_number' };
  }

  const file = checkDocumentFile(fileKey);
  if (!file.ok) return { status: 'blocked', reason: 'file_type' };
  const fileId = await pennylane.uploadFile({
    bytes: await files.read(fileKey),
    contentType: file.contentType,
    filename: `${(draft.invoiceNumber ?? 'belge').replace(/[^\w.-]+/g, '-')}.${file.extension}`,
  });
  const imported = await pennylane.importInvoice({ draft, fileId });
  return imported.status === 'imported'
    ? { status: 'uploaded', invoiceId: imported.invoice.id }
    : { status: 'blocked', reason: 'duplicate_file' };
}

/** Aynı tedarikçide aynı numaralı başka fatura var mı; Pennylane bunu kendisi yakalamıyor. */
async function numberTaken(
  pennylane: PennylanePort,
  supplierId: number,
  invoiceNumber: string,
  ownInvoiceId: number | null,
): Promise<boolean> {
  const found = await pennylane.findInvoices({ supplierId, invoiceNumber });
  return found.some((invoice) => invoice.id !== ownInvoiceId);
}

/**
 * Karşı tarafın Pennylane'deki tedarikçisi: aynada yoksa dış referansla, o da yoksa aynı firmanın elle açılmış kaydı aranır, hiçbiri
 * yoksa açılır. Uyan birden çok kayıt ya da bizde başka karşı tarafa bağlı kayıt seçilemez, belge bekler.
 */
async function ensureSupplier(
  db: Db,
  pennylane: PennylanePort,
  party: Party,
): Promise<{ status: 'ok'; id: number } | { status: 'blocked'; reason: PennylaneDocumentBlock }> {
  const mirrors = new PennylaneSupplierService(db);
  const key = party.kind === 'supplier' ? { supplierId: party.id } : { counterpartyId: party.id };
  const mirror = await mirrors.findByParty(key);
  if (mirror) return { status: 'ok', id: mirror.pennylaneId };
  const reference = pennylanePartyReference(key);
  const vatNumber = party.kind === 'supplier' ? party.vatNumber : null;
  let supplier = await pennylane.findSupplier(reference);
  if (!supplier) {
    const candidates = pennylaneSupplierCandidates(await pennylane.listSuppliers(), { name: party.name, vatNumber });
    if (candidates.length > 1) return { status: 'blocked', reason: 'supplier_ambiguous' };
    supplier = candidates[0] ?? null;
  }
  if (supplier && (await mirrors.findByPennylaneId(supplier.id))) return { status: 'blocked', reason: 'supplier_taken' };
  supplier ??= await pennylane.createSupplier({
    name: party.name,
    externalReference: reference,
    vatNumber,
    dueDays: party.kind === 'supplier' ? party.dueDays : null,
  });
  await mirrors.save({
    pennylaneId: supplier.id,
    supplierId: party.kind === 'supplier' ? party.id : null,
    counterpartyId: party.kind === 'counterparty' ? party.id : null,
  });
  return { status: 'ok', id: supplier.id };
}

async function partyOf(db: Db, document: MoneyDocument): Promise<Party | null> {
  if (document.supplierId) {
    const supplier = await new SupplierService(db).getById(document.supplierId);
    return supplier
      ? {
          kind: 'supplier',
          id: supplier.id,
          name: supplier.name,
          country: supplier.country,
          vatNumber: supplier.vatNumber,
          dueDays: supplier.paymentTermDays,
        }
      : null;
  }
  if (document.counterpartyId) {
    const counterparty = await new CounterpartyService(db).getById(document.counterpartyId);
    return counterparty ? { kind: 'counterparty', id: counterparty.id, name: counterparty.name } : null;
  }
  return null;
}

/** Ödeme durumu belgenin açık kalanından ve bağlı hareketlerin kaynağından; açık kalan okunamazsa hiçbir işaret yazılmaz. */
async function writePaymentStatus(
  db: Db,
  pennylane: PennylanePort,
  document: MoneyDocument,
  invoiceId: number,
  written: PennylanePaymentStatus | null,
): Promise<boolean> {
  const [balances, allocations] = await Promise.all([
    new MoneyDocumentService(db).balances([document.id]),
    new MoneyAllocationService(db).listByDocuments([document.id]),
  ]);
  const balance = balances.get(document.id);
  if (!balance) return false;
  const movements = await new MoneyMovementService(db).listByIds(allocations.map((allocation) => allocation.movementId));
  const bank = new Map(movements.map((movement) => [movement.id, movement.source === 'bank_import']));
  const status = pennylanePaymentStatus({
    openAmountCents: balance.openAmountCents,
    allocations: allocations.map((allocation) => ({ bank: bank.get(allocation.movementId) ?? false })),
    written,
  });
  if (!status) return false;
  await pennylane.setPaymentStatus(invoiceId, status);
  await new PennylaneDocumentService(db).setPaymentStatus(document.id, status);
  return true;
}

/** Özel kovanın tek okuma yolu imzalı adrestir. */
export const privateDocumentFiles: DocumentFileReader = {
  async read(fileKey) {
    const url = await privateReadUrl(fileKey);
    if (!url) throw new Error('belge dosyası okunamadı: özel kova yapılandırılmamış');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`belge dosyası okunamadı (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  },
};
