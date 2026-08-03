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
  CloseResultSchema,
  DeliverResultSchema,
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
  type OrderStatus,
  type CancelResult,
  type CloseResult,
  type DeliverResult,
  type FulfillmentAdjustment,
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

/**
 * Sipariş listesinin süzgeçleri (09.7). Liste ve sayaç AYNI tipi alır: iki ayrı süzgeç tanımı,
 * "24 sipariş" yazan şeridin altında 19 satır göstermenin en kısa yoludur.
 */
export interface OrderListFilters {
  /** Boşsa listenin kendi kümesi (taslak hariç tüm durumlar) geçerlidir. */
  status?: OrderStatus[];
  /**
   * Depo süzgeci (DOMAIN §17) — **tek uuid değil KÜME**, çünkü üç hâl var:
   *
   * - `undefined` → depo-üstü. YALNIZ admin/muhasebe için meşru.
   * - tek elemanlı dizi → o depo (eski `warehouseId`'nin karşılığı).
   * - çok elemanlı → **"kapsamımdaki depolar"**. Ortadaki bu hâl tek uuid ile ifade edilemiyordu:
   *   kapsamı iki depo olan personel "tümü" dediğinde ya tek depo seçmek zorunda kalıyordu ya
   *   `undefined` göndermek — ikincisi kapsam DIŞI depoların siparişlerini de sayardı.
   * - boş dizi → hiçbiri (fail-closed; kapsamsız personel hiçbir sipariş görmez).
   *
   * Sayaçlar bu süzgeci LİSTEYLE aynı şekilde alır — biri süzülüp öteki süzülmezse başlıkta
   * "12 sipariş" yazarken listede 4 satır görünür ve operatör kendi ekranına güvenmeyi bırakır.
   * Bu yüzden süzgeç RPC'nin İÇİNDE uygulanır (`p_warehouse_ids`), dışarıda değil.
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
}

/**
 * Listede görünen durumlar — **taslak hariç**. `draft` yarım kalmış bir checkout'tur: referans
 * numarası bile yoktur, kimse onu hazırlayamaz. Operasyon listesinde görünmesi, terk edilmiş
 * sepetleri iş kuyruğuna karıştırmak olurdu (TTL süpürücüsü onları `cancelled`'a çeker).
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

/**
 * Kapsam boş mu — "hiçbir depo" hâli. Boş dizi `undefined`'dan (depo-üstü) AYRI bir anlamdır ve
 * ikisini karıştırmak kapsamsız personele her şeyi göstermek olurdu. Sorgu hiç atılmaz.
 */
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
const ITEM_MONEY_FIELDS = ['unitPriceCents', 'lineDiscountAmountCents'];
const ORDER_MONEY_FIELDS = [
  'shippingFeeCents',
  'totalCents',
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
   * Çok siparişin kalemleri TEK turda (12.7 export'u) — sipariş başına ayrı sorgu N+1 olurdu.
   *
   * Kimlikler öbeklenir: `in(...)` listesi URL'e gömülür, binlerce uuid'lik dönemde istek satırı
   * sunucu sınırını aşar. Öbek sayısı kadar sorgu, sipariş sayısı kadar değil.
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
 * Sipariş servisi (07.6) — ORDER_LIFECYCLE.
 *
 * **Karar vermez, satır getirir/yazar** (STACK §4). "Bu geçiş izinli mi", "referans üretilmeli mi",
 * "stok ne olmalı" kararları saf motordadır (`domain-core/order/status-machine`); ikisini birleştiren
 * kapı uygulama katmanındadır (`apps/web/lib/order`).
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
   * Sipariş + kalemleri + (indirim varsa) KULLANIM KAYDI — **tek transaction** (`create_order` RPC).
   *
   * Üçü tek gerçektir: kalemsiz sipariş anlamsızdır, kullanım kaydı olmayan indirimli sipariş ise
   * kotayı sessizce delen bir sipariştir. Önceden üç ayrı ifadeydi ve yarım kalan yazım "telafi
   * silmesi" ile geri alınmaya çalışılıyordu; telafi bir garanti değildir (silme de düşebilir,
   * süreç arada ölebilir) ve yalnız HATA anında çalışır. Artık ya üçü de yazılır ya hiçbiri —
   * ve `discount_amount = Σ line_discount_amount` değişmezini COMMIT anında veritabanı denetler
   * (`order_discount_balance` kısıt tetikleyicisi, 0041). 07.4'ün RPC borcu buydu.
   *
   * **KOTA RPC'DE TÜKENİR ve bu bilinçli bir yer seçimi.** Kayıt siparişin KENDİ verisinden türer
   * (`discount_id` + `discount_amount`), yani çağıranın hatırlamasına bağlı değil. Kapıya (checkout)
   * yazılsaydı elle sipariş girişi (09.8), WhatsApp ajanı ve kapıda satış aynı şeyi ayrı ayrı
   * hatırlamak zorunda kalırdı — ve hatırlamayan ilk yol kotayı sessizce delerdi. Açık zaten böyle
   * doğmuştu: indirim siparişe yazılıyordu, kullanım kaydı hiçbir yerde yazılmıyordu (09.6).
   */
  async create(
    order: OrderInsert,
    lines: CreateOrderItemInput[],
    /**
     * Kuponun hangi KAPISINDAN girildi (`discount_code.id`). Kotayı bölmez — yalnız "hangi dil
     * karşılık buldu" kırılımı. Otomatik kampanyada ve kodsuz yollarda boş.
     */
    opts: { discountCodeId?: string | null } = {},
  ): Promise<{ order: Order; items: OrderItem[] }> {
    // RPC de reddediyor; buradaki kontrol gidiş-dönüşü boşuna harcamamak için (mesaj aynı).
    if (lines.length === 0) throw new Error('order: kalemsiz sipariş açılamaz');

    // Doğrulama YİNE Zod'da: gövde jsonb olarak gidiyor diye şema atlanmaz, yoksa tipsiz bir
    // nesne doğrudan tabloya akardı. `appToDb` camelCase→snake_case çevirir — RPC gelen anahtarları
    // tablonun kolonlarıyla KESİŞTİRDİĞİ için adların birebir tutması şart.
    //
    // Para bu yüzden burada euro'ya iner (`rpcMoneyToEuro`, 02.9): `unitPriceCents` olduğu gibi
    // gitseydi `unit_price_cents` anahtarı üretirdi, öyle bir kolon yok, anahtar sessizce düşerdi.
    // Bu yolda `not null` kısıtı patladı ve hatayı görünür kıldı — kısıtı olmayan bir kolonda satır
    // fiyatsız doğar ve hiçbir yerde hata çıkmazdı.
    const orderId = await this.executeRpc<string>('create_order', {
      p_order: appToDb(rpcMoneyToEuro(this.insertSchema.parse(order), ORDER_MONEY_FIELDS)),
      p_items: lines.map((line) => appToDb(rpcMoneyToEuro(CreateOrderItemSchema.parse(line), ITEM_MONEY_FIELDS))),
      p_discount_code_id: opts.discountCodeId ?? null,
    });

    // Yazılan satırı GERİ OKURUZ, gönderdiğimizi yansıtmayız: varsayılanlar (`status`, `created_at`),
    // tetikleyiciler ve numeric yuvarlaması veritabanının kararıdır. Çağıranın elindeki nesne
    // veritabanındakiyle aynı olmalı.
    //
    // **Kalemlerin sırası artık GİRDİ sırası değil, okuma sırasıdır.** Toplu yazımda dönen dizi girdiyle
    // hizalıydı; burada ayrı bir okuma var. Kalemi kimliğinden (`variantId`, `bundleId`) tanıyın —
    // `items[i] ↔ lines[i]` varsayan bir çağıran bir gün yanlış kalemi işler.
    const created = await this.getWithItems(orderId);
    if (!created) throw new Error(`[order.create] sipariş yazıldı ama okunamadı: ${orderId}`);
    return created;
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
  async close(
    orderId: string,
    costs: {
      actorId?: string | null;
      deliveryCostCents?: number | null;
      routeUnitCostCents?: number;
      packagingUnitCostCents?: number;
    } = {},
  ): Promise<CloseResult> {
    // RPC euro konuşuyor (kolonlarla aynı taban); uygulama cent — çevrim bu sınırda, TEK yerde.
    const raw = await this.executeRpc('close_order', {
      p_order_id: orderId,
      p_actor_id: costs.actorId ?? null,
      p_delivery_cost: costs.deliveryCostCents == null ? null : fromCents(costs.deliveryCostCents),
      p_route_unit_cost: fromCents(costs.routeUnitCostCents ?? 0),
      p_packaging_unit_cost: fromCents(costs.packagingUnitCostCents ?? 0),
    });
    return CloseResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['cogsAmount', 'deliveryCost', 'packagingCost']));
  }

