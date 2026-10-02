import type { SupabaseClient } from '@supabase/supabase-js';
import { toCents } from '@lezzet/helper';
import {
  RegisterCashOpInsertSchema,
  RegisterCashOpSchema,
  RegisterCashOpUpdateSchema,
  RegisterDayMovementSchema,
  RegisterPaymentInsertSchema,
  RegisterPaymentRowSchema,
  RegisterPaymentUpdateSchema,
  RegisterProductInsertSchema,
  RegisterProductSchema,
  RegisterProductUpdateSchema,
  RegisterQueueSchema,
  RegisterQueueUpdateSchema,
  RegisterStoreInsertSchema,
  RegisterStoreSchema,
  RegisterTicketInsertSchema,
  RegisterTicketLineInsertSchema,
  RegisterTicketLineSchema,
  RegisterTicketLineUpdateSchema,
  RegisterTicketSchema,
  RegisterTicketUpdateSchema,
  type RegisterCashOp,
  type RegisterCashOpInsert,
  type RegisterCashOpUpdate,
  type RegisterDayMovement,
  type RegisterPaymentInsert,
  type RegisterPaymentRow,
  type RegisterPaymentUpdate,
  type RegisterProduct,
  type RegisterProductInsert,
  type RegisterProductUpdate,
  type RegisterQueue,
  type RegisterQueueUpdate,
  type RegisterStore,
  type RegisterStoreInsert,
  type RegisterTicket,
  type RegisterTicketInsert,
  type RegisterTicketLine,
  type RegisterTicketLineInsert,
  type RegisterTicketLineUpdate,
  type RegisterTicketUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

// Sertifikalı kasanın bizdeki aynası ve kuyruğu (docs/feature/kasa-muhasebe.md §7); servisler yalnız satır okur ve yazar, plan motordadır.

const writtenBetween = (field: string, from: string, to: string) => [
  { field, operator: 'gte' as const, value: from },
  { field, operator: 'lt' as const, value: to },
];

/** Mağaza eşlemesi; anahtar depo olduğu için yazım `upsert`, silme süzgeçle yapılır. */
export class RegisterStoreService extends BaseDbService<RegisterStore, RegisterStoreInsert, never> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_store', RegisterStoreSchema, RegisterStoreInsertSchema, RegisterStoreSchema as never);
  }

  /** Operatörün kurduğu küme, tek turda. */
  list(): Promise<RegisterStore[]> {
    return this.getAll(undefined, { orderBy: 'externalStoreId' });
  }

  findByWarehouse(warehouseId: string): Promise<RegisterStore | null> {
    return this.getOneBy({ warehouseId });
  }

  findByCashAccount(cashAccountId: string): Promise<RegisterStore | null> {
    return this.getOneBy({ cashAccountId });
  }

  save(row: RegisterStoreInsert): Promise<RegisterStore> {
    return this.upsert(row, 'warehouse_id');
  }

  async remove(warehouseId: string): Promise<void> {
    await this.deleteWhere({ warehouseId });
  }

  /**
   * Gün sonu, defter ↔ ayna: `[from, to)` aralığında açılmış hareketlerin kasada beklenen etkisi ve aynada yazılmış olanı. Hesap
   * `register_day_movements`tadır, çünkü defterin karşı yaka kuralı `account_movement` görünümünde yaşar.
   */
  async dayMovements(store: RegisterStore, from: string, to: string): Promise<RegisterDayMovement[]> {
    const { data, error } = await this.supabase.rpc('register_day_movements', {
      p_warehouse_id: store.warehouseId,
      p_cash_account_id: store.cashAccountId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ movement_id: string; kind: string; method: string | null; expected: number; written: number }>;
    return rows.map((row) =>
      RegisterDayMovementSchema.parse({
        movementId: row.movement_id,
        kind: row.kind,
        method: row.method,
        expectedCents: toCents(Number(row.expected)),
        writtenCents: toCents(Number(row.written)),
      }),
    );
  }
}

export class RegisterProductService extends BaseDbService<RegisterProduct, RegisterProductInsert, RegisterProductUpdate> {
  protected override readonly moneyFields = ['priceCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_product', RegisterProductSchema, RegisterProductInsertSchema, RegisterProductUpdateSchema);
  }

  /** Bir fişin bütün kalem ürünleri tek turda. */
  listByVariants(variantIds: readonly string[]): Promise<RegisterProduct[]> {
    if (variantIds.length === 0) return Promise.resolve([]);
    return this.getAll({ variantId: [...variantIds] });
  }

  findShipping(vatRate: number): Promise<RegisterProduct | null> {
    return this.getOneBy({ kind: 'shipping', vatRate });
  }
}

export class RegisterTicketService extends BaseDbService<RegisterTicket, RegisterTicketInsert, RegisterTicketUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_ticket', RegisterTicketSchema, RegisterTicketInsertSchema, RegisterTicketUpdateSchema);
  }

  /** Siparişin fişleri, sırasıyla; bir siparişin fişi bir elin parmağını geçmez. */
  listByOrder(orderId: string): Promise<RegisterTicket[]> {
    return this.getAll({ orderId }, { orderBy: 'seq' });
  }

  listByIds(ids: readonly string[]): Promise<RegisterTicket[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.getByIds([...ids]);
  }

  /** Mağazanın `[from, to)` aralığında kapanan fişleri; gün sonu mutabakatının bizim tarafı. */
  listWrittenBetween(warehouseId: string, from: string, to: string): Promise<RegisterTicket[]> {
    return this.getAll({ warehouseId, status: 'written' }, { rangeFilters: writtenBetween('writtenAt', from, to) });
  }
}

