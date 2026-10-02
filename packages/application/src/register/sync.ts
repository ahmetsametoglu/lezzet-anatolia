import {
  MoneyMovementService,
  OrderService,
  RegisterCashOpService,
  RegisterPaymentService,
  RegisterQueueService,
  RegisterStoreService,
  RegisterTicketLineService,
  RegisterTicketService,
  SettingsService,
  WarehouseService,
  type Db,
} from '@lezzet/database';
import { planRegister, splitRegisterLine, type RegisterBlockReason, type RegisterMovement } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import { captureError, logger, SOURCES } from '@lezzet/observability';
import type {
  MoneyMovement,
  MovementDirection,
  Order,
  OrderItem,
  RegisterCashOp,
  RegisterCashOpInsert,
  PaymentMethod,
  RegisterPayment,
  RegisterPaymentRef,
  RegisterPaymentRow,
  RegisterQueue,
  RegisterSale,
  RegisterStore,
  RegisterTicket,
  RegisterTicketLine,
  RegisterTicketSnapshot,
} from '@lezzet/types';
import { notifyRegisterWriteStuck } from '../notification/staff-events';
import type { CashRegister } from './port';
import { ensureItemProducts, ensureShippingProduct } from './products';

/**
 * Sertifikalı kasa eşitlemesi (docs/feature/kasa-muhasebe.md §7): kuyruktaki siparişin planı motordan çıkar, kasaya yazılır, sonuç
 * aynaya geçer. Her kasa çağrısından önce ayna "yazılıyor" satırını taşır; yarıda kalan yazım sonraki turda aynı satıştan tamamlanır.
 */

/** Canlıya geçiş anı; öncesinde açılan sipariş ve yazılan hareket kasaya gitmez, ayar yoksa eşitleme hiç koşmaz. */
export const REGISTER_LIVE_FROM_KEY = 'register_live_from';

const BATCH = 20;
const ALERT_AFTER_ATTEMPTS = 5;
/** Plan durduysa çözüm bir para değişikliğiyle gelir ve satırı zaten yeniden işaretler; ara deneme seyrek tutulur. */
const BLOCKED_RETRY_MS = 6 * 3_600_000;
const MAX_BACKOFF_MS = 3_600_000;

type BlockReason = RegisterBlockReason | 'no_store';
/** `written`: kasa bu kaydı yansıtıyor (şimdi ya da önceden yazıldı); `skipped`: kayıt kasanın kapsamı dışında. */
type SyncOutcome = { status: 'written' } | { status: 'skipped' } | { status: 'blocked'; reason: BlockReason };
export type RegisterQueueOutcome = 'written' | 'skipped' | 'blocked' | 'failed';

interface SyncContext {
  liveFrom: string;
  now: Date;
}

/** Canlıya geçiş anı; ayar yoksa ya da okunamıyorsa `null` ve kasaya hiçbir şey yazılmaz. */
export async function registerLiveFrom(db: Db): Promise<string | null> {
  const liveFrom = await new SettingsService(db).get<string | null>(REGISTER_LIVE_FROM_KEY, null);
  if (!liveFrom) return null;
  // Okunamayan tarih bütün geçmişi kasaya açardı; ayar düzeltilene kadar kasaya yazılmaz.
  if (Number.isNaN(Date.parse(liveFrom))) {
    logger.warn({ setting: REGISTER_LIVE_FROM_KEY }, 'kasa: canlıya geçiş anı okunamadı');
    return null;
  }
  return liveFrom;
}

/** Canlıya geçiş anını yazar, `null` kasayı kapatır; ayarın değeri boş olamadığı için kapalı kasa satırın yokluğudur. */
export async function setRegisterLiveFrom(db: Db, at: string | null): Promise<void> {
  const settings = new SettingsService(db);
  if (at) {
    await settings.set(REGISTER_LIVE_FROM_KEY, at, {
      scopeType: 'global',
      description: 'Sertifikalı kasaya yazımın başladığı an; bu andan sonra para görmeyen sipariş kasaya gitmez.',
    });
    for (const store of await new RegisterStoreService(db).list()) await requeueRegisterStore(db, store, at);
    return;
  }
  for (const row of await settings.listByKey(REGISTER_LIVE_FROM_KEY)) await settings.delete(row.id);
  SettingsService.invalidate(REGISTER_LIVE_FROM_KEY);
}

