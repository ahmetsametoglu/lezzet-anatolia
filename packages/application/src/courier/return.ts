import {
  DeliveryRunCloseService,
  DeliveryRunService,
  OrderBoxService,
  OrderService,
  UserProfileService,
} from '@lezzet/database';
import { canAccessWarehouse, type WarehouseScope } from '@lezzet/domain-core';
import type { AcceptCourierReturnResponse, CourierReturnDraft, Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customerCardsOf } from './names';
import { readVanStock, returnFromVan, vehicleWarehouseOf } from './van-stock';

/**
 * **KURYE DÖNÜŞÜ — SAY VE DEVRET · KUTU İNİŞİ** (v3:14 · kurye denetimi bulgu 5, 03.09).
 *
 * Depocunun kapısı: kurye rampaya döndü, depocu araçtan ineni teslim alıyor. Sözleşme künyesi
 * (`courier-return-api.schema.ts`) üç listeyi ve farkın nereye yazıldığını anlatıyor; burada
 * yalnız KARARLAR duruyor.
 *
 * ── KURYE BURADA ÖZNE DEĞİL NESNE ────────────────────────────────────────────
 * `courierId` depocunun seçtiği kişidir, jetondan gelen değil: teslim alan depocu, teslim eden
 * kurye. Depocunun kapsamı kuryenin ARAÇ deposunu içermeyebilir (kapsam tesise bağlı) — ölçüt
 * kuryenin TESİSİ: kurye bu depoya bağlıysa aracı da bu rampaya döner. Başka tesisin kuryesi
 * `out_of_scope`.
 *
 * ── HANGİ SEFERLERİN KUTULARI ────────────────────────────────────────────────
 * Kutu listeleri kuryenin KAPANMIŞ seferlerinden değil, kuryeye damgalı siparişlerin ARAÇTA
 * DAMGALI kutularından kurulur (`loaded_at` dolu). Sefer sınırı yok ve bu bilinçli: dünkü seferin
 * reddedilen kutusu bugün de araçtaysa yine inmelidir. Ayrım siparişin durumundan:
 *   · `returned` → İNER (reddedilen mal depoya döner, akıbetini D6'nın öteki bölümü seçer);
 *   · `ready`/`confirmed`/`preparing` → KALIR: ya ulaşılamayan durak ("yeniden planlanacak — kabul
 *     edilmez", v3:14) ya da araçta bekleyen/sürülen başka seferin kutusu;
 *   · `out_for_delivery` → KALIR (sürülen sefer) — o kutu daha yolda.
 *
 * ── SERBEST ÜRÜN BEKLENENİ ARAÇ DEPOSUDUR ────────────────────────────────────
 * "Alınan − satılan = dönen" ayrıca HESAPLANMAZ: araç deposundaki kayıt zaten o farkın kendisi
 * (araca alma transferi, kapıda satış düşümü). İkinci bir hesap bir gün birincisinden ayrılırdı.
 */

/** Askıda/araçta kalan kutunun neden kaldığı — sözleşmedeki enum'un aynası. */
type StayReason = 'unreachable' | 'other_run';

