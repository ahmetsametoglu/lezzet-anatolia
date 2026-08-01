import {
  OrderItemService,
  OrderService,
  ProductService,
  ProductVariantService,
  ReservationService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { suggestShortfallAction, type ShortfallSuggestion } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type { Order, OrderItem, PreparationPick, PreparationResult, TransitionResult } from '@lezzet/types';
import { suggestPicksForVariant } from '../stock/fefo';

/**
 * Depo hazırlık kuyruğu ve onayı (10.1–10.3) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/depo-hazirlik.md` bağlayıcı.
 *
 * **Para bu dosyadan GEÇMEZ.** Tasarımın altın kuralı ("depocu fiyat, tutar, kâr, maliyet asla
 * görmez") burada bir arayüz disiplini değil, **yapısal bir sınır**: dönen görünüm modelinde para
 * alanı YOKTUR. Ekran isteseydi bile gösteremez; kural tek yerde, veri şeklinde durur.
 *
 * Eksik kararının parasal ölçütü motorda kullanılır ama dışarı çıkmaz: motor tavsiyeyi döner,
 * tutarı değil (`domain-core/stock/shortfall`).
 */

/** Bir kalemin hazırlık satırı — ürün/adet/parti; fiyat yok. */
export interface PreparationLine {
  itemId: string;
  variantId: string;
  /** "Fıstıklı Baklava" — müşterinin dilinde değil, operasyon dilinde (Türkçe). */
  productName: string;
  /** "500 g" gibi boy etiketi; tek boylu üründe boş. */
  variantLabel: string;
  orderedQty: number;
  /** Daha önce hazırlanmış adet — yarım kalan iş kaldığı yerden sürer (tasarım §4). */
  pickedQty: number;
  /**
   * Partiye kilitli mi (indirimli teklif kalemi). Kilitliyse öneri değil ZORUNLULUKTUR: depocu
   * başka partiden veremez, kapı da yazdırmaz.
   */
  pinnedStockId: string | null;
  /** Sistem önerisi: hangi partiden kaç adet — bir kalem birden çok partiye bölünebilir. */
  suggestion: { stockId: string; qty: number; expiryDate: string; location: string | null }[];
  /** Önerilen partiler istenen adedi karşılayamıyorsa kalan (fiziksel eksik sinyali). */
  shortfallQty: number;
}

/** Kuyruk satırı — sipariş künyesi + kalemleri. Tutar, adres, iletişim YOK (tasarım §6). */
export interface PreparationOrder {
  orderId: string;
  referenceNo: string | null;
  customerName: string;
  /** B2B/B2C — hacim beklentisini kurar (B2B 10-50 koli olabilir). */
  channel: Order['channel'];
  status: Order['status'];
  deliveryDate: string | null;
  lineCount: number;
  /** Toplanan kalem sayısı — hazırlık ilerlemesi. */
  pickedLineCount: number;
  lines: PreparationLine[];
}

/**
 * Günün hazırlama listesi. `confirmed` ve `preparing` birlikte gelir: ikincisi yarım kalan iştir,
 * ekranda kaybolmamalı (tasarım §4 — "yarım kalan hazırlık").
 *
 * Teslim gününe göre süzülür; gün verilmezse bekleyen her sipariş gelir. **Arşiv yığılmaz**:
 * teslim edilmiş/kapanmış sipariş bu okumaya hiç girmez.
 */
/**
 * Hazırlık kuyruğu. `warehouseId` verilirse yalnız o deponun siparişleri — depocu başka deponun
 * kuyruğunu GÖRMEZ (C5) ve zaten hazırlayamaz: partiler siparişin deposundan seçilir. Verilmezse
 * depo-üstü (admin). Kapsam kararı guard'ın işi (`requireWarehouseScope`), servisin değil.
 */
export async function listPreparationQueue(
  opts: { deliveryDate?: string; limit?: number; warehouseId?: string } = {},
): Promise<PreparationOrder[]> {
  const db = serviceDb();
  const orders = await new OrderService(db).listByStatus(['confirmed', 'preparing'], {
    deliveryDate: opts.deliveryDate,
    limit: opts.limit ?? 50,
    warehouseId: opts.warehouseId,
  });
  if (orders.length === 0) return [];

  const items = await new OrderItemService(db).listByOrders(orders.map((order) => order.id));
  const [names, customers, pinned] = await Promise.all([
    variantNames(db, items),
    customerNames(db, orders),
    pinnedStockIds(db, orders.map((order) => order.id)),
  ]);

  const queue: PreparationOrder[] = [];
  for (const order of orders) {
    const orderItems = items.filter((item) => item.orderId === order.id);
    const lines = await Promise.all(
      orderItems.map((item) =>
        buildLine(order.warehouseId, item, names.get(item.variantId), pinned.get(`${order.id}:${item.variantId}`) ?? item.stockId),
      ),
    );

    queue.push({
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customers.get(order.customerId) ?? '—',
      channel: order.channel,
      status: order.status,
      deliveryDate: order.deliveryDate,
      lineCount: lines.length,
      pickedLineCount: lines.filter((line) => line.pickedQty >= line.orderedQty).length,
      lines,
    });
  }
  return queue;
}

/**
 * Kalem satırı + parti önerisi. Kilitli kalemde öneri o partiye sabitlenir — FEFO'ya sorulmaz:
 * teklife söz verilen stok başka partiyle karşılanamaz (DOMAIN §4).
 */
async function buildLine(
  // Hazırlık siparişin deposundan toplanır: FEFO önerisi başka deponun partisini gösteremez.
  warehouseId: string,
  item: OrderItem,
  variant: { productName: string; label: string } | undefined,
  pinnedStockId: string | null,
): Promise<PreparationLine> {
  const remaining = Math.max(0, item.qty - item.fulfilledQty);

  if (pinnedStockId) {
    const batch = await new StockService(serviceDb()).getById(pinnedStockId);
    return {
      itemId: item.id,
      variantId: item.variantId,
      productName: variant?.productName ?? '—',
      variantLabel: variant?.label ?? '',
      orderedQty: item.qty,
      pickedQty: item.fulfilledQty,
      pinnedStockId,
      suggestion: batch ? [{ stockId: batch.id, qty: remaining, expiryDate: batch.expiryDate, location: batch.location ?? null }] : [],
      shortfallQty: batch ? Math.max(0, remaining - batch.physicalQty) : remaining,
    };
  }

  const fefo = await suggestPicksForVariant(warehouseId, item.variantId, remaining);
  return {
    itemId: item.id,
    variantId: item.variantId,
    productName: variant?.productName ?? '—',
    variantLabel: variant?.label ?? '',
    orderedQty: item.qty,
    pickedQty: item.fulfilledQty,
    pinnedStockId: null,
    suggestion: fefo.picks.map((pick) => ({ stockId: pick.stockId, qty: pick.qty, expiryDate: pick.expiryDate, location: pick.location ?? null })),
    shortfallQty: fefo.shortfall,
  };
}

type ConfirmOutcome =
  | { status: 'ok'; items: number; ready: boolean; shortfalls: { itemId: string; suggestion: ShortfallSuggestion }[] }
  /** Kilitli kalem başka partiden verilmek istendi — yazım yapılmadı. */
  | { status: 'pinned_violation'; itemId: string; requiredStockId: string }
  | { status: 'not_found' };

/**
 * **Hazırlık onayı** (10.1/10.2). Seçilen partiler yazılır; sipariş tamamen toplandıysa `ready`'e
 * geçer. Eksik kalan kalem varsa motorun tavsiyesi döner — **karar depocunundur**, kapı onun yerine
 * karar vermez (tasarım §3).
 *
 * Kilitli kalem kontrolü BURADA: RPC fiziksel gerçeği korur (olmayan mal yazılmaz) ama "bu kalem şu
 * partiden çıkmalı" bir iş kuralıdır, veritabanının değil uygulamanın sorusudur.
 */
export async function confirmPreparation(input: {
  orderId: string;
  picks: readonly PreparationPick[];
  actorId?: string | null;
}): Promise<ConfirmOutcome> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };

  const pinned = await pinnedStockIds(db, [input.orderId]);
  for (const pick of input.picks) {
    const item = found.items.find((row) => row.id === pick.orderItemId);
    if (!item) continue;
    const requiredStockId = pinned.get(`${input.orderId}:${item.variantId}`) ?? item.stockId;
    if (!requiredStockId) continue;

    const wrong = pick.batches.find((batch) => batch.stockId !== requiredStockId);
    if (wrong) return { status: 'pinned_violation', itemId: item.id, requiredStockId };
  }

  const result: PreparationResult = await new OrderService(db).recordPreparation(input.orderId, input.picks);

  // Tavsiye için tutar motora GİRDİ olarak verilir, dönen değerde yer almaz (depocu parayı görmez).
  const thresholds = await shortfallThresholds(db);
  const shortfalls = [];
  for (const pick of input.picks) {
    const item = found.items.find((row) => row.id === pick.orderItemId);
    if (!item) continue;
    const picked = pick.batches.reduce((sum, batch) => sum + batch.qty, 0);
    if (picked >= item.qty) continue;

    shortfalls.push({
      itemId: item.id,
      suggestion: suggestShortfallAction({
        orderedQty: item.qty,
        pickedQty: picked,
        missingValueCents: Math.round(item.unitPrice * 100) * (item.qty - picked),
        thresholds,
      }),
    });
  }

  // Tamamı toplandıysa sipariş sevkiyata hazırdır. Eksik varsa `preparing`'de kalır: karar
  // verilmeden ilerletmek, depocunun elindeki soruyu atlamak olurdu.
  const complete = found.items.every((item) => {
    const pick = input.picks.find((row) => row.orderItemId === item.id);
    return (pick?.batches.reduce((sum, batch) => sum + batch.qty, 0) ?? item.fulfilledQty) >= item.qty;
  });

  let ready = false;
  if (complete) {
    const transition: TransitionResult = await new OrderService(db).transition({
      orderId: input.orderId,
      from: found.order.status,
      to: 'ready',
      actorId: input.actorId,
    });
    ready = transition.ok;
  }

  return { status: 'ok', items: result.items, ready, shortfalls };
}