export async function syncRegisterQueue(db: Db, register: CashRegister, opts: { now?: Date } = {}): Promise<Record<string, unknown>> {
  const liveFrom = await registerLiveFrom(db);
  if (!liveFrom) return { skipped: 'not_live' };
  const now = opts.now ?? new Date();
  const rows = await new RegisterQueueService(db).listDue(now.toISOString(), BATCH);
  const counts: Record<RegisterQueueOutcome, number> = { written: 0, skipped: 0, blocked: 0, failed: 0 };
  for (const row of rows) counts[await processQueueRow(db, register, row, { liveFrom, now })] += 1;
  return counts;
}

/** Kuyruğun tek satırı: yazılırsa ya da yazılacak bir şey yoksa satır tamamlanır, plan durduysa ya da hata çıktıysa ertelenir. */
export async function processQueueRow(db: Db, register: CashRegister, row: RegisterQueue, ctx: SyncContext): Promise<RegisterQueueOutcome> {
  const queue = new RegisterQueueService(db);
  try {
    const outcome = row.orderId
      ? await syncOrderRegister(db, register, row.orderId, ctx)
      : await syncCashMovement(db, register, row.movementId!, ctx);
    if (outcome.status === 'blocked') {
      const nextAttemptAt = new Date(ctx.now.getTime() + BLOCKED_RETRY_MS).toISOString();
      const lastError = `blocked:${outcome.reason}`;
      await queue.defer(row, { attempts: row.attempts, nextAttemptAt, lastError });
      // Durma ilk görüldüğünde haber verilir; seyrek yeniden deneme aynı sebeple durdukça tekrar etmez.
      if (row.lastError !== lastError) await alertStuck(db, row, outcome.reason, ctx.now);
      return 'blocked';
    }
    await queue.complete(row.id, row.markedAt);
    return outcome.status;
  } catch (err) {
    const attempts = row.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    const nextAttemptAt = new Date(ctx.now.getTime() + Math.min(2 ** (attempts - 1) * 60_000, MAX_BACKOFF_MS)).toISOString();
    await queue.defer(row, { attempts, nextAttemptAt, lastError: message });
    const target = { orderId: row.orderId, movementId: row.movementId, attempts };
    if (attempts === ALERT_AFTER_ATTEMPTS) {
      await captureError(err, { source: SOURCES.backendCron, context: { job: 'register_sync', ...target } });
      await alertStuck(db, row, 'error', ctx.now);
    } else {
      logger.warn({ ...target, err: message }, 'kasa eşitlemesi ertelendi');
    }
    return 'failed';
  }
}

/**
 * Kasaya yazılamayan kaydın haberi. Eşleme eksikliği deponun bütün siparişlerini durdurduğu için depo ve gün başına bir kez, öteki
 * sebepler kayıt başına bir kez bildirilir.
 */
async function alertStuck(db: Db, row: RegisterQueue, reason: string, now: Date): Promise<void> {
  const order = row.orderId ? await new OrderService(db).getById(row.orderId) : null;
  const warehouseId = order?.warehouseId ?? null;
  await notifyRegisterWriteStuck(db, {
    warehouseId,
    orderId: row.orderId,
    movementId: row.movementId,
    referenceNo: order?.referenceNo ?? null,
    reason,
    dedupeKey:
      reason === 'no_store'
        ? `register-stuck:no_store:${warehouseId ?? '-'}:${parisDateOf(now)}`
        : `register-stuck:${row.orderId ?? row.movementId}:${row.markedAt}:${reason}`,
  });
}

// ── Sipariş ─────────────────────────────────────────────────────────────────

interface OrderScope {
  db: Db;
  register: CashRegister;
  order: Order;
  items: OrderItem[];
  now: Date;
}

