import {
  MoneyMovementService,
  OrderService,
  RegisterCashOpService,
  RegisterPaymentService,
  RegisterQueueService,
  RegisterStoreService,
  RegisterTicketLineService,
  RegisterTicketService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import { reconcileLedgerDay, reconcileRegisterDay, type RegisterDaySide } from '@lezzet/domain-core';
import { addDays, parisDateOf, parisDayRange } from '@lezzet/helper';
import { captureError, SOURCES } from '@lezzet/observability';
import type { RegisterDayCheck, RegisterDayDifference, RegisterStore } from '@lezzet/types';
import { notifyRegisterDayUnclosed } from '../notification/staff-events';
import type { CashRegister } from './port';
import { storeOf } from './sync';

/**
 * Kasanın gün sonu: kapanmamış günler sırayla karşılaştırılır; hepsi tutuyor ve mağazanın kuyruğu boşsa gün kapanır. Kasanın kapanışı
 * önceki günleri de kapattığı için tutmayan gün kapanışı bekletir, düzelince sonraki kapanışla birlikte kapanır.
 */

export interface RegisterDayEnd {
  /** Kapatılmak istenen gün. */
  date: string;
  stores: Array<{
    warehouseId: string;
    closed: boolean;
    /** Karşılaştırılan kapanmamış günler, eskiden yeniye; önceden kapanmış mağazada boştur. */
    days: Array<{ date: string; differences: RegisterDayDifference[] }>;
    /** Mağazanın kuyrukta bekleyen sipariş ve kasa hareketi; bekleyen para henüz kasada olmadığı için gün kapanmaz. */
    waiting: number;
    /** Arama sınırının gerisinde kapanmamış gün var; kasanın kapanışı onu da mühürleyeceği için gün kapatılmaz. */
    olderUnclosed: boolean;
  }>;
}

/** Kapanmamış gün en çok bu kadar geriye aranır; sınır kasaya giden çağrı sayısını tutar. */
const LOOKBACK_DAYS = 7;

/**
 * Gece işi: gün bittikten sonra önceki Paris günü kapatılır, yoksa gece yarısına sarkan yazım hiçbir günün mutabakatına girmezdi.
 * Fark hata kaydına uyarı olarak düşer; kapanmayan gün yönetime ve muhasebeye bildirilir.
 */
export async function registerDayEnd(
  db: Db,
  register: CashRegister,
  opts: { now: Date; close: boolean },
): Promise<Record<string, unknown>> {
  const date = addDays(parisDateOf(opts.now), -1);
  const result = await closeRegisterDay(db, register, { date, close: opts.close });
  const stores = [];
  for (const store of result.stores) {
    const differences = store.days.flatMap((day) => day.differences.map((difference) => ({ date: day.date, ...difference })));
    if (differences.length > 0) {
      await captureError(new Error(`kasa mutabakatı: ${differences.length} fark`), {
        source: SOURCES.backendCron,
        level: 'warning',
        context: { job: 'register_close_day', warehouseId: store.warehouseId, date, differences },
      });
    }
    if (store.olderUnclosed) {
      await captureError(new Error('kasa: arama sınırının gerisinde kapanmamış gün var'), {
        source: SOURCES.backendCron,
        level: 'warning',
        context: { job: 'register_close_day', warehouseId: store.warehouseId, date },
      });
    }
    if (!store.closed && (differences.length > 0 || store.waiting > 0 || store.olderUnclosed)) {
      await notifyRegisterDayUnclosed(db, {
        warehouseId: store.warehouseId,
        date,
        differences: differences.length,
        waiting: store.waiting,
        olderUnclosed: store.olderUnclosed,
      });
    }
    stores.push({
      warehouseId: store.warehouseId,
      closed: store.closed,
      days: store.days.length,
      differences: differences.length,
      waiting: store.waiting,
      olderUnclosed: store.olderUnclosed,
    });
  }
  return { date, live: opts.close, stores };
}

/**
 * Günler `YYYY-MM-DD`, Paris takviminde; mağazanın eşlendiği günden önceki gün aranmaz. `close` yalnız canlı kasada açılır: kapanış
 * mali kayıttır, geri alınmaz.
 */
export async function closeRegisterDay(db: Db, register: CashRegister, opts: { date: string; close: boolean }): Promise<RegisterDayEnd> {
  const storeService = new RegisterStoreService(db);
  const all = await storeService.list();
  const waiting = await waitingByWarehouse(db, all);
  const stores = [];
  for (const store of all) {
    const days = [];
    const unclosed = await unclosedDays(register, store, opts.date);
    for (const date of unclosed.days) {
      days.push({ date, differences: await differencesOf(db, register, store, date) });
    }
    const storeWaiting = waiting.get(store.warehouseId) ?? 0;
    let closed = days.length === 0;
    if (!closed && opts.close && storeWaiting === 0 && !unclosed.older && days.every((day) => day.differences.length === 0)) {
      await register.closeDay(store.externalStoreId, opts.date);
      closed = true;
    }
    stores.push({ warehouseId: store.warehouseId, closed, days, waiting: storeWaiting, olderUnclosed: unclosed.older });
  }
  return { date: opts.date, stores };
}

/** Gün içi karşılaştırmanın izi; zamanlanmış tur da kurulum kartındaki düğme de buraya yazar ki Pano en son sonucu göstersin. */
export const REGISTER_CHECK_JOB = 'register_check_day';

/**
 * Gün içi karşılaştırma: bugün kapatılmadan karşılaştırılır ki fark gece kapanışından önce görülüp düzeltilsin. Önceki günlere bakılmaz;
 * onlar gece işinindir ve her tur kasanın aylık çağrı kotasından yer.
 */
export async function checkRegisterDay(db: Db, register: CashRegister, opts: { now: Date }): Promise<RegisterDayCheck> {
  const date = parisDateOf(opts.now);
  const all = await new RegisterStoreService(db).list();
  const waiting = await waitingByWarehouse(db, all);
  const stores = [];
  for (const store of all) {
    stores.push({
      warehouseId: store.warehouseId,
      differences: await differencesOf(db, register, store, date),
      waiting: waiting.get(store.warehouseId) ?? 0,
    });
  }
  return { date, stores };
}

/** Günün farkları: önce defter ↔ ayna, sonra ayna ↔ kasa. */
async function differencesOf(db: Db, register: CashRegister, store: RegisterStore, date: string): Promise<RegisterDayDifference[]> {
  const { from, to } = parisDayRange(date);
  return [
    ...reconcileLedgerDay(await new RegisterStoreService(db).dayMovements(store, await warehousesOfStore(db, store), from, to)),
    ...reconcileRegisterDay(await oursOf(db, store, date), await registerSideOf(register, store, date)),
  ];
}

/** Satışı bu mağazaya yazılan depolar: kendisi ve kendi mağazası olmayan araçları; karar fişi yazan kuralındır (`storeOf`). */
async function warehousesOfStore(db: Db, store: RegisterStore): Promise<string[]> {
  const vehicles = await new WarehouseService(db).list({ kind: 'vehicle', homeWarehouseId: store.warehouseId });
  const candidates = [store.warehouseId, ...vehicles.map((vehicle) => vehicle.id)];
  const owners = await Promise.all(candidates.map((warehouseId) => storeOf(db, warehouseId)));
  return candidates.filter((_, index) => owners[index]?.warehouseId === store.warehouseId);
}

/**
 * İstenen günden geriye kapanmamış günler, eskiden yeniye: kapanmış güne, mağazanın eşlendiği güne ya da sınıra kadar. Sınırda
 * durulursa bir gün daha bakılır (`older`), çünkü sınırın gerisinde kapanmamış gün varsa kapanış onu karşılaştırmadan mühürlerdi.
 */
async function unclosedDays(register: CashRegister, store: RegisterStore, date: string): Promise<{ days: string[]; older: boolean }> {
  const firstDay = parisDateOf(new Date(store.createdAt));
  const days: string[] = [];
  let day = date;
  for (; days.length < LOOKBACK_DAYS && day >= firstDay; day = addDays(day, -1)) {
    if ((await register.dayClosedAt(store.externalStoreId, day)) !== null) return { days, older: false };
    days.unshift(day);
  }
  const older = day >= firstDay && (await register.dayClosedAt(store.externalStoreId, day)) === null;
  return { days, older };
}

/** Kuyruk mağazalara dağıtılır ki bir deponun birikmiş kuyruğu başka deponun gününü bekletmesin. */
async function waitingByWarehouse(db: Db, stores: readonly RegisterStore[]): Promise<Map<string, number>> {
  const rows = await new RegisterQueueService(db).listAll();
  const waiting = new Map<string, number>();
  const add = (warehouseId: string | undefined) => {
    if (warehouseId) waiting.set(warehouseId, (waiting.get(warehouseId) ?? 0) + 1);
  };
  for (const order of await new OrderService(db).listByIds(rows.flatMap((row) => (row.orderId ? [row.orderId] : [])))) {
    add((await storeOf(db, order.warehouseId))?.warehouseId);
  }
  const byCashAccount = new Map(stores.map((store) => [store.cashAccountId, store.warehouseId]));
  const movementIds = rows.flatMap((row) => (row.movementId ? [row.movementId] : []));
  const movements = await new MoneyMovementService(db).listByIds(movementIds);
  for (const movement of movements) {
    add(byCashAccount.get(movement.accountId) ?? (movement.counterAccountId ? byCashAccount.get(movement.counterAccountId) : undefined));
  }
  // Silinen hareketin ters kaydı bekler; deposu kasadaki kaydından okunur.
  for (const id of movementIds.filter((candidate) => !movements.some((movement) => movement.id === candidate))) {
    add((await new RegisterCashOpService(db).listForMovement(id))[0]?.warehouseId);
  }
  return waiting;
}

/** Bizim taraf: o gün yazılan fişler ve ödeme satırları ile kasa hareketleri, aynadan. */
async function oursOf(db: Db, store: RegisterStore, date: string): Promise<RegisterDaySide> {
  const { from, to } = parisDayRange(date);
  const tickets = new RegisterTicketService(db);
  const written = await tickets.listWrittenBetween(store.warehouseId, from, to);
  const payments = await new RegisterPaymentService(db).listWrittenBetween(from, to);
  const paid = await tickets.listByIds([...new Set(payments.map((payment) => payment.ticketId))]);
  const ownTickets = new Map(
    [...written, ...paid].filter((ticket) => ticket.warehouseId === store.warehouseId).map((ticket) => [ticket.id, ticket]),
  );
  const ownPayments = payments.filter((payment) => ownTickets.has(payment.ticketId));
  const [lines, cashOps] = await Promise.all([
    new RegisterTicketLineService(db).listByTickets(written.map((ticket) => ticket.id)),
    new RegisterCashOpService(db).listWrittenBetween(store.warehouseId, from, to),
  ]);

  const cashPaid = ownPayments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountCents, 0);
  const cashMoved = cashOps.reduce((sum, op) => sum + (op.direction === 'in' ? op.amountCents : -op.amountCents), 0);
  return {
    vat: lines.map((line) => ({ vatRate: line.vatRate, grossCents: line.amountCents })),
    payments: ownPayments.map((payment) => ({ method: payment.method, amountCents: payment.amountCents })),
    // Kasa tarafının satış listesi günün ödemelerinden çıkar; ödemesiz fiş (para doğurmayan iade) orada görünmez, KDV'de karşılaştırılır.
    saleIds: [...new Set(ownPayments.map((payment) => ownTickets.get(payment.ticketId)!.externalSaleId))].filter(
      (id): id is number => id !== null,
    ),
    cashNetCents: cashPaid + cashMoved,
  };
}

/** Kasanın tarafı: günün oran ve ödeme toplamları ile o günkü fiş dışı nakit. */
async function registerSideOf(register: CashRegister, store: RegisterStore, date: string): Promise<RegisterDaySide> {
  const day = await register.readDay(store.externalStoreId, date);
  const [year, month] = date.split('-').map(Number) as [number, number];
  const moves = (await register.listCashMoves(store.externalStoreId, { year, month })).filter((move) => move.at.startsWith(date));
  const cashPaid = day.payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amountCents, 0);
  return {
    vat: day.vat,
    payments: day.payments.map(({ method, amountCents }) => ({ method, amountCents })),
    saleIds: [...new Set(day.payments.map((payment) => payment.saleId))],
    cashNetCents: cashPaid + moves.reduce((sum, move) => sum + move.amountCents, 0),
  };
}
