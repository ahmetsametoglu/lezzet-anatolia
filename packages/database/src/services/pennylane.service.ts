import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PennylaneBankAccountMirrorInsertSchema,
  PennylaneBankAccountMirrorSchema,
  PennylaneCursorSchema,
  PennylaneDocumentMirrorInsertSchema,
  PennylaneDocumentMirrorSchema,
  PennylaneMappedAccountSchema,
  PennylaneMatchRemovedInsertSchema,
  PennylaneMatchRemovedSchema,
  PennylaneQueueInsertSchema,
  PennylaneQueueSchema,
  PennylaneSupplierMirrorInsertSchema,
  PennylaneSupplierMirrorSchema,
  PennylaneTransactionMirrorInsertSchema,
  PennylaneTransactionMirrorSchema,
  type PennylaneBankAccount,
  type PennylaneBankAccountMirror,
  type PennylaneBankAccountMirrorInsert,
  type PennylaneCursor,
  type PennylaneDocumentMirror,
  type PennylaneDocumentMirrorInsert,
  type PennylaneMappedAccount,
  type PennylaneMatchRemoved,
  type PennylaneMatchRemovedInsert,
  type PennylanePaymentStatus,
  type PennylaneQueue,
  type PennylaneQueueInsert,
  type PennylaneSupplierMirror,
  type PennylaneSupplierMirrorInsert,
  type PennylaneTransactionMirror,
  type PennylaneTransactionMirrorInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { QueueDbService } from '../core/queue.service';

/** Pennylane'deki banka hesapları ve eşlemesi; anahtar Pennylane'in kimliğidir, banka hesabımız en fazla bir satıra eşlenir. */
export class PennylaneBankAccountService extends BaseDbService<PennylaneBankAccountMirror, PennylaneBankAccountMirrorInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'pennylane_bank_account',
      PennylaneBankAccountMirrorSchema,
      PennylaneBankAccountMirrorInsertSchema,
      PennylaneBankAccountMirrorSchema as never,
    );
  }

  /** Pennylane'deki hesap kümesi, tek turda. */
  list(): Promise<PennylaneBankAccountMirror[]> {
    return this.getAll(undefined, { orderBy: 'name' });
  }

  listMapped(): Promise<PennylaneMappedAccount[]> {
    return this.getAllAs(PennylaneMappedAccountSchema, undefined, { isNotNullFields: ['accountId'], orderBy: 'mappedAt' });
  }

  findByPennylaneId(pennylaneId: number): Promise<PennylaneBankAccountMirror | null> {
    return this.getOneBy({ pennylaneId });
  }

  findByAccount(accountId: string): Promise<PennylaneBankAccountMirror | null> {
    return this.getOneBy({ accountId });
  }

  /** Son okunan listeyi yazar, eşlemeye dokunmaz; listeden düşen hesabın satırı eski görülme anıyla kalır. */
  async saveSeen(accounts: readonly PennylaneBankAccount[], at: string): Promise<void> {
    for (const account of accounts) await this.upsert({ pennylaneId: account.id, name: account.name, seenAt: at }, 'pennylane_id');
  }

  /** Eşlenmemiş satırın `listedAt`ı kısıt gereği boştur; yeni eşlenen hesabın listesi sonraki turda canlıya geçiş gününden okunur. */
  async map(pennylaneId: number, accountId: string, at: string): Promise<void> {
    await this.updateWhereIn('pennylaneId', [String(pennylaneId)], { accountId, mappedAt: at });
  }

  async unmap(accountId: string): Promise<void> {
    await this.updateWhereIn('accountId', [accountId], { accountId: null, mappedAt: null, listedAt: null });
  }

  async markListed(accountIds: readonly string[], at: string | null): Promise<void> {
    await this.updateWhereIn('accountId', accountIds, { listedAt: at });
  }
}

/** Pennylane hareketinin son okunan hâli; anahtar Pennylane'in kimliğidir. */
export class PennylaneTransactionService extends BaseDbService<PennylaneTransactionMirror, PennylaneTransactionMirrorInsert, never> {
  /** Kolon `amount` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'pennylane_transaction',
      PennylaneTransactionMirrorSchema,
      PennylaneTransactionMirrorInsertSchema,
      PennylaneTransactionMirrorSchema as never,
    );
  }

  findByPennylaneId(pennylaneId: number): Promise<PennylaneTransactionMirror | null> {
    return this.getOneBy({ pennylaneId });
  }

  findByMovement(movementId: string): Promise<PennylaneTransactionMirror | null> {
    return this.getOneBy({ movementId });
  }

  /** Hesabın Pennylane'de silinmemiş hareketleri; liste baştan okununca aradaki silinme bunlardan bulunur. */
  listPresent(accountId: string): Promise<PennylaneTransactionMirror[]> {
    return this.getAll({ accountId, removed: false });
  }

  /** Hesabın Pennylane'den gelen son hareketinin günü; hiç gelmediyse `null`. */
  async latestValueDate(accountId: string): Promise<string | null> {
    const [latest] = await this.getAll({ accountId }, { orderBy: 'valueDate', orderDirection: 'desc', limit: 1 });
    return latest?.valueDate ?? null;
  }