interface Mirror {
  tickets: RegisterTicket[];
  lines: RegisterTicketLine[];
  payments: RegisterPaymentRow[];
}

async function syncOrderRegister(db: Db, register: CashRegister, orderId: string, ctx: SyncContext): Promise<SyncOutcome> {
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found) return { status: 'skipped' };
  const money = (await new MoneyMovementService(db).listByOrder(orderId)).filter(isOrderMoney);
  const before = await mirrorOf(db, orderId);
  // Kapsamı paranın anı belirler, siparişin açılışı değil: geçişten önce açılıp sonra ödenen sipariş de kasaya gider (1. karar).
  if (before.tickets.length === 0 && !money.some((movement) => Date.parse(movement.createdAt) >= Date.parse(ctx.liveFrom))) {
    return { status: 'skipped' };
  }
  const scope: OrderScope = { db, register, order: found.order, items: found.items, now: ctx.now };

  await recoverOrder(scope, before);
  const mirror = await mirrorOf(db, orderId);
  const movements = money.map(registerMovementOf);
  const plan = planRegister({ order: scope.order, items: scope.items, movements, tickets: snapshotsOf(mirror) });
  if (plan.status === 'skip') return { status: 'skipped' };
  if (plan.dueMismatch) logger.warn({ orderId }, 'kasa: fiş kalemleri türetilen borcu tutmuyor, fark fişin bakiyesinde');

  const store = plan.ops.length > 0 ? await storeOf(db, scope.order.warehouseId) : null;
  if (plan.ops.length > 0 && !store) return { status: 'blocked', reason: 'no_store' };

  const payments = new RegisterPaymentService(db);
  // Plan aynı turda açtığı fişe ödeme satırı da ekleyebilir; fiş açılınca yazılmış hâliyle buraya girer.
  const bySeq = new Map(mirror.tickets.map((ticket) => [ticket.seq, ticket]));
  for (const op of plan.ops) {
    if (op.op === 'open_ticket') {
      bySeq.set(op.seq, await openTicket(scope, store!, op.seq, op.lines, op.payments));
    } else if (op.op === 'add_payments') {
      const ticket = bySeq.get(op.seq)!;
      const rows = await payments.insertMany(op.payments.map((payment) => ({ ...payment, ticketId: ticket.id })));
      await completePayments(scope, ticket, rows);
    } else {
      const rows = mirror.payments.filter((payment) => payment.movementId === op.fromMovementId);
      await payments.relink(
        rows.map((row) => row.id),
        op.toMovementId,
      );
    }
  }
  return plan.blocked ? { status: 'blocked', reason: plan.blocked.reason } : { status: 'written' };
}

const isOrderMoney = (movement: MoneyMovement): boolean => movement.type === 'order_payment' || movement.type === 'order_refund';

const registerMovementOf = (movement: MoneyMovement): RegisterMovement => ({
  id: movement.id,
  createdAt: movement.createdAt,
  signedAmountCents: movement.direction === 'in' ? movement.amountCents : -movement.amountCents,
  method: movement.paymentMethod,
});

async function mirrorOf(db: Db, orderId: string): Promise<Mirror> {
  const tickets = await new RegisterTicketService(db).listByOrder(orderId);
  const ids = tickets.map((ticket) => ticket.id);
  const [lines, payments] = await Promise.all([
    new RegisterTicketLineService(db).listByTickets(ids),
    new RegisterPaymentService(db).listByTickets(ids),
  ]);
  return { tickets, lines, payments };
}

function snapshotsOf(mirror: Mirror): RegisterTicketSnapshot[] {
  return mirror.tickets.map((ticket) => ({
    seq: ticket.seq,
    lines: mirror.lines
      .filter((line) => line.ticketId === ticket.id)
      .map(({ kind, orderItemId, qty, amountCents, vatRate }) => ({ kind, orderItemId, qty, amountCents, vatRate })),
    payments: mirror.payments
      .filter((payment) => payment.ticketId === ticket.id)
      .map(({ method, amountCents, movementId }): RegisterPayment => ({ method, amountCents, movementId })),
  }));
}

