import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PennylaneBankAccountMirrorInsertSchema,
  PennylaneBankAccountMirrorSchema,
  PennylaneCursorSchema,
  PennylaneMappedAccountSchema,
  PennylaneTransactionMirrorInsertSchema,
  PennylaneTransactionMirrorSchema,
  type PennylaneBankAccount,
  type PennylaneBankAccountMirror,
  type PennylaneBankAccountMirrorInsert,
  type PennylaneCursor,
  type PennylaneMappedAccount,
  type PennylaneTransactionMirror,
  type PennylaneTransactionMirrorInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

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