  save(row: PennylaneTransactionMirrorInsert): Promise<PennylaneTransactionMirror> {
    return this.upsert({ ...row, readAt: new Date().toISOString() }, 'pennylane_id');
  }
}

/** Değişiklik akışının kaldığı an; akış başına tek satır. */
export class PennylaneCursorService extends BaseDbService<PennylaneCursor, PennylaneCursor, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'pennylane_cursor', PennylaneCursorSchema, PennylaneCursorSchema, PennylaneCursorSchema as never);
  }

  find(stream: PennylaneCursor['stream']): Promise<PennylaneCursor | null> {
    return this.getOneBy({ stream });
  }

  save(stream: PennylaneCursor['stream'], processedAt: string): Promise<PennylaneCursor> {
    return this.upsert({ stream, processedAt, updatedAt: new Date().toISOString() }, 'stream');
  }
}

/** Belgenin karşı tarafının Pennylane'deki tedarikçisi; anahtar Pennylane'in kimliğidir. */
export class PennylaneSupplierService extends BaseDbService<PennylaneSupplierMirror, PennylaneSupplierMirrorInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'pennylane_supplier',
      PennylaneSupplierMirrorSchema,
      PennylaneSupplierMirrorInsertSchema,
      PennylaneSupplierMirrorSchema as never,
    );
  }

  findByParty(party: { supplierId: string } | { counterpartyId: string }): Promise<PennylaneSupplierMirror | null> {
    return this.getOneBy(party);
  }

  findByPennylaneId(pennylaneId: number): Promise<PennylaneSupplierMirror | null> {
    return this.getOneBy({ pennylaneId });
  }

  save(row: PennylaneSupplierMirrorInsert): Promise<PennylaneSupplierMirror> {
    return this.upsert(row, 'pennylane_id');
  }
}

/** Alış belgesinin yazım kuyruğu; satırları belge ve bağ tetikleyicisi yazar, işleyen okur, erteler ve siler. */
export class PennylaneQueueService extends QueueDbService<PennylaneQueue, PennylaneQueueInsert> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'pennylane_queue', PennylaneQueueSchema, PennylaneQueueInsertSchema);
  }

  findByDocument(documentId: string): Promise<PennylaneQueue | null> {
    return this.getOneBy({ documentId });
  }

  findByMovement(movementId: string): Promise<PennylaneQueue | null> {
    return this.getOneBy({ movementId });
  }
}

/** Pennylane'deki fatura ve ona en son yazılan taslak; anahtar belge kimliğidir. */
export class PennylaneDocumentService extends BaseDbService<PennylaneDocumentMirror, PennylaneDocumentMirrorInsert, never> {
  /** Kolon `pennylane_open` euro `numeric`; app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['pennylaneOpenCents'];

  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'pennylane_document',
      PennylaneDocumentMirrorSchema,
      PennylaneDocumentMirrorInsertSchema,
      PennylaneDocumentMirrorSchema as never,
    );
  }

  findByDocument(documentId: string): Promise<PennylaneDocumentMirror | null> {
    return this.getOneBy({ documentId });
  }

  /** Pennylane'deki faturanın bizdeki belgesi; bir hareketin eşleşmeleri bizim mi, başka işin mi, bununla ayrılır. */
  listByInvoices(invoiceIds: readonly number[]): Promise<PennylaneDocumentMirror[]> {
    return invoiceIds.length === 0 ? Promise.resolve([]) : this.getAll({ pennylaneInvoiceId: [...invoiceIds] });
  }

  listByDocuments(documentIds: readonly string[]): Promise<PennylaneDocumentMirror[]> {
    return documentIds.length === 0 ? Promise.resolve([]) : this.getAll({ documentId: [...documentIds] });
  }

  async setPennylaneOpen(documentId: string, pennylaneOpenCents: number | null): Promise<void> {
    await this.updateWhereIn('documentId', [documentId], { pennylaneOpenCents, updatedAt: new Date().toISOString() });
  }

  save(row: PennylaneDocumentMirrorInsert): Promise<PennylaneDocumentMirror> {
    return this.upsert({ ...row, updatedAt: new Date().toISOString() }, 'document_id');
  }

  async setPaymentStatus(documentId: string, paymentStatus: PennylanePaymentStatus): Promise<void> {
    await this.updateWhereIn('documentId', [documentId], { paymentStatus, updatedAt: new Date().toISOString() });
  }
}

/** Pennylane'de çözülen bağ; bağ bizde durur ama yeniden yazılmaz. */
export class PennylaneMatchRemovedService extends BaseDbService<PennylaneMatchRemoved, PennylaneMatchRemovedInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'pennylane_match_removed',
      PennylaneMatchRemovedSchema,
      PennylaneMatchRemovedInsertSchema,
      PennylaneMatchRemovedSchema as never,
    );
  }

  listByAllocations(allocationIds: readonly string[]): Promise<PennylaneMatchRemoved[]> {
    return allocationIds.length === 0 ? Promise.resolve([]) : this.getAll({ allocationId: [...allocationIds] });
  }

  save(allocationId: string): Promise<PennylaneMatchRemoved> {
    return this.upsert({ allocationId }, 'allocation_id');
  }

  async remove(allocationId: string): Promise<void> {
    await this.deleteWhere({ allocationId });
  }
}