export async function readCourierReturn(
  db: SupabaseClient,
  input: { courierId: string; warehouseId: string; scope: WarehouseScope },
): Promise<CourierReturnDraft | { status: 'forbidden'; reason: 'out_of_scope' | 'not_courier' }> {
  const courier = await courierOf(db, input);
  if ('status' in courier) return courier;

  const [freeGoods, boxes] = await Promise.all([
    courier.vehicleWarehouseId === null
      ? Promise.resolve([])
      : readVanStock(db, { vehicleWarehouseId: courier.vehicleWarehouseId, sourceWarehouseId: input.warehouseId }),
    loadedBoxesOf(db, input.courierId),
  ]);

  const customers = await customerCardsOf(db, boxes.orders);
  const runRefs = await runReferencesOf(db, boxes.orders);
  const card = (order: Order) => ({
    orderId: order.id,
    referenceNo: order.referenceNo,
    customerName: customers.get(order.customerId)?.name ?? '—',
    boxes: boxes.byOrder.get(order.id)!.map((box) => ({ boxNo: box.boxNo, code: box.code })),
  });

  return {
    courierId: courier.id,
    courierName: courier.name,
    vehicleWarehouseId: courier.vehicleWarehouseId,
    freeGoods: freeGoods.map((line) => ({
      variantId: line.variantId,
      name: line.name,
      variantLabel: line.variantLabel,
      imageUrl: line.imageUrl,
      onVanQty: line.qty,
    })),
    boxesDown: boxes.orders.filter((order) => order.status === 'returned').map(card),
    boxesStay: boxes.orders
      .filter((order) => order.status !== 'returned')
      .map((order) => ({ ...card(order), reason: stayReasonOf(order, runRefs), runReferenceNo: runRefs.get(order.deliveryRunId ?? '')?.referenceNo ?? null })),
  };
}

/**
 * **Kabul** — sayılan dönen adet araca→depoya transfer olur, reddedilen kutuların damgası silinir.
 *
 * Sıra: önce MAL (transferler), sonra KUTU damgası. Bir transfer düşerse (`not_enough`/`stuck`)
 * kapı orada durur ve düşen varyantı adıyla söyler; o ana kadar yazılan transferler gerçek
 * hareketlerdir ve geri alınmaz — mal fiilen rampada, kayıt onu izliyor. Depocu sayıyı düzeltip
 * yeniden kabul eder: transfer olmuş varyant artık araçta görünmez, ikinci turda yeniden yazılmaz.
 */
export async function acceptCourierReturn(
  db: SupabaseClient,
  input: {
    courierId: string;
    warehouseId: string;
    scope: WarehouseScope;
    actorId: string | null;
    freeGoods: ReadonlyArray<{ variantId: string; returnedQty: number }>;
  },
): Promise<AcceptCourierReturnResponse> {
  const courier = await courierOf(db, input);
  if ('status' in courier) return courier;

  const expected = new Map<string, number>();
  if (courier.vehicleWarehouseId !== null) {
    for (const line of await readVanStock(db, { vehicleWarehouseId: courier.vehicleWarehouseId })) {
      expected.set(line.variantId, line.qty);
    }
  }
  if (input.freeGoods.length > 0 && courier.vehicleWarehouseId === null) return { status: 'no_vehicle' };

  const transferred: Array<{ variantId: string; qty: number }> = [];
  const shortfalls: Array<{ variantId: string; expectedQty: number; returnedQty: number }> = [];
  for (const line of input.freeGoods) {
    const expectedQty = expected.get(line.variantId) ?? 0;
    if (line.returnedQty > expectedQty) return { status: 'not_enough', variantId: line.variantId, available: expectedQty };
    if (line.returnedQty < expectedQty) shortfalls.push({ variantId: line.variantId, expectedQty, returnedQty: line.returnedQty });
    if (line.returnedQty === 0) continue;

    const moved = await returnFromVan(db, {
      warehouseId: input.warehouseId,
      vehicleWarehouseId: courier.vehicleWarehouseId,
      variantId: line.variantId,
      qty: line.returnedQty,
      actorId: input.actorId,
    });
    if (moved.status === 'ok') {
      transferred.push({ variantId: line.variantId, qty: moved.movedQty });
      continue;
    }
    if (moved.status === 'stuck') return { status: 'stuck', variantId: line.variantId, transferId: moved.transferId };
    if (moved.status === 'not_enough') return { status: 'not_enough', variantId: line.variantId, available: moved.available };
    if (moved.status === 'no_vehicle') return { status: 'no_vehicle' };
    return { status: 'forbidden', reason: 'out_of_scope' };
  }

  // Kutu inişi: reddedilen siparişin araçta damgalı kutuları. Damga bir emanet kaydıydı; mal rampada.
  const boxes = await loadedBoxesOf(db, input.courierId);
  const boxService = new OrderBoxService(db);
  let unloadedBoxes = 0;
  for (const order of boxes.orders) {
    if (order.status !== 'returned') continue;
    for (const box of boxes.byOrder.get(order.id) ?? []) {
      await boxService.update({ id: box.id, loadedAt: null, loadedBy: null });
      unloadedBoxes += 1;
    }
  }

  return { status: 'ok', transferred, shortfalls, unloadedBoxes };
}