/** Eşikler ayardan — kodda sabit yok (CLAUDE.md §4). */
async function shortfallThresholds(db: ReturnType<typeof serviceDb>): Promise<{ ratio: number; valueCents: number }> {
  const settings = new SettingsService(db);
  const [ratioPercent, valueCents] = await Promise.all([
    settings.getNumber('shortfall_ask_ratio_percent', 50),
    settings.getNumber('shortfall_ask_value_cents', 1_500),
  ]);
  return { ratio: ratioPercent / 100, valueCents };
}

/** Siparişin partiye ÇIPALI rezervasyonları — `order:variant` anahtarıyla. */
async function pinnedStockIds(db: ReturnType<typeof serviceDb>, orderIds: readonly string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const reservations = new ReservationService(db);
  for (const orderId of orderIds) {
    for (const row of await reservations.listActiveByOrder(orderId)) {
      if (row.stockId) map.set(`${orderId}:${row.variantId}`, row.stockId);
    }
  }
  return map;
}

/** Varyant → ürün adı + boy etiketi. Operasyon yüzeyi Türkçedir (CLAUDE.md §2). */
async function variantNames(
  db: ReturnType<typeof serviceDb>,
  items: readonly OrderItem[],
): Promise<Map<string, { productName: string; label: string }>> {
  const variants = await new ProductVariantService(db).listByIds([...new Set(items.map((item) => item.variantId))]);
  const products = await new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]);
  const productOf = new Map(products.map((product) => [product.id, product]));

  return new Map(
    variants.map((variant) => [
      variant.id,
      {
        productName: resolveLocalizedText(productOf.get(variant.productId)?.name ?? {}, 'tr'),
        label: resolveLocalizedText(variant.label, 'tr'),
      },
    ]),
  );
}

/** Müşteri adı — koli etiketleme için. İletişim ve adres OKUNMAZ (tasarım §6). */
async function customerNames(db: ReturnType<typeof serviceDb>, orders: readonly Order[]): Promise<Map<string, string>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, string>();
  for (const customerId of new Set(orders.map((order) => order.customerId))) {
    const profile = await profiles.getById(customerId);
    if (profile) map.set(customerId, profile.name);
  }
  return map;
}
