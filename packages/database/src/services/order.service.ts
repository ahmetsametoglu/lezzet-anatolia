import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import {
  OrderSchema,
  OrderInsertSchema,
  OrderUpdateSchema,
  OrderItemSchema,
  OrderItemInsertSchema,
  OrderItemUpdateSchema,
  OrderStatusLogSchema,
  OrderStatusLogInsertSchema,
  OrderStatusLogUpdateSchema,
  CancelResultSchema,
  DeliverResultSchema,
  DeliverWithAdjustmentsResultSchema,
  FulfillmentResultSchema,
  PreparationResultSchema,
  QuickSaleResultSchema,
  OrderCountsRowSchema,
  OrderStatusEnum,
  PaymentStatusEnum,
  TransitionResultSchema,
  DEFAULT_PAGE_SIZE,
  type Channel,
  type DeliveryType,
  type KeysetCursor,
  type Order,
  type OrderSource,
  type OrderInsert,
  type OrderItem,
  type OrderItemInsert,
  type OrderItemUpdate,
  type OrderCancelReason,
  type OrderStatus,
  type CancelResult,
  type DeliverResult,
  type FulfillmentAdjustment,
  type DeliverWithAdjustmentsResult,
  type FulfillmentResult,
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
import { fromCents, toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { ilikeContains, ilikeTerm } from '../utils/filter-term';
import { appToDb, dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents, rpcMoneyToEuro } from '../utils/rpc-money';

/** Sipariş listesinin süzgeçleri; liste ve sayaç aynı tipi alır, yoksa başlıktaki sayı listeyle ayrışırdı. */
export interface OrderListFilters {
  /** Boşsa listenin kendi kümesi (taslak hariç tüm durumlar) geçerlidir. */
  status?: OrderStatus[];
  /**
   * Depo süzgeci bir küme: `undefined` depo-üstü (yalnız admin/muhasebe), dolu dizi kapsamdaki depolar, boş dizi hiçbiri.
   * Sayaçlar listeyle aynı süzgeci RPC'nin içinde alır, yoksa başlık ile liste ayrışırdı.
   */
  warehouseIds?: readonly string[];
  channel?: Channel;
  source?: OrderSource;
  deliveryType?: DeliveryType;
  paymentStatus?: PaymentStatus;
  /** Serbest arama — referans numarasında. Müşteri ekseni `customerIds` ile ayrı gelir. */
  query?: string;
  /** Aramanın müşteri ayağı: `UserProfileService.search` sonucu. */
  customerIds?: string[];
  /** Teslim günü aralığı (gün, dahil). */
  deliveryFrom?: string;
  deliveryTo?: string;
}

/** `order_counts()` çıktısı. Tutarlar EURO (DB tabanı); kuruşa çevirmek görünümün işi (STACK §8). */
export interface OrderCounts {
  /** Duruma göre adet — sıfır olan durum haritada HİÇ yoktur (ekran `?? 0` okur). */
  byStatus: Map<OrderStatus, number>;
  total: number;
  /** Tutarlar **cent** (02.9 · STACK §8) — RPC euro toplar, çevrim `counts()` sınırında. */
  sum: { totalCents: number; collectedCents: number; refundedCents: number };
  cod: { count: number; totalCents: number; collectedCents: number; refundedCents: number };
  /** İptal hariç sayılan iş — künyesi `OrderCountsRowSchema`da. */
  active: { count: number; totalCents: number };
}

/**
 * Listede görünen durumlar — taslak hariç: yarım kalmış checkout iş kuyruğuna karışmasın (süpürücü onu iptal eder).
 */
const LISTED_STATUSES = OrderStatusEnum.options.filter((s) => s !== 'draft');

/** Eşitlik süzgeçleri — durum verilmediyse listenin kendi kümesi devreye girer. */
function listedFilters(f: OrderListFilters): Record<string, unknown> {
  return {
    status: f.status?.length ? f.status : LISTED_STATUSES,
    channel: f.channel,
    orderSource: f.source,
    deliveryType: f.deliveryType,
    paymentStatus: f.paymentStatus,
    // Dizi → `in` süzgeci; `undefined` → süzgeç yok (depo-üstü). Boş dizi buraya HİÇ gelmez:
    // çağıranlar `emptyScope` ile erkenden dönüyor (aşağıda) — `in.()` PostgREST'te sözdizimi
    // hatasıdır ve süzgeci atlamak sessizce her deponun siparişini getirirdi.
    warehouseId: f.warehouseIds ? [...f.warehouseIds] : undefined,
  };
}

/** Boş kapsam "hiçbir depo" demektir, depo-üstü değil; karıştırmak kapsamsız personele her şeyi gösterirdi. */
function emptyScope(f: OrderListFilters): boolean {
  return f.warehouseIds?.length === 0;
}

/** Arama ve tarih aralığı — eşitliğe sığmayan süzgeçler. */
function searchOptions(f: OrderListFilters): { orFilters?: string[]; rangeFilters?: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> } {
  // Terim kaçışı tek kaynakta (`ilikeTerm`): üç serviste aynı satır olarak duruyordu.
  const safe = ilikeTerm(f.query);
  const ids = f.customerIds ?? [];
  const or = safe
    ? [[ilikeContains('reference_no', safe), ...(ids.length ? [`customer_id.in.(${ids.join(',')})`] : [])].join(',')]
    : undefined;

  const ranges: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
  if (f.deliveryFrom) ranges.push({ field: 'deliveryDate', operator: 'gte', value: f.deliveryFrom });
  if (f.deliveryTo) ranges.push({ field: 'deliveryDate', operator: 'lte', value: f.deliveryTo });

  return { orFilters: or, rangeFilters: ranges.length ? ranges : undefined };
}

/**
 * Para alan listeleri TEK yerde: hem `moneyFields` beyanı hem RPC gövdesinin euro'ya indirilmesi
 * aynı listeyi kullanır. İki yerde ayrı yazılsaydı biri güncellenir öbürü unutulur ve RPC'ye giden
 * anahtar sessizce düşerdi (`rpcMoneyToEuro` künyesi).
 */
const ITEM_MONEY_FIELDS = ['unitPriceCents', 'listUnitPriceCents', 'lineDiscountAmountCents'];
/** Dışa verilir: `order_sale` görünümü aynı para kolonlarını taşır, iki ayrı liste bir gün ayrışırdı. */
export const ORDER_MONEY_FIELDS = [
  'shippingFeeCents',
  'orderedTotalCents',
  'revenueTotalCents',
  'discountAmountCents',
  'amountCollectedCents',
  'amountRefundedCents',
  'cogsAmountCents',
  'deliveryCostCents',
  'paymentFeeCents',
  'packagingCostCents',
];

/** Yeni kalem girişi — sipariş bağı `create` içinde kurulur (kimlik RPC'de doğar, dışarıdan gelmez). */
const CreateOrderItemSchema = OrderItemInsertSchema.omit({ orderId: true });
export type CreateOrderItemInput = z.infer<typeof CreateOrderItemSchema>;

export class OrderItemService extends BaseDbService<OrderItem, OrderItemInsert, OrderItemUpdate> {
  /** Kolonlar `unit_price` / `line_discount_amount` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ITEM_MONEY_FIELDS;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'order_item', OrderItemSchema, OrderItemInsertSchema, OrderItemUpdateSchema);
  }

  listByOrder(orderId: string): Promise<OrderItem[]> {
    return this.getAll({ orderId });
  }

  /**
   * Çok siparişin kalemleri tek turda; kimlikler öbeklenir, çünkü `in(...)` listesi URL'e gömülür ve binlerce
   * uuid'de istek satırı sınırı aşar.
   */
  async listByOrders(orderIds: readonly string[]): Promise<OrderItem[]> {
    const BATCH_SIZE = 200;
    const all: OrderItem[] = [];
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      all.push(...(await this.getAll({ orderId: orderIds.slice(i, i + BATCH_SIZE) })));
    }
    return all;
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

  /** Birden çok siparişin geçiş geçmişi — kurye gün listesi gibi toplu okumalar için (N+1 yerine). */
  async listByOrders(orderIds: readonly string[]): Promise<OrderStatusLog[]> {
    if (orderIds.length === 0) return [];
    return this.getAll({ orderId: [...orderIds] }, { orderBy: 'createdAt' });
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
 * Sipariş servisi: karar vermez, satır getirir ve yazar; geçiş, referans ve stok soruları motorda cevaplanır.
 */
export class OrderService extends BaseDbService<Order, OrderInsert, OrderUpdate> {
  /** Sipariş başlığının para kolonları (hepsi euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ORDER_MONEY_FIELDS;

  private readonly items: OrderItemService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'order', OrderSchema, OrderInsertSchema, OrderUpdateSchema);
    this.items = new OrderItemService(supabase);
  }

  /**
   * Sipariş, kalemleri ve (indirim varsa) kullanım kaydı tek transaction'da (`create_order`): kullanım kaydı olmayan
   * indirimli sipariş kotayı sessizce deler. Kota RPC'de tükenir ki sipariş açan her yol aynı kuralı çağıranın hatırlamasına bağlı kalmadan uygulasın.
   */
  async create(
    order: OrderInsert,
    lines: CreateOrderItemInput[],
    /** Kuponun hangi kodundan girildiği; kotayı bölmez, yalnız kırılım içindir. */
    opts: { discountCodeId?: string | null } = {},
  ): Promise<{ order: Order; items: OrderItem[] }> {
    // RPC de reddediyor; buradaki kontrol gidiş-dönüşü boşuna harcamamak için (mesaj aynı).
    if (lines.length === 0) throw new Error('order: kalemsiz sipariş açılamaz');

    // Gövde jsonb gitse de Zod'dan geçer; RPC anahtarları tablonun kolonlarıyla kesiştirdiği için adlar birebir tutmalı.
    // Para bu yüzden burada euro'ya iner: `unitPriceCents` gibi bir anahtar kolonla eşleşmez ve sessizce düşerdi.
    const orderId = await this.executeRpc<string>('create_order', {
      p_order: appToDb(rpcMoneyToEuro(this.insertSchema.parse(order), ORDER_MONEY_FIELDS)),
      p_items: lines.map((line) => appToDb(rpcMoneyToEuro(CreateOrderItemSchema.parse(line), ITEM_MONEY_FIELDS))),
      p_discount_code_id: opts.discountCodeId ?? null,
    });

    // Yazılan satır geri okunur, çünkü varsayılanlar ve tetikleyiciler veritabanının kararıdır. Kalem sırası
    // okuma sırasıdır; kalemi kimliğinden tanıyın.
    const created = await this.getWithItems(orderId);
    if (!created) throw new Error(`[order.create] sipariş yazıldı ama okunamadı: ${orderId}`);
    return created;
  }

  /**
   * Hazırlık onayı: onaylanan partiler ve kalemin `fulfilled_qty`'si `record_preparation`da bölünmez yazılır.
   * Fiili stok burada düşmez, mal hâlâ ayrılmıştır; düşüm teslimdedir.
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
   * Kalem düzeltmesi: `fulfilled_qty`, kalem–parti kaydı ve stok tek transaction'da tutarlı kalır, yoksa
   * "para iade edildi ama mal ortada yok" hâli doğar. Para burada yazılmaz.
   */
  async adjustFulfillment(orderId: string, lines: readonly FulfillmentAdjustment[], actorId?: string | null): Promise<FulfillmentResult> {
    if (lines.length === 0) throw new Error('order: düzeltme listesi boş olamaz');

    const raw = await this.executeRpc('adjust_fulfillment', {
      p_order_id: orderId,
      p_lines: lines.map((line) => ({
        order_item_id: line.orderItemId,
        fulfilled_qty: line.fulfilledQty,
        return_disposition: line.returnDisposition ?? null,
        note: line.note ?? null,
      })),
      p_actor_id: actorId ?? null,
    });
    return FulfillmentResultSchema.parse(dbToApp(raw));
  }

  /**
   * Kapıda tek yazım: düzeltme ve teslim bölünmez, yoksa ikincisi `stale` döndüğünde yarım bir teslim kalırdı.
   * Düzeltmesiz teslimde `p_lines` boş geçilir.
   */
  async deliverWithAdjustments(
    orderId: string,
    lines: readonly FulfillmentAdjustment[],
    opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null } = {},
  ): Promise<DeliverWithAdjustmentsResult> {
    const raw = await this.executeRpc('deliver_order_with_adjustments', {
      p_order_id: orderId,
      p_lines:
        lines.length === 0
          ? null
          : lines.map((line) => ({
              order_item_id: line.orderItemId,
              fulfilled_qty: line.fulfilledQty,
              return_disposition: line.returnDisposition ?? null,
              note: line.note ?? null,
            })),
      p_actor_id: opts.actorId ?? null,
      p_delivery_proof: opts.deliveryProof ?? null,
    });
    return DeliverWithAdjustmentsResultSchema.parse(dbToApp(raw));
  }

  /**
   * **İptal** (07.9): ayrılmış geri bırakılır, hazırlanan mal "müşteride" sayılmaz, durum + log
   * tek transaction'da yazılır. Geçişin izinli olduğuna motor karar verir; buradaki tek kural
   * koşulludur — başkası ilerletmişse `stale` döner.
   */
  async cancel(
    orderId: string,
    from: OrderStatus,
    actorId?: string | null,
    /** İptalin sebebi — ekran buna göre farklı cümle kurar; `null` "sebep yazılmadı" demek. */
    reason?: OrderCancelReason | null,
  ): Promise<CancelResult> {
    const raw = await this.executeRpc('cancel_order', {
      p_order_id: orderId,
      p_from: from,
      p_actor_id: actorId ?? null,
      p_reason: reason ?? null,
    });
    return CancelResultSchema.parse(dbToApp(raw));
  }

  /**
   * Hızlı satış: `draft → completed` tek adımda, stok fiiliden anında düşer. Tahsilat burada yazılmaz;
   * çağıran hemen ardından hareketi yazar ki nakit kasaya da düşsün.
   */
  async quickSale(input: {
    orderId: string;
    picks: readonly PreparationPick[];
    actorId?: string | null;
    referenceNo?: string | null;
    paymentMethod?: PaymentMethod | null;
    /** Paketleme birim maliyeti — **cent** (02.9). Euro'ya çeviren yer burasıdır, çağıran değil. */
    packagingUnitCostCents?: number;
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
      p_packaging_unit_cost: fromCents(input.packagingUnitCostCents ?? 0),
    });
    return QuickSaleResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['cogsAmount']));
  }

  // Kalem–parti eşlemesinin okumaları `OrderItemBatchService`te: junction tablosu kendi alt sınıfındadır.

  /**
   * Kimlik listesinden siparişler — **toplu okumaların N+1 kalkanı.**
   *
   * Bir kuyruğu gezip her satır için `getById` çağıran iş, kuyruk büyüdükçe yavaşlar ve o yavaşlama
   * hiçbir yerde görünmez (17.2 davet gönderimi tam bu şekilde yazılabilirdi). Küme çağıranın
   * elindeki sınırlı listedir; sayfalama gerektirmez.
   */
  async listByIds(ids: readonly string[]): Promise<Order[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
  }

  /**
   * Deponun kapı satışları, en yeni önce; tavan bilinçli, çünkü bu okuma satış anındaki kontroldür.
   */
  /** Günün ödemesi tamamlanmamış siparişleri; taslağın referansı, iptalin tahsil edilecek parası yok. */
  listUnpaidByDeliveryDate(date: string): Promise<Order[]> {
    return this.getAll(
      {
        deliveryDate: date,
        paymentStatus: ['pending', 'partial'],
        status: LISTED_STATUSES.filter((status) => status !== 'cancelled'),
      },
      { orderBy: 'createdAt', orderDirection: 'desc' },
    );
  }

  async listDoorSales(warehouseId: string, limit = 30): Promise<Order[]> {
    return this.getAll(
      { orderSource: 'door', warehouseId },
      { orderBy: 'createdAt', orderDirection: 'desc', limit },
    );
  }

  /** Sipariş + kalemleri TEK sorguda — kalem başına ayrı sorgu (N+1) yerine gömülü select. */
  async getWithItems(id: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.getById(id);
    if (!order) return null;
    return { order, items: await this.items.listByOrder(id) };
  }

  /** Müşterinin sipariş geçmişi — en yeni önce, sonsuz kaydırma. */
  /**
   * Çift sipariş kalkanı: tekrar gelen isteği cevaplar; `customerId` sorguya gömülü, çünkü anahtarı istemci üretir
   * ve süzgeçsiz okuma başkasının siparişini döndürürdü.
   */
  async findByIdempotencyKey(key: string, customerId: string): Promise<Order | null> {
    const rows = await this.getAll({ idempotencyKey: key, customerId }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Referans numarasıyla sipariş (tek satır, kolon benzersiz). `customerId` sorguya gömülüdür: süzgeçsiz okuma
   * "bu numara var mı" sorusunu numara deneyen birine cevaplardı.
   */
  async findByReference(referenceNo: string, customerId: string): Promise<Order | null> {
    const rows = await this.getAll({ referenceNo, customerId }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Müşterinin ödemesi beklenen kart taslağı (ödemesi açılmış, ne onaylı ne iptal); müşteri sonucu görmeden
   * yeniden ödeyip iki kez çekim yaşamasın.
   */
  async findOpenOnlineDraft(customerId: string): Promise<Order | null> {
    const rows = await this.getAll(
      { customerId, status: 'draft', paymentMethod: 'online' },
      { isNotNullFields: ['paymentRef'], orderBy: 'createdAt', orderDirection: 'desc', limit: 1 },
    );
    return rows[0] ?? null;
  }

  /**
   * Verilen andan önce açılmış, ödemesi beklenen kart taslakları; ödeme zamanlayıcısının kuyruğu. Tavan emniyettir:
   * her satır sağlayıcıya bir soru demek.
   */
  listOpenOnlineDraftsBefore(before: string, limit = 50): Promise<Order[]> {
    return this.getAll(
      { status: 'draft', paymentMethod: 'online' },
      {
        isNotNullFields: ['paymentRef'],
        rangeFilters: [{ field: 'createdAt', operator: 'lt', value: before }],
        orderBy: 'createdAt',
        orderDirection: 'asc',
        limit,
      },
    );
  }

  /**
   * Bir komşu davetinden doğan siparişler — kullanımın tek kaynağı; azalan sayaç iptalde geri alınmayı unuturdu.
   * Müşteri süzgeci yok, çünkü soru başkalarının siparişleri; dışarı yalnız durumlar çıkar.
   */
  listByNeighborInvite(neighborInviteId: string): Promise<Order[]> {
    return this.getAll({ neighborInviteId });
  }

  /** Birden çok davete bağlı siparişler tek sorguda; boş dizide sorgu atılmaz (`in.()` sözdizimi hatasıdır). */
  listByNeighborInvites(inviteIds: readonly string[]): Promise<Order[]> {
    if (inviteIds.length === 0) return Promise.resolve([]);
    return this.getAll({ neighborInviteId: [...inviteIds] });
  }

  /**
   * Müşterinin açık vadeli siparişleri (süzgeç `isOpenCredit` ile aynı); sayfalanmaz, çünkü eksik sayfa açık
   * bakiyeyi yanlış gösterirdi.
   */
  /** Müşterinin ciro ve sipariş sayısı; iptal edilen sipariş ciroya katılmaz. */
  async customerTotals(customerId: string): Promise<{ orderCount: number; revenueCents: number }> {
    const rows = await this.executeRpc<Array<{ order_count: number; revenue: number }>>('customer_order_totals', {
      p_customer_id: customerId,
    });
    const row = dbToApp((rows?.[0] ?? { order_count: 0, revenue: 0 }) as Record<string, unknown>) as {
      orderCount: number;
      revenue: number;
    };
    // RPC euro toplar (kolonlarla aynı taban); dönüş cent — çevrim bu sınırda (02.9 · STACK §8).
    return { orderCount: Number(row.orderCount), revenueCents: toCents(Number(row.revenue)) };
  }

  /**
   * Tüm müşterilerin açık vadeli siparişleri, tek sorguda. BEKLEYEN(09.3): PostgREST `max_rows` (1000) aşılınca
   * gecikme sayacı sessizce eksilir; sayaç bir toplama RPC'sine taşınmalı.
   */
  listOpenCredit(): Promise<Order[]> {
    return this.openCreditQuery({});
  }

  listOpenCreditByCustomer(customerId: string): Promise<Order[]> {
    return this.openCreditQuery({ customerId });
  }

  /** Açık vadeli sipariş süzgeci — iki okuma da bunu paylaşır (ölçüt iki yerde yaşamaz). */
  private openCreditQuery(extra: Record<string, unknown>): Promise<Order[]> {
    return this.getAll(
      { ...extra, onAccount: true },
      {
        // PostgREST "değil" diyemediği için kalan değerler sayılır; listeler enum'dan türer ki yeni durum sessizce düşmesin.
        orderBy: 'createdAt',
        orFilters: [
          OrderStatusEnum.options.filter((s) => s !== 'cancelled').map((s) => `status.eq.${s}`).join(','),
          PaymentStatusEnum.options.filter((s) => s !== 'paid').map((s) => `payment_status.eq.${s}`).join(','),
        ],
      },
    );
  }

  /**
   * Müşterinin sipariş SAYISI — "ilk sipariş mi" ölçütünün girdisi (denetim A4).
   *
   * Satır TAŞINMADAN sayılır (`head: true`); çağıran yalnız sıfır olup olmadığına bakıyor ve
   * geçmişi kalabalık bir müşterinin bütün siparişlerini çekmenin anlamı yok.
   */
  countForCustomer(customerId: string): Promise<number> {
    return this.count({ customerId });
  }

  /**
   * Müşterinin gerçekten verdiği sipariş sayısı (taslak ve iptal hariç, iade dahil). Ham sayım yarım kalmış checkout'u
   * "zaten müşterimiz" sayar ve o kişi bir daha davet edilemezdi.
   */
  countPlacedForCustomer(customerId: string): Promise<number> {
    return this.count({
      customerId,
      status: ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'returned'],
    });
  }

  /**
   * Bir andan sonra verilen sipariş sayısı: cevaplanmayan kimlik sorusundan sonra sipariş sürüyorsa aciliyet artar.
   * Süzgeç `countPlacedForCustomer` ile aynı, iki sayı farklı şeyler saymasın.
   */
  countPlacedForCustomerSince(customerId: string, since: string): Promise<number> {
    return this.count(
      { customerId, status: ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'returned'] },
      { rangeFilters: [{ field: 'createdAt', operator: 'gte', value: since }] },
    );
  }

  /**
   * Parası alınmış ve ayakta duran sipariş sayısı: getiren ödülü kişiye bağlıdır, ödenmiş başka siparişi kaldıysa ödül
   * düşmez. İptal edilip parası henüz dönmemiş sipariş `paid` görünür, bu yüzden durum süzgeci şart.
   */
  countPaidForCustomer(customerId: string): Promise<number> {
    return this.count({
      customerId,
      paymentStatus: 'paid',
      status: ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'returned'],
    });
  }

  listByCustomer(customerId: string, opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<Order>> {
    return this.getPage({ customerId }, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /**
   * Sipariş ekranının listesi: süzgeçli, keyset sayfalı, en yeni önce. Müşteri ekseninde arama
   * `UserProfileService.search`ten gelir, kopyası iki aramayı ayrıştırırdı.
   */
  listPage(filters: OrderListFilters = {}, opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<Order>> {
    if (emptyScope(filters)) return Promise.resolve({ rows: [], nextCursor: null });
    return this.getPage(listedFilters(filters), {
      ...searchOptions(filters),
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /**
   * Kargo künyesini yazar; hazırlık ekranının işi. Rota siparişine yazılamaz ve kural veride durur
   * (`order_carrier_only_shipping`).
   */
  setShipment(id: string, carrier: Order['carrier'], trackingNumber: string | null): Promise<Order> {
    return this.update({ id, carrier, trackingNumber });
  }

  /**
   * Sekme sayaçları ve toplam tek okumada (`order_counts()`). Sayılar süzgecin tamamına aittir, yüklenmiş sayfaya değil.
   */
  async counts(filters: OrderListFilters = {}): Promise<OrderCounts> {
    // Kapsam boşsa RPC hiç çağrılmaz: sıfırlar zaten doğru cevap ve sorgu atmanın karşılığı yok.
    if (emptyScope(filters)) {
      return {
        byStatus: new Map(),
        total: 0,
        sum: { totalCents: 0, collectedCents: 0, refundedCents: 0 },
        cod: { count: 0, totalCents: 0, collectedCents: 0, refundedCents: 0 },
        active: { count: 0, totalCents: 0 },
      };
    }
    const rows = await this.executeRpc<unknown[]>('order_counts', {
      p_reference: filters.query?.trim() || null,
      p_customer_ids: filters.customerIds ?? null,
      p_channel: filters.channel ?? null,
      p_source: filters.source ?? null,
      p_delivery_type: filters.deliveryType ?? null,
      p_payment_status: filters.paymentStatus ?? null,
      p_from: filters.deliveryFrom ?? null,
      p_to: filters.deliveryTo ?? null,
      p_warehouse_ids: filters.warehouseIds ? [...filters.warehouseIds] : null,
    });
    // `by_status`'un ANAHTARLARI enum değeridir, alan adı değil: `dbToApp` onları da camelCase'e
    // çevirip `out_for_delivery`'yi `outForDelivery` yapıyordu — sessizce hiçbir sekmeye denk
    // gelmeyen bir anahtar. Bu yüzden o alan HAM hâliyle alınır.
    const raw = (rows?.[0] ?? {}) as Record<string, unknown>;
    const flat = dbToApp(raw) as Record<string, unknown>;
    // RPC dönüşü bir TABLO SATIRI değil (jsonb) — `moneyFields` yolundan geçmez; toplamlar euro
    // gelir ve cent'e burada, ortak yardımcıyla inilir (02.9 · STACK §8).
    const money = rpcMoneyToCents(flat, ['sumTotal', 'sumCollected', 'sumRefunded', 'codTotal', 'codCollected', 'codRefunded', 'activeTotal']);
    const row = OrderCountsRowSchema.parse({ ...money, byStatus: raw.by_status ?? {} });
    return {
      byStatus: new Map(Object.entries(row.byStatus) as Array<[OrderStatus, number]>),
      total: row.total,
      sum: { totalCents: row.sumTotalCents, collectedCents: row.sumCollectedCents, refundedCents: row.sumRefundedCents },
      cod: {
        count: row.codCount,
        totalCents: row.codTotalCents,
        collectedCents: row.codCollectedCents,
        refundedCents: row.codRefundedCents,
      },
      active: { count: row.activeCount, totalCents: row.activeTotalCents },
    };
  }

  /**
   * Operasyon kuyruğu: duruma ve güne göre; depo süzgecinde boş dizi hiçbiri, `undefined` depo-üstüdür.
   * `id` süzgeci kuyruğun ölçütlerini değiştirmez, kapanmış siparişin kimliği boş döner.
   */
  listByStatus(
    status: OrderStatus | OrderStatus[],
    opts: {
      deliveryDate?: string;
      limit?: number;
      warehouseId?: string | readonly string[];
      orderId?: string;
      /**
       * Tavan hangi uçtan dolsun: hazırlık kuyruğu için en eski önce doğrudur; sonucu yeniye sıralayan çağıran
       * `desc` ister, yoksa göstermesi gereken satırlar pencerenin dışında kalırdı.
       */
      orderDirection?: 'asc' | 'desc';
    } = {},
  ): Promise<Order[]> {
    return this.getAll(
      {
        status: Array.isArray(status) ? status : [status],
        deliveryDate: opts.deliveryDate,
        warehouseId: typeof opts.warehouseId === 'string' ? opts.warehouseId : opts.warehouseId && [...opts.warehouseId],
        id: opts.orderId,
      },
      { orderBy: 'createdAt', orderDirection: opts.orderDirection, limit: opts.limit },
    );
  }

  /**
   * Kuryenin günü: `courierId` zorunlu, "yalnız kendi teslimatları" kuralı imzada durur. Araç bir ara depo olduğu
   * için süzgeç sefer kümesi alır; sefer kapanışı günü değil seferin duraklarını sayar.
   */
  listByCourier(
    courierId: string,
    opts: {
      deliveryDate?: string;
      deliveryZoneId?: string;
      deliveryRunId?: string;
      deliveryRunIds?: readonly string[];
      limit?: number;
    } = {},
  ): Promise<Order[]> {
    /* Boş küme = "araçta sefer yok" ve cevabı boş listedir. Süzgeci HİÇ uygulamamak, kuryenin
       bütün geçmişini döndürürdü — sessiz ve en kötü türden bir kapsam kaçağı. */
    if (opts.deliveryRunIds && opts.deliveryRunIds.length === 0) return Promise.resolve([]);
    return this.getAll(
      {
        courierId,
        deliveryDate: opts.deliveryDate,
        deliveryZoneId: opts.deliveryZoneId,
        deliveryRunId: opts.deliveryRunIds ? [...opts.deliveryRunIds] : opts.deliveryRunId,
      },
      { orderBy: 'createdAt', limit: opts.limit },
    );
  }

  /** Günün rota siparişleri — rota seçim ekranının yük sayacı; kuryeye süzülmez, durakları seferi başlatan alır. */
  listRouteOrdersByDate(date: string): Promise<Order[]> {
    return this.getAll({ deliveryDate: date, deliveryType: 'route' }, { orderBy: 'createdAt', limit: 500 });
  }

  /** Bir küme seferin damgalı siparişleri — geçmiş sefer listesinin durak sayacı. */
  listByRuns(runIds: readonly string[]): Promise<Order[]> {
    return this.getAll({ deliveryRunId: [...runIds] });
  }

  /**
   * Durum ilerletme: durum ve log tek transaction'da, yalnız beklenen kaynaktan; araya biri girdiyse `stale` döner.
   * Geçişin izni burada sorgulanmaz, motor karar verir.
   */
  async transition(input: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    actorId?: string | null;
    /** İlk kalıcı durumda üretilen referans (motor üretir); mevcut numarayı ezmez. */
    referenceNo?: string | null;
    /** Geçişe bağlı serbest bağlam (ör. kuryenin "teslim edilemedi" notu) — log satırına yazılır. */
    note?: string | null;
  }): Promise<TransitionResult> {
    const raw = await this.executeRpc('transition_order_status', {
      p_order_id: input.orderId,
      p_from: input.from,
      p_to: input.to,
      p_actor_id: input.actorId ?? null,
      p_reference_no: input.referenceNo ?? null,
      p_note: input.note ?? null,
    });
    return TransitionResultSchema.parse(dbToApp(raw));
  }
}