/** Kurye profili + kapsam kararı + araç deposu — iki kapının ortak girişi. */
async function courierOf(
  db: SupabaseClient,
  input: { courierId: string; warehouseId: string; scope: WarehouseScope },
): Promise<{ id: string; name: string; vehicleWarehouseId: string | null } | { status: 'forbidden'; reason: 'out_of_scope' | 'not_courier' }> {
  if (!canAccessWarehouse(input.scope, input.warehouseId)) return { status: 'forbidden', reason: 'out_of_scope' };
  const profile = await new UserProfileService(db).getById(input.courierId);
  if (!profile || !profile.roles.includes('courier')) return { status: 'forbidden', reason: 'not_courier' };
  // Kurye BU tesise bağlı olmalı: aracı bu rampaya döner. Başka tesisin kuryesi burada teslim vermez.
  if (!profile.warehouseIds.includes(input.warehouseId)) return { status: 'forbidden', reason: 'out_of_scope' };
  return { id: profile.id, name: profile.name, vehicleWarehouseId: await vehicleWarehouseOf(db, profile.warehouseIds) };
}

/** Kuryeye damgalı siparişlerin ARAÇTA damgalı kutuları — sipariş başına gruplu. */
async function loadedBoxesOf(db: SupabaseClient, courierId: string) {
  const orders = await new OrderService(db).listByCourier(courierId, { limit: 200 });
  const candidates = orders.filter((order) => !['delivered', 'completed', 'cancelled'].includes(order.status));
  const allBoxes = candidates.length === 0 ? [] : await new OrderBoxService(db).listByOrders(candidates.map((order) => order.id));
  const byOrder = new Map<string, typeof allBoxes>();
  for (const box of allBoxes) {
    if (box.loadedAt === null) continue;
    const bucket = byOrder.get(box.orderId);
    if (bucket) bucket.push(box);
    else byOrder.set(box.orderId, [box]);
  }
  return { orders: candidates.filter((order) => byOrder.has(order.id)), byOrder };
}

/** Sefer künyeleri (referans + kapanmış mı) — "kalıyor" satırının sebebini adlandırmak için. */
async function runReferencesOf(db: SupabaseClient, orders: readonly Order[]): Promise<Map<string, { referenceNo: string; closed: boolean }>> {
  const runIds = [...new Set(orders.map((order) => order.deliveryRunId).filter((id): id is string => id !== null))];
  if (runIds.length === 0) return new Map();
  const [runs, closes] = await Promise.all([
    new DeliveryRunService(db).listByIds(runIds),
    new DeliveryRunCloseService(db).listByRuns(runIds),
  ]);
  const closedIds = new Set(closes.map((close) => close.deliveryRunId));
  return new Map(runs.map((run) => [run.id, { referenceNo: run.referenceNo, closed: closedIds.has(run.id) }]));
}

/**
 * Neden araçta kalıyor: seferi KAPANMIŞ bir `ready` durak ulaşılamayandır (yeniden planlanacak);
 * seferi açık olan ya da hiç sefere bağlı olmayan kutu başka bir seferin yüküdür.
 */
function stayReasonOf(order: Order, runRefs: ReadonlyMap<string, { closed: boolean }>): StayReason {
  const run = order.deliveryRunId === null ? null : runRefs.get(order.deliveryRunId) ?? null;
  return order.status === 'ready' && run !== null && run.closed ? 'unreachable' : 'other_run';
}
