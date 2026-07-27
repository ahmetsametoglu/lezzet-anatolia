import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OrderSchema,
  OrderInsertSchema,
  OrderUpdateSchema,
  OrderItemSchema,
  OrderItemInsertSchema,
  OrderItemUpdateSchema,
  OrderItemBatchSchema,
  OrderStatusLogSchema,
  OrderStatusLogInsertSchema,
  OrderStatusLogUpdateSchema,
  CloseResultSchema,
  DeliverResultSchema,
  PreparationResultSchema,
  QuickSaleResultSchema,
  TransitionResultSchema,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type Order,
  type OrderInsert,
  type OrderItem,
  type OrderItemInsert,
  type OrderItemUpdate,
  type OrderItemBatch,
  type OrderStatus,
  type CloseResult,
  type DeliverResult,
  type PaymentMethod,
  type PaymentStatus,
  type PreparationPick,
  type PreparationResult,
  type QuickSaleResult,
  type OrderStatusLog,
  type OrderStatusLogInsert,
  type OrderStatusLogUpdate,
  type OrderUpdate,
  type Page,
  type TransitionResult,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/** Yeni kalem girişi — sipariş bağı `create` içinde kurulur. */
export type CreateOrderItemInput = Omit<OrderItemInsert, 'orderId'>;

export class OrderItemService extends BaseDbService<OrderItem, OrderItemInsert, OrderItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_item', OrderItemSchema, OrderItemInsertSchema, OrderItemUpdateSchema);
  }

  listByOrder(orderId: string): Promise<OrderItem[]> {
    return this.getAll({ orderId });
  }

  addLines(rows: OrderItemInsert[]): Promise<OrderItem[]> {
    return this.bulkInsert(rows);
  }

  /**
   * Karşılanan miktarı yazar (hazırlıkta/kapıda eksik çıkınca). İade edilen kalemde ayrıca **mala ne
   * olduğu** işaretlenir: `goodwill`'de miktar DÜŞMEZ — mal müşteride kalmıştır (DOMAIN §8).
   */
  setFulfilled(id: string, fulfilledQty: number, returnDisposition?: OrderItem['returnDisposition']): Promise<OrderItem> {
    return this.update({ id, fulfilledQty, ...(returnDisposition !== undefined ? { returnDisposition } : {}) });
  }
}

export class OrderStatusLogService extends BaseDbService<OrderStatusLog, OrderStatusLogInsert, OrderStatusLogUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_status_log', OrderStatusLogSchema, OrderStatusLogInsertSchema, OrderStatusLogUpdateSchema, false);
  }

  /** Siparişin geçiş geçmişi — eskiden yeniye. */
  listByOrder(orderId: string): Promise<OrderStatusLog[]> {
    return this.getAll({ orderId }, { orderBy: 'createdAt' });
  }

  /**
   * Bir duruma İLK geçiş anı — teslim anı, kapanış anı ve geri bildirim zamanlaması (~10 gün)
   * buradan TÜRETİLİR; siparişte ayrı `delivered_at`/`completed_at` kolonu tutulmaz.
   */
  async firstEntryAt(orderId: string, status: OrderStatus): Promise<string | null> {
    const rows = await this.getAll({ orderId, toStatus: status }, { orderBy: 'createdAt', limit: 1 });
    return rows[0]?.createdAt ?? null;
  }
}

/**
 * Sipariş servisi (07.6) — ORDER_LIFECYCLE.
 *
 * **Karar vermez, satır getirir/yazar** (STACK §4). "Bu geçiş izinli mi", "referans üretilmeli mi",
 * "stok ne olmalı" kararları saf motordadır (`domain-core/order/status-machine`); ikisini birleştiren
 * kapı uygulama katmanındadır (`apps/web/lib/order`).
 */
