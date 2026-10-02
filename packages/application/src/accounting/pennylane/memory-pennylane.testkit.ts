import type { PennylaneBankAccount, PennylaneChange, PennylaneTransaction } from '@lezzet/types';
import type { PennylanePort } from './port';

/**
 * Testlerin bellek içi Pennylane'i: ölçülen davranışı taklit eder (liste kimlik sırasıyla ve sayfalı, imleç yalnız konumdur;
 * değişiklik akışı olayları işlendiği anla verir, aynı hareketin her değişikliği ayrı olaydır). `silently` akışa olay düşmeden
 * değiştirir, akışın kaçırdığı değişikliği kurar.
 */
export function memoryPennylane(opts: { pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 2;
  const bankAccounts = new Map<number, PennylaneBankAccount>();
  const transactions = new Map<number, PennylaneTransaction>();
  const events: PennylaneChange[] = [];
  let nextId = 31_309_700_000_000;
  let clock = Date.parse('2026-10-01T08:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();
  const record = (id: number, operation: PennylaneChange['operation']) => events.push({ id, operation, processedAt: tick() });

  /** İmleç sayfanın başlangıç sırasıdır; Pennylane'inki opaktır, buradaki ondan fazlasını söylemez. */
  const pageOf = <T>(rows: T[], cursor: string | null) => {
    const start = cursor ? Number(cursor) : 0;
    const end = start + pageSize;
    return { items: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
  };

  const port: PennylanePort = {
    company: async () => ({ id: 270612, name: 'Test şirketi', regNo: 'sandbox-270612' }),
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
  };
}
