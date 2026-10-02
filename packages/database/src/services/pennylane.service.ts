import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PennylaneAccountInsertSchema,
  PennylaneAccountSchema,
  PennylaneCursorSchema,
  PennylaneTransactionMirrorInsertSchema,
  PennylaneTransactionMirrorSchema,
  type PennylaneAccount,
  type PennylaneAccountInsert,
  type PennylaneCursor,
  type PennylaneTransactionMirror,
  type PennylaneTransactionMirrorInsert,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Banka hesabı ↔ Pennylane banka hesabı; anahtar `account_id` olduğu için yazım anahtarla yapılır. */
export class PennylaneAccountService extends BaseDbService<PennylaneAccount, PennylaneAccountInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'pennylane_account', PennylaneAccountSchema, PennylaneAccountInsertSchema, PennylaneAccountSchema as never);
  }

  /** Operatörün kurduğu küme, tek turda. */
  list(): Promise<PennylaneAccount[]> {
    return this.getAll(undefined, { orderBy: 'createdAt' });
  }

  findByPennylaneId(pennylaneBankAccountId: number): Promise<PennylaneAccount | null> {
    return this.getOneBy({ pennylaneBankAccountId });
  }

  save(row: PennylaneAccountInsert): Promise<PennylaneAccount> {
    return this.upsert(row, 'account_id');
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