export class OrderService extends BaseDbService<Order, OrderInsert, OrderUpdate> {
  private readonly items: OrderItemService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'order', OrderSchema, OrderInsertSchema, OrderUpdateSchema);
    this.items = new OrderItemService(supabase);
  }

  /**
   * Sipariş + kalemleri. Kalem yazımı düşerse **sipariş de geri alınır**: kalemsiz sipariş
   * anlamsızdır. Taslak siparişin para/stok etkisi henüz olmadığı için telafi güvenlidir —
   * rezervasyon ve tahsilatın da girdiği checkout akışı 07.4'te tek RPC'ye alınacak.
   */
  async create(order: OrderInsert, lines: CreateOrderItemInput[]): Promise<{ order: Order; items: OrderItem[] }> {
    if (lines.length === 0) throw new Error('order: kalemsiz sipariş açılamaz');

    const created = await this.insert(order);
    try {
      const items = await this.items.addLines(lines.map((line) => ({ ...line, orderId: created.id })));
      return { order: created, items };
    } catch (error) {
      await this.delete(created.id).catch(() => {});
      throw error;
    }
  }

  /**
   * **Hazırlık onayı** (06.5): depocunun onayladığı partiler yazılır ve her kalemin
   * `fulfilled_qty`'si Σ parti olur — ikisi `record_preparation` RPC'sinde bölünemez şekilde.
   *
   * Fiili stok BURADA DÜŞMEZ: mal hâlâ depoda/araçta, "ayrılmış" durumdadır. Düşüm teslimde (07.7).
   * Sipariş edilenden fazlası hazırlanamaz; eksik olabilir (kısmi karşılama).
   */
  async recordPreparation(orderId: string, picks: readonly PreparationPick[]): Promise<PreparationResult> {
    if (picks.length === 0) throw new Error('order: kalem seçimi boş olamaz');

    const raw = await this.executeRpc('record_preparation', {
      p_order_id: orderId,
      p_picks: picks.map((pick) => ({
        order_item_id: pick.orderItemId,
        batches: pick.batches.map((b) => ({ stock_id: b.stockId, qty: b.qty })),
      })),
    });
    return PreparationResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Teslim** (07.7): ayrılmış düşer, fiili stok kayıtlı partilerden düşer, `delivery_proof`
   * yazılır ve durum `delivered` olur — hepsi tek transaction'da. Sipariş artık yolda değilse
   * yazmaz, `stale` döner.
   */
  async deliver(orderId: string, opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null } = {}): Promise<DeliverResult> {
    const raw = await this.executeRpc('deliver_order', {
      p_order_id: orderId,
      p_actor_id: opts.actorId ?? null,
      p_delivery_proof: opts.deliveryProof ?? null,
    });
    return DeliverResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Kapanış** (07.7): kâr kalemleri SABİTLENİR (DOMAIN §12 — "kapanış = `completed`'a geçiş anı").
   * COGS gerçek maliyettir: tüketilen partilerin kendi alış fiyatından, ortalamadan değil.
   *
   * `payment_fee` burada yazılmaz — komisyon oranları para modülüyle (12) gelir; uydurma oranla
   * doldurmak kârı sessizce yanlış gösterirdi.
   */
  async close(orderId: string, costs: { actorId?: string | null; deliveryCost?: number | null; routeUnitCost?: number; packagingUnitCost?: number } = {}): Promise<CloseResult> {
    const raw = await this.executeRpc('close_order', {
      p_order_id: orderId,
      p_actor_id: costs.actorId ?? null,
      p_delivery_cost: costs.deliveryCost ?? null,
      p_route_unit_cost: costs.routeUnitCost ?? 0,
      p_packaging_unit_cost: costs.packagingUnitCost ?? 0,
    });
    return CloseResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Hızlı satış** (07.10): kapı önü tek adım — `draft → completed`. Rezervasyon yok, stok
   * fiiliden anında düşer; referans, tahsilat ve kâr kalemleri aynı transaction'da yazılır.
   *
   * Karar vermez: geçişin izinli olduğuna motor, ödeme durumuna motor (03.6), referansa motor
   * karar verir — hepsi parametre olarak gelir. RPC yalnız fiziksel gerçeği korur (olmayan mal
   * satılmaz).
   */
  async quickSale(input: {
    orderId: string;
    picks: readonly PreparationPick[];
    actorId?: string | null;
    referenceNo?: string | null;
    paymentMethod?: PaymentMethod | null;
    amountCollected?: number;
    paymentStatus?: PaymentStatus;
    packagingUnitCost?: number;
  }): Promise<QuickSaleResult> {
    if (input.picks.length === 0) throw new Error('order: kalem seçimi boş olamaz');

    const raw = await this.executeRpc('quick_sale', {
      p_order_id: input.orderId,
      p_picks: input.picks.map((pick) => ({
        order_item_id: pick.orderItemId,
        batches: pick.batches.map((b) => ({ stock_id: b.stockId, qty: b.qty })),
      })),
      p_actor_id: input.actorId ?? null,
      p_reference_no: input.referenceNo ?? null,
      p_payment_method: input.paymentMethod ?? null,
      p_amount_collected: input.amountCollected ?? 0,
      p_payment_status: input.paymentStatus ?? 'pending',
      p_packaging_unit_cost: input.packagingUnitCost ?? 0,
    });
    return QuickSaleResultSchema.parse(dbToApp(raw));
  }

  /** Siparişin kalem–parti eşlemesi — geri çağırma ve gerçek COGS bunun üstünde durur. */
  async listBatches(orderId: string): Promise<OrderItemBatch[]> {
    const { data, error } = await this.supabase
      .from('order_item_batch')
      .select('*,order_item!inner(order_id)')
      .eq('order_item.order_id', orderId);
    if (error) throw error;
    // Süzme için gömülen `order_item` şemada yok — Zod fazla anahtarı zaten eler.
    return (data ?? []).map((row) => OrderItemBatchSchema.parse(dbToApp(row)));
  }

  /** Sipariş + kalemleri TEK sorguda — kalem başına ayrı sorgu (N+1) yerine gömülü select. */
  async getWithItems(id: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.getById(id);
    if (!order) return null;
    return { order, items: await this.items.listByOrder(id) };
  }

  /** Müşterinin sipariş geçmişi — en yeni önce, sonsuz kaydırma. */
  listByCustomer(customerId: string, opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<Order>> {
    return this.getPage({ customerId }, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /** Operasyon kuyruğu: duruma (ve varsa güne) göre. Depo/kurye ekranlarının okuması. */
  listByStatus(status: OrderStatus | OrderStatus[], opts: { deliveryDate?: string; limit?: number } = {}): Promise<Order[]> {
    return this.getAll(
      { status: Array.isArray(status) ? status : [status], deliveryDate: opts.deliveryDate },
      { orderBy: 'createdAt', limit: opts.limit },
    );
  }

  /**
   * **Durum ilerletme** — `transition_order_status` RPC'si üzerinden: durum güncellemesi + log satırı
   * tek transaction'da, üstelik yalnız BEKLENEN kaynaktan (koşullu). Araya biri girmişse yazmaz,
   * `ok:false` + `stale` döner ve çağıran yeniden karar verir.
   *
   * Geçişin izinli olup olmadığı burada SORGULANMAZ — motor karar verir, bu uç kararı uygular.
   */
  async transition(input: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    actorId?: string | null;
    /** İlk kalıcı durumda üretilen referans (motor üretir); mevcut numarayı ezmez. */
    referenceNo?: string | null;
  }): Promise<TransitionResult> {
    const raw = await this.executeRpc('transition_order_status', {
      p_order_id: input.orderId,
      p_from: input.from,
      p_to: input.to,
      p_actor_id: input.actorId ?? null,
      p_reference_no: input.referenceNo ?? null,
    });
    return TransitionResultSchema.parse(dbToApp(raw));
  }
}
