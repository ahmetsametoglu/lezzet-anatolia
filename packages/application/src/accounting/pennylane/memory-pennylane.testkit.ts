import type {
  PennylaneBankAccount,
  PennylaneChange,
  PennylaneInvoiceDraft,
  PennylanePaymentStatus,
  PennylaneSupplierDraft,
  PennylaneTransaction,
} from '@lezzet/types';
import { PennylaneError } from './errors';
import type { PennylanePort } from './port';

/** İkizdeki fatura: yüklenen taslak, dosyası ve ödeme işareti; müşteri faturası yalnız başkasının girdiği faturadır. */
export type MemoryInvoice = Omit<PennylaneInvoiceDraft, 'externalReference'> & {
  id: number;
  kind: 'supplier' | 'customer';
  externalReference: string | null;
  fileId: number | null;
  paymentStatus: PennylanePaymentStatus | null;
};

/**
 * Testlerin bellek içi Pennylane'i, ölçülen davranışla: liste kimlik sırasıyla ve sayfalıdır, akış olayları işlendiği anla verir ve
 * eşlenen hareket faturalara açılma sırasıyla dağılır. `silently` akışa olay düşmeden değiştirir, akışın kaçırdığı değişikliği kurar.
 */
export function memoryPennylane(opts: { pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 2;
  const bankAccounts = new Map<number, PennylaneBankAccount>();
  const transactions = new Map<number, PennylaneTransaction>();
  const suppliers = new Map<number, PennylaneSupplierDraft & { id: number }>();
  const files = new Map<number, string>();
  const invoices = new Map<number, MemoryInvoice>();
  /** Hareket başına eşlenen faturalar. */
  const matches = new Map<number, number[]>();
  const failures = new Map<keyof PennylanePort, Error>();
  const failing = (method: keyof PennylanePort) => {
    const error = failures.get(method);
    if (!error) return;
    failures.delete(method);
    throw error;
  };
  const taken = (externalReference: string) =>
    new PennylaneError({
      code: 'validation',
      message: `Pennylane isteği reddetti (422): External reference has already been taken (${externalReference})`,
    });
  const events: PennylaneChange[] = [];
  let nextId = 31_309_700_000_000;
  let clock = Date.parse('2026-10-01T08:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();
  const record = (id: number, operation: PennylaneChange['operation']) => events.push({ id, operation, processedAt: tick() });

  const notFound = () => new PennylaneError({ code: 'not_found', message: 'Pennylane kaydı bulunamadı (404)' });
  /** Açık kalan: her hareket tutarını faturalara açılma sırasıyla dağıtır, önce açılan tam ödenir; eşleme sırası fark etmez. */
  const openOf = (invoiceId: number): number => {
    const open = new Map([...invoices.values()].map((row) => [row.id, row.lines.reduce((sum, line) => sum + line.grossCents, 0)]));
    for (const [transactionId, invoiceIds] of matches) {
      let left = transactions.get(transactionId)?.amountCents ?? 0;
      for (const id of [...invoiceIds].sort((x, y) => x - y)) {
        const pay = Math.min(left, open.get(id) ?? 0);
        open.set(id, (open.get(id) ?? 0) - pay);
        left -= pay;
      }
    }
    return open.get(invoiceId) ?? 0;
  };
  const view = (row: MemoryInvoice) => ({
    id: row.id,
    externalReference: row.externalReference,
    invoiceNumber: row.invoiceNumber,
    openCents: openOf(row.id),
  });

  /** İmleç sayfanın başlangıç sırasıdır; Pennylane'inki opaktır, buradaki ondan fazlasını söylemez. */
  const pageOf = <T>(rows: T[], cursor: string | null) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + pageSize;
    return { items: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
  };

  const port: PennylanePort = {
    company: async () => ({ id: 270612, name: 'Test şirketi', regNo: 'sandbox-270612', mode: 'sandbox' }),
    listBankAccounts: async () => [...bankAccounts.values()],
    listTransactions: async ({ bankAccountId, fromDate, cursor }) =>
      pageOf(
        [...transactions.values()].filter((row) => row.bankAccountId === bankAccountId && row.date >= fromDate).sort((a, b) => a.id - b.id),
        cursor,
      ),
    getTransaction: async (id) => transactions.get(id) ?? null,
    transactionChanges: async ({ since, cursor }) =>
      pageOf(
        events.filter((event) => since === null || Date.parse(event.processedAt) >= Date.parse(since)),
        cursor,
      ),
    findSupplier: async (externalReference) => {
      failing('findSupplier');
      const found = [...suppliers.values()].find((row) => row.externalReference === externalReference);
      return found ? { id: found.id, name: found.name, externalReference: found.externalReference, vatNumber: found.vatNumber } : null;
    },
    listSuppliers: async () =>
      [...suppliers.values()].map((row) => ({
        id: row.id,
        name: row.name,
        externalReference: row.externalReference,
        vatNumber: row.vatNumber,
      })),
    createSupplier: async (draft) => {
      failing('createSupplier');
      if ([...suppliers.values()].some((row) => row.externalReference === draft.externalReference)) throw taken(draft.externalReference);
      const id = (nextId += 1);
      suppliers.set(id, { ...draft, id });
      return { id, name: draft.name, externalReference: draft.externalReference, vatNumber: draft.vatNumber };
    },
    findInvoices: async (filter) => {
      failing('findInvoices');
      return [...invoices.values()]
        .filter((row) =>
          'externalReference' in filter
            ? row.externalReference === filter.externalReference
            : row.supplierId === filter.supplierId && row.invoiceNumber === filter.invoiceNumber,
        )
        .map(view);
    },
    getInvoice: async (id) => {
      const row = invoices.get(id);
      return row ? view(row) : null;
    },
    uploadFile: async ({ bytes, contentType }) => {
      failing('uploadFile');
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) {
        throw new PennylaneError({ code: 'validation', message: `Pennylane isteği reddetti (422): invalid content type: ${contentType}` });
      }
      const id = (nextId += 1);
      files.set(id, Buffer.from(bytes).toString('base64'));
      return id;
    },
    importInvoice: async ({ draft, fileId }) => {
      failing('importInvoice');
      const content = files.get(fileId);
      const sameFile = [...invoices.values()].find((row) => row.fileId !== null && files.get(row.fileId) === content);
      if (sameFile) return { status: 'duplicate_file', existingId: sameFile.id };
      if ([...invoices.values()].some((row) => row.externalReference === draft.externalReference)) throw taken(draft.externalReference);
      const id = (nextId += 1);
      const row: MemoryInvoice = { ...draft, id, kind: 'supplier', fileId, paymentStatus: null };
      invoices.set(id, row);
      return { status: 'imported', invoice: view(row) };
    },
    updateInvoice: async (id, patch) => {
      failing('updateInvoice');
      const row = invoices.get(id);
      if (!row) throw notFound();
      invoices.set(id, { ...row, ...patch });
    },
    setPaymentStatus: async (id, status) => {
      failing('setPaymentStatus');
      const row = invoices.get(id);
      if (!row) throw notFound();
      invoices.set(id, { ...row, paymentStatus: status });
    },
    transactionMatches: async (transactionId) => {
      failing('transactionMatches');
      return [...(matches.get(transactionId) ?? [])]
        .sort((x, y) => y - x)
        .map((invoiceId) => ({ invoiceId, kind: invoices.get(invoiceId)?.kind ?? 'supplier' }));
    },
    matchTransaction: async ({ invoiceId, transactionId }) => {
      failing('matchTransaction');
      if (!invoices.has(invoiceId) || !transactions.has(transactionId)) throw notFound();
      const current = matches.get(transactionId) ?? [];
      if (!current.includes(invoiceId)) matches.set(transactionId, [...current, invoiceId]);
      record(transactionId, 'update');
    },
    unmatchTransaction: async ({ invoiceId, transactionId }) => {
      failing('unmatchTransaction');
      if (!(matches.get(transactionId) ?? []).includes(invoiceId)) throw notFound();
      matches.delete(transactionId);
      record(transactionId, 'update');
    },
  };

  return {
    port,
    /** Akışın şimdiki anı; testin "bu andan sonrası" sorusu bununla kurulur. */
    now: () => new Date(clock).toISOString(),
    addBankAccount(name: string): number {
      const id = (nextId += 1);
      bankAccounts.set(id, { id, name, currency: 'EUR' });
      return id;
    },
    /** Hesap Pennylane'den kalkar; hareketleri de listeden düşer, akışa olay düşmez. */
    removeBankAccount(id: number): void {
      bankAccounts.delete(id);
      for (const row of [...transactions.values()]) if (row.bankAccountId === id) transactions.delete(row.id);
    },
    add(row: Omit<PennylaneTransaction, 'id' | 'archived' | 'updatedAt' | 'currency'>): number {
      const id = (nextId += 1);
      transactions.set(id, { ...row, id, currency: 'EUR', archived: false, updatedAt: tick() });
      record(id, 'insert');
      return id;
    },
    change(id: number, patch: Partial<Omit<PennylaneTransaction, 'id'>>, opts: { silently?: boolean } = {}): void {
      const row = transactions.get(id);
      if (!row) throw new Error(`bellek içi Pennylane: ${id} yok`);
      transactions.set(id, { ...row, ...patch, updatedAt: tick() });
      if (!opts.silently) record(id, 'update');
    },
    remove(id: number, opts: { silently?: boolean } = {}): void {
      transactions.delete(id);
      if (!opts.silently) record(id, 'delete');
    },
    invoices: () => [...invoices.values()],
    suppliers: () => [...suppliers.values()],
    /** Pennylane'e başkasının girdiği fatura: dış referansı bizim değildir, dosyası yoktur. */
    addForeignInvoice(
      row: Pick<MemoryInvoice, 'supplierId' | 'invoiceNumber'> & { kind?: MemoryInvoice['kind']; grossCents?: number },
    ): number {
      const id = (nextId += 1);
      invoices.set(id, {
        supplierId: row.supplierId,
        invoiceNumber: row.invoiceNumber,
        id,
        kind: row.kind ?? 'supplier',
        date: '2026-10-01',
        deadline: '2026-10-01',
        externalReference: '842FHEIKJD',
        lines: row.grossCents ? [{ grossCents: row.grossCents, vatCents: 0, vatCode: 'FR_200' }] : [],
        fileId: null,
        paymentStatus: null,
      });
      return id;
    },
    matchesOf: (transactionId: number) => [...(matches.get(transactionId) ?? [])].sort((x, y) => x - y),
    /** Yöntemin sonraki çağrısı bu hatayla düşer; düşen yazımın kuyrukta ertelenmesi böyle kurulur. */
    failNext(method: keyof PennylanePort, error: Error): void {
      failures.set(method, error);
    },
  };
}