/** Plan aynanın yazılmış hâline göre çıkar; önce yarıda kalan fiş ve ödeme satırı kasadaki hâline göre tamamlanır. */
async function recoverOrder(scope: OrderScope, mirror: Mirror): Promise<void> {
  for (const ticket of mirror.tickets) {
    if (ticket.status === 'writing') {
      const store = await new RegisterStoreService(scope.db).findByWarehouse(ticket.warehouseId);
      if (!store) throw new Error(`kasa: fişin mağaza eşlemesi yok (${ticket.extRef})`);
      await completeTicket(scope, store, ticket);
      continue;
    }
    const pending = mirror.payments.filter((payment) => payment.ticketId === ticket.id && payment.status === 'writing');
    if (pending.length > 0) await completePayments(scope, ticket, pending);
  }
}

/**
 * Çekmece eşlenince ya da canlıya geçiş günü girilince: tetikleyici yalnız yazım anında eşlenmiş çekmecenin hareketini kuyruğa koyar,
 * öncesinde yazılan hareket kasaya hiç gitmezdi. Eşlemesi olmadığı için duran sipariş de beklemeden yeniden denenir.
 */
export async function requeueRegisterStore(db: Db, store: RegisterStore, liveFrom: string | null): Promise<void> {
  const queue = new RegisterQueueService(db);
  await queue.retryBlocked('no_store', new Date().toISOString());
  if (!liveFrom) return;
  const movements = await new MoneyMovementService(db).listTouchingAccountSince(store.cashAccountId, liveFrom);
  await queue.markMovements(movements.map((movement) => movement.id));
}

/** Araç satışı aracın ana deposunun mağazasına yazılır. */
export async function storeOf(db: Db, warehouseId: string): Promise<RegisterStore | null> {
  const stores = new RegisterStoreService(db);
  const direct = await stores.findByWarehouse(warehouseId);
  if (direct) return direct;
  const warehouse = await new WarehouseService(db).getById(warehouseId);
  return warehouse?.kind === 'vehicle' && warehouse.homeWarehouseId ? stores.findByWarehouse(warehouse.homeWarehouseId) : null;
}

const extRefOf = (order: Order, seq: number): string => `${order.referenceNo ?? `LA-${order.id.slice(0, 8)}`}-${seq}`;

async function openTicket(
  scope: OrderScope,
  store: RegisterStore,
  seq: number,
  lines: RegisterTicketSnapshot['lines'],
  payments: RegisterPayment[],
): Promise<RegisterTicket> {
  const ticket = await new RegisterTicketService(scope.db).insert({
    orderId: scope.order.id,
    seq,
    warehouseId: store.warehouseId,
    extRef: extRefOf(scope.order, seq),
  });
  await new RegisterTicketLineService(scope.db).insertMany(lines.map((line) => ({ ...line, ticketId: ticket.id })));
  await new RegisterPaymentService(scope.db).insertMany(payments.map((payment) => ({ ...payment, ticketId: ticket.id })));
  return completeTicket(scope, store, ticket);
}

/**
 * Fişi kasada aynadaki hâline getirir ve kapatır. Kapanmamış satış mali kayıt değildir: içindeki yarım yazım silinip aynadan yeniden
 * yazılır; kapanmış satışın yazımı bitmiştir, çünkü kapanış en son yapılır.
 */
