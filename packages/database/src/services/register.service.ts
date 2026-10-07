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
  RegisterQueueInsertSchema,
  RegisterQueueSchema,
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
  type RegisterQueueInsert,
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
import { QueueDbService } from '../core/queue.service';

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
   * `register_day_movements`tadır, çünkü defterin karşı yaka kuralı `account_movement` görünümünde yaşar. `orderWarehouseIds` satışı bu
   * mağazaya yazılan depolardır; listeyi fişi yazan kural verir.
   */
  async dayMovements(store: RegisterStore, orderWarehouseIds: readonly string[], from: string, to: string): Promise<RegisterDayMovement[]> {
    const { data, error } = await this.supabase.rpc('register_day_movements', {
      p_warehouse_id: store.warehouseId,
      p_order_warehouse_ids: [...orderWarehouseIds],
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
export class RegisterQueueService extends QueueDbService<RegisterQueue, RegisterQueueInsert> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'register_queue', RegisterQueueSchema, RegisterQueueInsertSchema);
  }

  /** Hareketleri kuyruğa işaretler; zaten kuyrukta olan satır olduğu gibi kalır. */
  async markMovements(movementIds: readonly string[]): Promise<void> {
    await this.bulkUpsertIgnoring(
      movementIds.map((movementId) => ({ movementId })),
      'movement_id',
    );
  }

  /** Kuyruğun tamamı; satırlar işlenince silindiği için küme kısa kalır, gün sonu onu mağazalara dağıtır. */
  listAll(): Promise<RegisterQueue[]> {
    return this.getAll(undefined, { orderBy: 'markedAt' });
  }

  findByOrder(orderId: string): Promise<RegisterQueue | null> {
    return this.getOneBy({ orderId });
  }

  /** Hedefin güncel satırını süreli kilitleyip döndürür; satır yoksa ya da başka bir yazar kilitliyse `null`. */
  async claim(target: Pick<RegisterQueue, 'orderId' | 'movementId'>, until: string): Promise<RegisterQueue | null> {
    const rows = await this.executeRpc<unknown[]>('register_queue_claim', {
      p_order_id: target.orderId,
      p_movement_id: target.movementId,
      p_until: until,
    });
    return this.parseRows(rows ?? [])[0] ?? null;
  }

  /** Kilidi bırakır; satır işlenip silindiyse yapacak bir şey kalmamıştır. */
  async release(id: string): Promise<void> {
    await this.updateWhereIn('id', [id], { lockedUntil: null });
  }
}