export class RegisterTicketLineService extends BaseDbService<RegisterTicketLine, RegisterTicketLineInsert, RegisterTicketLineUpdate> {
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_ticket_line', RegisterTicketLineSchema, RegisterTicketLineInsertSchema, RegisterTicketLineUpdateSchema);
  }

  listByTickets(ticketIds: readonly string[]): Promise<RegisterTicketLine[]> {
    if (ticketIds.length === 0) return Promise.resolve([]);
    return this.getAll({ ticketId: [...ticketIds] }, { orderBy: 'createdAt' });
  }

  insertMany(rows: RegisterTicketLineInsert[]): Promise<RegisterTicketLine[]> {
    return this.bulkInsert(rows);
  }
}

export class RegisterPaymentService extends BaseDbService<RegisterPaymentRow, RegisterPaymentInsert, RegisterPaymentUpdate> {
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_payment', RegisterPaymentRowSchema, RegisterPaymentInsertSchema, RegisterPaymentUpdateSchema);
  }

  listByTickets(ticketIds: readonly string[]): Promise<RegisterPaymentRow[]> {
    if (ticketIds.length === 0) return Promise.resolve([]);
    return this.getAll({ ticketId: [...ticketIds] }, { orderBy: 'createdAt' });
  }

  insertMany(rows: RegisterPaymentInsert[]): Promise<RegisterPaymentRow[]> {
    return this.bulkInsert(rows);
  }

  /** `[from, to)` aralığında kasaya yazılan ödeme satırları. */
  listWrittenBetween(from: string, to: string): Promise<RegisterPaymentRow[]> {
    return this.getAll({ status: 'written' }, { rangeFilters: writtenBetween('writtenAt', from, to) });
  }

  /** Satırları başka harekete taşır: silinen hareketin yerini eşdeğer yeni hareket alınca kasaya yazım olmaz. */
  async relink(rowIds: readonly string[], movementId: string): Promise<void> {
    await this.updateWhereIn('id', rowIds, { movementId });
  }
}

export class RegisterCashOpService extends BaseDbService<RegisterCashOp, RegisterCashOpInsert, RegisterCashOpUpdate> {
  protected override readonly moneyFields = ['amountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_cash_op', RegisterCashOpSchema, RegisterCashOpInsertSchema, RegisterCashOpUpdateSchema);
  }

  /** Hareketin kasadaki kayıtları, yazılış sırasıyla: yazımları ve ters çevrilmeleri. */
  listForMovement(movementId: string): Promise<RegisterCashOp[]> {
    return this.getAll({ movementId }, { orderBy: 'createdAt' });
  }

  listWrittenBetween(warehouseId: string, from: string, to: string): Promise<RegisterCashOp[]> {
    return this.getAll({ warehouseId, status: 'written' }, { rangeFilters: writtenBetween('writtenAt', from, to) });
  }
}

/** Kuyruk; satırları `money_movement` tetikleyicisi yazar, işleyen yalnız okur, erteler ve siler. */
export class RegisterQueueService extends BaseDbService<RegisterQueue, never, RegisterQueueUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_queue', RegisterQueueSchema, RegisterQueueSchema as never, RegisterQueueUpdateSchema);
  }

  /** Vakti gelen satırlar, en eskiden; tur başına sınırlı ki tek tur kasayı boğmasın. */
  listDue(now: string, limit: number): Promise<RegisterQueue[]> {
    return this.getAll(undefined, {
      rangeFilters: [{ field: 'nextAttemptAt', operator: 'lte', value: now }],
      orderBy: 'markedAt',
      limit,
    });
  }

  /** Kuyrukta bekleyen sipariş ve kasa hareketi; ertelenmiş ve durmuş satırlar da sayılır. */
  countWaiting(): Promise<number> {
    return this.count();
  }

  /** Kuyruğun tamamı; satırlar işlenince silindiği için küme kısa kalır, gün sonu onu mağazalara dağıtır. */
  listAll(): Promise<RegisterQueue[]> {
    return this.getAll(undefined, { orderBy: 'markedAt' });
  }

  /** Planı duran satırlar (`blocked:<sebep>`); çözümleri bir para değişikliğidir, sebep ekrana gider. */
  listBlocked(limit = 500): Promise<RegisterQueue[]> {
    return this.getAll(undefined, { prefixFilters: [{ field: 'lastError', value: 'blocked:' }], limit });
  }

  /** Kasaya ulaşamayıp yeniden denenen satırlar; planı duran satır önceki deneme sayısını korur, o yüzden ayrılır. */
  countFailing(): Promise<number> {
    return this.count(undefined, {
      rangeFilters: [{ field: 'attempts', operator: 'gt', value: 0 }],
      orFilters: ['last_error.is.null,last_error.not.like.blocked:*'],
    });
  }

  findByOrder(orderId: string): Promise<RegisterQueue | null> {
    return this.getOneBy({ orderId });
  }

  /** İşlenen satırı siler; işlem sürerken yeniden işaretlendiyse (`markedAt` değiştiyse) satır kalır ve sonraki tur yine işler. */
  async complete(id: string, markedAt: string): Promise<void> {
    await this.deleteWhere({ id, markedAt });
  }

  /** Satırı erteler; işlem sürerken yeniden işaretlendiyse vakit hemen geri çekilir ki yeni değişiklik ertelemeyi beklemesin. */
  async defer(
    row: Pick<RegisterQueue, 'id' | 'markedAt'>,
    change: { attempts: number; nextAttemptAt: string; lastError: string },
  ): Promise<void> {
    const deferred = await this.update({ id: row.id, ...change });
    if (deferred.markedAt !== row.markedAt) await this.update({ id: row.id, nextAttemptAt: deferred.markedAt });
  }
}