async function completeTicket(scope: OrderScope, store: RegisterStore, ticket: RegisterTicket): Promise<RegisterTicket> {
  const { db, register } = scope;
  const tickets = new RegisterTicketService(db);
  const [lines, payments] = await Promise.all([
    new RegisterTicketLineService(db).listByTickets([ticket.id]),
    new RegisterPaymentService(db).listByTickets([ticket.id]),
  ]);

  const knownSaleId = ticket.externalSaleId ?? (await adoptSale(register, ticket.extRef));
  let sale = knownSaleId === null ? null : await register.readSale(knownSaleId);
  if (sale === null) {
    // Satış numarası kasa çağrısından hemen sonra aynaya geçer; numarasız yarım satış ancak `ext_ref` ile bulunabilirdi.
    const created = await register.createSale(store.externalStoreId);
    await tickets.update({ id: ticket.id, externalSaleId: created });
    sale = await register.readSale(created);
    if (sale === null) throw new Error(`kasa: açılan satış okunamadı (${ticket.extRef})`);
  } else if (sale.saleId !== ticket.externalSaleId) {
    await tickets.update({ id: ticket.id, externalSaleId: sale.saleId });
  }

  if (sale.closed) {
    await completePayments(
      scope,
      ticket,
      payments.filter((payment) => payment.status === 'writing'),
      sale,
    );
  } else {
    await register.prepareSale(sale.saleId, ticket.extRef);
    for (const payment of sale.payments) await register.deletePayment(payment.paymentId);
    for (const line of sale.lines) await register.deleteLine(line.lineId);
    await writeLines(scope, sale.saleId, lines);
    for (const payment of payments) {
      const ref = await register.addPayment({ saleId: sale.saleId, method: payment.method, amountCents: payment.amountCents });
      await new RegisterPaymentService(db).update({
        id: payment.id,
        ...externalOf(ref),
        status: 'written',
        writtenAt: scope.now.toISOString(),
      });
    }
    await register.closeSale(sale.saleId);
    sale = (await register.readSale(sale.saleId)) ?? sale;
  }
  return tickets.update({
    id: ticket.id,
    externalSaleId: sale.saleId,
    status: 'written',
    writtenAt: scope.now.toISOString(),
    uniqueSaleId: sale.uniqueSaleId,
    receiptUrl: sale.receiptUrl,
  });
}

/** Kasa aramayı "içerir" biçiminde yapar (`-1` araması `-10`u da getirir); satış okunarak tam eşleşme doğrulanır. */
async function adoptSale(register: CashRegister, extRef: string): Promise<number | null> {
  for (const saleId of await register.findSaleIdsByExtRef(extRef)) {
    if ((await register.readSale(saleId))?.extRef === extRef) return saleId;
  }
  return null;
}

async function writeLines(scope: OrderScope, saleId: number, lines: RegisterTicketLine[]): Promise<void> {
  const { db, register } = scope;
  const variantOf = new Map(scope.items.map((item) => [item.id, item.variantId]));
  const items = await ensureItemProducts(
    db,
    register,
    lines.filter((line) => line.kind === 'item').map((line) => variantOf.get(line.orderItemId!)!),
  );
  // Aynı anda açılan kalem satırlarının sırası belirsizdir; fiş siparişin kalem sırasıyla yazılır, kargo en sonda.
  const rank = new Map(scope.items.map((item, index) => [item.id, index]));
  const ordered = [...lines].sort((a, b) =>
    a.kind === b.kind
      ? a.kind === 'item'
        ? rank.get(a.orderItemId!)! - rank.get(b.orderItemId!)!
        : a.vatRate - b.vatRate
      : a.kind === 'item'
        ? -1
        : 1,
  );
  for (const line of ordered) {
    const product =
      line.kind === 'item' ? items.get(variantOf.get(line.orderItemId!)!)! : await ensureShippingProduct(db, register, line.vatRate);
    const externalLineIds: number[] = [];
    for (const part of splitRegisterLine(line)) {
      externalLineIds.push(
        await register.addLine({
          saleId,
          productId: product.externalProductId,
          quantity: part.quantity,
          unitPriceCents: part.unitPriceCents,
          vatRate: line.vatRate === product.vatRate ? null : line.vatRate,
        }),
      );
    }
    await new RegisterTicketLineService(db).update({ id: line.id, externalLineIds });
  }
}

/**
 * Ödeme satırlarını yazılmış fişin satışına ekler; gün kapanmışsa kasa onları satışın nakit akışı olarak kaydeder. Kasada aynı yöntem ve
 * tutarda sahipsiz bir ödeme satırı ya da nakit akışı varsa o, yarıda kalan yazımındır ve sahiplenilir; yoksa ödeme ikinci kez yazılırdı.
 */