  /**
   * **Kalem düzeltmesi** (07.8/07.9): eksik çıkan ya da geri gelen adet. Kalemin `fulfilled_qty`'si,
   * kalem–parti kaydı, ayrılmış stok ve (teslim sonrası iadede) fiili stok tek transaction'da
   * tutarlı kalır — yarısı yazılırsa "para iade edildi ama mal ortada yok" hâli doğar.
   *
   * Para BURADA YAZILMAZ: iade borcu motorda türetilir, hareketi uygulama kapısı yazar (12.2).
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
   * **İptal** (07.9): ayrılmış geri bırakılır, hazırlanan mal "müşteride" sayılmaz, durum + log
   * tek transaction'da yazılır. Geçişin izinli olduğuna motor karar verir; buradaki tek kural
   * koşulludur — başkası ilerletmişse `stale` döner.
   */
  async cancel(orderId: string, from: OrderStatus, actorId?: string | null): Promise<CancelResult> {
    const raw = await this.executeRpc('cancel_order', {
      p_order_id: orderId,
      p_from: from,
      p_actor_id: actorId ?? null,
    });
    return CancelResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Hızlı satış** (07.10): kapı önü tek adım — `draft → completed`. Rezervasyon yok, stok
   * fiiliden anında düşer; referans ve kâr kalemleri aynı transaction'da yazılır.
   *
   * **Tahsilat BURADA YAZILMAZ** (12.2): paranın kaynağı hareket tablosudur. Çağıran satıştan
   * hemen sonra `recordForOrder` ile tahsilatı yazar — böylece kapı önü nakdi kasanın bakiyesine
   * de düşer.
   *
   * Karar vermez: geçişin izinli olduğuna motor, referansa motor karar verir — parametre olarak
   * gelirler. RPC yalnız fiziksel gerçeği korur (olmayan mal satılmaz).
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

  // Kalem–parti eşlemesinin üç okuması BURADAN TAŞINDI (02.8) → `OrderItemBatchService`.
  // Üçü de ham `this.supabase` ile yazılmıştı; junction tablosu kendi alt sınıfını hak ediyor
  // (`STACK §6`). Üçü birlikte gitti — birini burada bırakmak aynı tabloyu iki eve bölerdi.

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

  /** Sipariş + kalemleri TEK sorguda — kalem başına ayrı sorgu (N+1) yerine gömülü select. */
  async getWithItems(id: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.getById(id);
    if (!order) return null;
    return { order, items: await this.items.listByOrder(id) };
  }

  /** Müşterinin sipariş geçmişi — en yeni önce, sonsuz kaydırma. */
  /**
   * Çift sipariş kalkanı — aynı istek anahtarıyla açılmış sipariş var mı.
   *
   * Kısmi unique indeks eşzamanlı iki yazımdan birini zaten reddediyor; bu okuma **tekrar gelen**
   * isteği (çift tıklama, ağın yeniden denemesi) ikinci sipariş açmadan cevaplamak için.
   */
  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const rows = await this.getAll({ idempotencyKey: key }, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Müşterinin AÇIK VADELİ siparişleri — vade pozisyonunun (açık bakiye, gecikme) girdisi (09.9).
   *
   * Sayfalanmıyor ve bu bilinçli: küme "ödenmemiş borç"tur, yani doğal tavanı olan bir kümedir ve
   * TAM olması gerekir — eksik bir sayfa "açık bakiye 200 €" derken gerçek 900 € olurdu ve limit
   * kararı o yanlış sayı üzerine verilirdi. Süzgeç motorun `isOpenCredit` ölçütüyle birebir:
   * vadeli + tamamı ödenmemiş + iptal değil.
   */
  /**
   * Müşterinin ciro ve sipariş sayısı — `customer_order_totals` RPC'si (09.9).
   *
   * `counts({ customerIds })` KULLANILAMAZ: orada müşteri süzgeci arama grubunun içindedir ve terim
   * olmadan hiç uygulanmaz (RPC'nin başındaki not). Ayrıca bu okuma iptal edilen siparişi ciroya
   * katmaz — vazgeçilen sipariş müşterinin kazandırdığı para değildir.
   */
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
   * TÜM müşterilerin açık vadeli siparişleri — "kaç müşteride gecikme var" sayacının girdisi (09.9,
   * dashboard 09.3).
   *
   * Küme açık BORÇTUR: doğal tavanı var (ödenince düşer) ve tam olması gerekir. Müşteri başına ayrı
   * sorgu sormak N+1 olurdu — 312 müşteri için 312 tur.
   *
   * BEKLEYEN(09.3): PostgREST'in `max_rows` tavanı (1000) bu okumanın üstünde duruyor. Bugün açık borç
   * o sayının çok altında, ama aşıldığında "gecikmiş vade" sayacı SESSİZCE eksilir. Dashboard aynı
   * sayacı isteyince ikisi birlikte tek bir toplama RPC'sine taşınacak — sayaç için satır taşımak
   * zaten yanlış araç.
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
        // `status <> 'cancelled'` ve `paymentStatus <> 'paid'`: PostgREST eşitlik süzgeci "değil"
        // diyemez, bu yüzden KALAN değerler sayılır. İki liste de ENUM'DAN türetilir — elle yazılsa
        // beşinci bir ödeme durumu eklendiğinde o durumdaki açık borç, açık bakiyeden ve gecikme
        // sayacından SESSİZCE düşerdi. İki `or` grubu birbirine VE ile bağlanır (bkz. FilterOptions).
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

  listByCustomer(customerId: string, opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<Order>> {
    return this.getPage({ customerId }, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      keysetAfter: opts.cursor,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }

  /**
   * **Sipariş ekranının listesi** (09.7) — süzgeçli, keyset sayfalı, en yeni önce.
   *
   * `listByStatus`'ten farkı sayfalanması ve süzgeç kümesi: o, depo/kurye kuyruğunun dar sorusunu
   * ("şu durumdakiler, şu gün") yanıtlar; bu, operatörün serbest taramasını.
   *
   * ARAMA İKİ EKSENLİDİR ve müşteri ekseni DIŞARIDAN gelir: "müşterinin neyinde aranır" sorusunun
   * cevabı `UserProfileService.search`'tedir. Buraya kopyalansaydı sipariş araması bir gün telefonu
   * kapsar, müşteri araması kapsamaz olurdu.
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
   * Kargo künyesini yazar (07.12) — paketi kapatan kişi etiketi elinde tutar, o yüzden hazırlık
   * ekranının işi; ayrı bir "sevk" adımı açılmıyor.
   *
   * Rota siparişine yazılamaz ve bu kural VERİDE duruyor (`order_carrier_only_shipping`): ekran
   * unutsa bile yazılamaz. Unutulduğunda müşteri hiç çalışmayacak bir takip bağlantısı görürdü.
   */
  setShipment(id: string, carrier: Order['carrier'], trackingNumber: string | null): Promise<Order> {
    return this.update({ id, carrier, trackingNumber });
  }

  /**
   * Sekme sayaçları + alt şerit toplamı — TEK okuma (`order_counts()`).
   *
   * Sayılar SÜZGECİN TAMAMINA aittir, yüklenmiş sayfaya değil: sayfadan hesaplanan sekme sayacı
   * listenin kuyruğunu yutar ve operatör "bugün altı işim var" diye yanlış karar verir. Altı sekme
   * için altı `HEAD` sayım + üç toplam yerine bir tur.
   */
  async counts(filters: OrderListFilters = {}): Promise<OrderCounts> {
    // Kapsam boşsa RPC hiç çağrılmaz: sıfırlar zaten doğru cevap ve sorgu atmanın karşılığı yok.
    if (emptyScope(filters)) {
      return {
        byStatus: new Map(),
        total: 0,
        sum: { totalCents: 0, collectedCents: 0, refundedCents: 0 },
        cod: { count: 0, totalCents: 0, collectedCents: 0, refundedCents: 0 },
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
    const money = rpcMoneyToCents(flat, ['sumTotal', 'sumCollected', 'sumRefunded', 'codTotal', 'codCollected', 'codRefunded']);
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
    };
  }

  /**
   * Operasyon kuyruğu: duruma (ve varsa güne) göre. Depo/kurye ekranlarının okuması.
   *
   * `warehouseId` verilirse yalnız o deponun kuyruğu — depocu başka deponun siparişini görmez (C5)
   * ve zaten hazırlayamaz: partiler siparişin deposundan seçilir. Verilmezse depo-üstü (admin).
   */
  listByStatus(
    status: OrderStatus | OrderStatus[],
    opts: { deliveryDate?: string; limit?: number; warehouseId?: string } = {},
  ): Promise<Order[]> {
    return this.getAll(
      { status: Array.isArray(status) ? status : [status], deliveryDate: opts.deliveryDate, warehouseId: opts.warehouseId },
      { orderBy: 'createdAt', limit: opts.limit },
    );
  }

  /**
   * **Kuryenin günü** (11.1) — `courierId` ZORUNLUDUR, seçenek değil: "yalnız kendi teslimatları"
   * kuralı böylece imzada durur, çağıranın süzmeyi hatırlamasına bağlı kalmaz.
   */
  listByCourier(courierId: string, opts: { deliveryDate?: string; limit?: number } = {}): Promise<Order[]> {
    return this.getAll({ courierId, deliveryDate: opts.deliveryDate }, { orderBy: 'createdAt', limit: opts.limit });
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
