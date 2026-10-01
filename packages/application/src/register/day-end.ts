import {
  RegisterCashOpService,
  RegisterPaymentService,
  RegisterQueueService,
  RegisterStoreService,
  RegisterTicketLineService,
  RegisterTicketService,
  type Db,
} from '@lezzet/database';
import { reconcileRegisterDay, type RegisterDayDifference, type RegisterDaySide } from '@lezzet/domain-core';
import { parisDayRange } from '@lezzet/helper';
import type { RegisterStore } from '@lezzet/types';
import type { CashRegister } from './port';

/**
 * Kasanın gün sonu: mağaza başına gün kapanışı ve mutabakat. Mutabakat kasaya ne yazdığımızı (ayna) kasanın gün sonu toplamlarıyla
 * karşılaştırır; paranın aynaya geçmesini kuyruk taşır, kuyrukta bekleyen sayı sonuçta durur.
 */

export interface RegisterDayEnd {
  date: string;
  stores: Array<{ warehouseId: string; closed: boolean; differences: RegisterDayDifference[] }>;
  /** Kuyrukta bekleyen sipariş ve kasa hareketi; gün kapanırken boş değilse o para ertesi günün kasasına düşer. */
  waiting: number;
}

/** Gün `YYYY-MM-DD`, Paris takviminde. `close` yalnız canlı kasada açılır: kapanış mali kayıttır, geri alınmaz. */
export async function closeRegisterDay(db: Db, register: CashRegister, opts: { date: string; close: boolean }): Promise<RegisterDayEnd> {
  const stores = [];
  for (const store of await new RegisterStoreService(db).list()) {
    let closed = (await register.dayClosedAt(store.externalStoreId, opts.date)) !== null;
    if (!closed && opts.close) {
      await register.closeDay(store.externalStoreId, opts.date);
      closed = true;
    }
    const differences = reconcileRegisterDay(await oursOf(db, store, opts.date), await registerSideOf(register, store, opts.date));
    stores.push({ warehouseId: store.warehouseId, closed, differences });
  }
  return { date: opts.date, stores, waiting: await new RegisterQueueService(db).countWaiting() };
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
    saleIds: [...ownTickets.values()].map((ticket) => ticket.externalSaleId).filter((id): id is number => id !== null),
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