async function completePayments(
  scope: OrderScope,
  ticket: RegisterTicket,
  rows: RegisterPaymentRow[],
  known?: RegisterSale,
): Promise<void> {
  if (rows.length === 0) return;
  const { db, register } = scope;
  const payments = new RegisterPaymentService(db);
  const sale = known ?? (ticket.externalSaleId === null ? null : await register.readSale(ticket.externalSaleId));
  if (!sale) throw new Error(`kasa: fişin satışı kasada yok (${ticket.extRef})`);

  const mine = await payments.listByTickets([ticket.id]);
  const claimed = {
    payment: new Set(mine.map((payment) => payment.externalPaymentId).filter((id): id is number => id !== null)),
    cash_flow: new Set(mine.map((payment) => payment.externalCashFlowId).filter((id): id is number => id !== null)),
  };
  for (const row of rows) {
    const matches = (candidate: { method: PaymentMethod | null; amountCents: number }) =>
      candidate.method === row.method && candidate.amountCents === row.amountCents;
    const orphan = sale.payments.find((payment) => !claimed.payment.has(payment.paymentId) && matches(payment));
    const orphanFlow = sale.cashFlows.find((flow) => !claimed.cash_flow.has(flow.cashFlowId) && matches(flow));
    const ref: RegisterPaymentRef = orphan
      ? { kind: 'payment', id: orphan.paymentId }
      : orphanFlow
        ? { kind: 'cash_flow', id: orphanFlow.cashFlowId }
        : await register.addPayment({ saleId: sale.saleId, method: row.method, amountCents: row.amountCents });
    claimed[ref.kind].add(ref.id);
    await payments.update({ id: row.id, ...externalOf(ref), status: 'written', writtenAt: scope.now.toISOString() });
  }
}

const externalOf = (ref: RegisterPaymentRef) =>
  ref.kind === 'payment'
    ? { externalPaymentId: ref.id, externalCashFlowId: null }
    : { externalPaymentId: null, externalCashFlowId: ref.id };

// ── Kasa hareketi (fiş dışı nakit) ──────────────────────────────────────────

interface CashEffect {
  store: RegisterStore;
  direction: MovementDirection;
  amountCents: number;
  label: string;
}

/**
 * Eşlenmiş kasa hesabının fiş dışı nakdi kasaya giriş ya da çıkış olarak yazılır. Kasadaki kayıt değişmez: etkisi değişen ya da
 * silinen hareketin yürürlükteki kaydı ters çevrilir, yeni etkisi varsa yeni kayıt yazılır.
 */
async function syncCashMovement(db: Db, register: CashRegister, movementId: string, ctx: SyncContext): Promise<SyncOutcome> {
  const ops = new RegisterCashOpService(db);
  for (const op of (await ops.listForMovement(movementId)).filter((candidate) => candidate.status === 'writing')) {
    await completeCashOp(db, register, op, ctx.now);
  }
  const written = await ops.listForMovement(movementId);
  const reversed = new Set(written.map((op) => op.reversalOf).filter((id): id is string => id !== null));
  const active = written.find((op) => op.reversalOf === null && !reversed.has(op.id)) ?? null;
  const [movement] = await new MoneyMovementService(db).listByIds([movementId]);
  if (written.length === 0 && movement && Date.parse(movement.createdAt) < Date.parse(ctx.liveFrom)) return { status: 'skipped' };

  const effect = movement ? await cashEffectOf(db, movement) : null;
  const unchanged =
    active !== null &&
    effect !== null &&
    active.warehouseId === effect.store.warehouseId &&
    active.direction === effect.direction &&
    active.amountCents === effect.amountCents;
  if (unchanged) return { status: 'written' };
  // Kaydı önceden ters çevrilmiş hareketi kasa zaten yansıtıyor; hiç kaydı olmayan ise kapsam dışıdır.
  if (!active && !effect) return { status: written.length > 0 ? 'written' : 'skipped' };
  if (active) {
    await writeCashOp(db, register, ctx.now, {
      warehouseId: active.warehouseId,
      movementId,
      reversalOf: active.id,
      direction: active.direction === 'in' ? 'out' : 'in',
      amountCents: active.amountCents,
      label: `Annulation ${active.label}`,
    });
  }
  if (effect) {
    // Açıklama kasadaki kaydı bulmanın anahtarıdır; aynı hareketin sonraki kaydı sırasıyla ayrılır.
    const generation = written.filter((op) => op.reversalOf === null).length + 1;
    await writeCashOp(db, register, ctx.now, {
      warehouseId: effect.store.warehouseId,
      movementId,
      reversalOf: null,
      direction: effect.direction,
      amountCents: effect.amountCents,
      label: generation > 1 ? `${effect.label}/${generation}` : effect.label,
    });
  }
  return { status: 'written' };
}

/**
 * Hareketin kasadaki nakit etkisi: B2C sipariş parası fişle girer ve kart çekmeceye girmez, burada yalnız sipariş dışı nakit ve B2B
 * nakdi kalır. Transferin karşı ucu ters yöndedir.
 */
async function cashEffectOf(db: Db, movement: MoneyMovement): Promise<CashEffect | null> {
  const stores = new RegisterStoreService(db);
  const own = await stores.findByCashAccount(movement.accountId);
  // Var olan transfer ucuna bağlanmış ekstre satırında karşı yakanın kasadaki karşılığı o uçtur; defter de bu yakayı saymaz.
  const counter =
    !own && movement.counterAccountId && !movement.counterpartMovementId ? await stores.findByCashAccount(movement.counterAccountId) : null;
  const store = own ?? counter;
  if (!store) return null;
  // Kart, online ya da havale aynı hesaba yazılmış olsa da çekmeceden geçmez; gün sonu defteri de yalnız nakdi bekler.
  if (movement.paymentMethod !== null && movement.paymentMethod !== 'cash') return null;
  if (movement.orderId) {
    const order = await new OrderService(db).getById(movement.orderId);
    if (!order || order.channel !== 'b2b' || movement.paymentMethod !== 'cash') return null;
  }
  const direction: MovementDirection = own ? movement.direction : movement.direction === 'in' ? 'out' : 'in';
  // Künye kasadaki satırın açıklamasında durur ki yarıda kalan yazım onunla bulunsun.
  return {
    store,
    direction,
    amountCents: movement.amountCents,
    label: `${movement.description ?? movement.type} #${movement.id.slice(0, 8)}`,
  };
}

async function writeCashOp(db: Db, register: CashRegister, now: Date, insert: RegisterCashOpInsert): Promise<void> {
  const op = await new RegisterCashOpService(db).insert(insert);
  await completeCashOp(db, register, op, now);
}

/**
 * Yarıda kalan kasa hareketi kasadaki açıklamasından bulunur. Kasa Paris saatini tutar ve hareket ay dönümünde yazılmış olabilir; bu
 * yüzden Paris takviminde iki ay aranır.
 */
async function completeCashOp(db: Db, register: CashRegister, op: RegisterCashOp, now: Date): Promise<void> {
  const store = await new RegisterStoreService(db).findByWarehouse(op.warehouseId);
  if (!store) throw new Error(`kasa: kasa hareketinin mağaza eşlemesi yok (${op.id})`);
  const months = [...new Set([new Date(op.createdAt), now].map((at) => parisDateOf(at).slice(0, 7)))];
  for (const month of months) {
    const [year, monthNo] = month.split('-').map(Number) as [number, number];
    const found = (await register.listCashMoves(store.externalStoreId, { year, month: monthNo })).find((move) => move.label === op.label);
    if (found) {
      await new RegisterCashOpService(db).update({
        id: op.id,
        externalTillId: found.tillId,
        status: 'written',
        writtenAt: now.toISOString(),
      });
      return;
    }
  }
  const externalTillId = await register.moveCash({
    storeId: store.externalStoreId,
    direction: op.direction,
    amountCents: op.amountCents,
    label: op.label,
  });
  await new RegisterCashOpService(db).update({ id: op.id, externalTillId, status: 'written', writtenAt: now.toISOString() });
}
