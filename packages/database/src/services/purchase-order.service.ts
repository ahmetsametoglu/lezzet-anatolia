import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PurchaseOrderSchema,
  PurchaseOrderInsertSchema,
  PurchaseOrderUpdateSchema,
  PurchaseOrderItemSchema,
  PurchaseOrderItemInsertSchema,
  PurchaseOrderItemUpdateSchema,
  type PurchaseOrder,
  type PurchaseOrderInsert,
  type PurchaseOrderUpdate,
  type PurchaseOrderItem,
  type PurchaseOrderItemInsert,
  type PurchaseOrderItemUpdate,
  type PurchaseOrderStatus,
  PurchaseOrderProgressSchema,
  type PurchaseOrderProgress,
  PurchaseOrderRowSchema,
  type PurchaseOrderRow,
  type KeysetCursor,
  type Page,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';
import { SupplierProductService } from './supplier.service';

/** PO taslağına konacak kalem — kod eşlemesini servis kendisi bulur, çağıran varyant + adet verir. */
export interface DraftLine {
  variantId: string;
  qty: number;
  unitPrice?: number | null;
  /**
   * İsteğe bağlı hedef depo (C7) — "20 koli STR'ye, 10 koli KEHL'e". Tedarikçi listesine yazılır ve
   * kabul eden depocu kendi payını listeden okur. Boşsa hedefi kabul eden depo söyler: bu bir NİYET
   * beyanıdır, kısıt değil — mal fiilen nereye indiyse oraya girer (`DOMAIN §17`).
   */
  targetWarehouseId?: string | null;
}

/** Tedarikçiye kopyalanacak temiz liste satırı — **tedarikçinin diliyle** (onun kodu, onun adı). */
export interface PurchaseListLine {
  supplierCode: string | null;
  nameAtSupplier: string | null;
  qty: number;
  /** Koli içi adet biliniyorsa koli karşılığı — "12 adet = 1 koli" telefonda tarif bitsin. */
  packQty: number | null;
}

export class PurchaseOrderItemService extends BaseDbService<PurchaseOrderItem, PurchaseOrderItemInsert, PurchaseOrderItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'purchase_order_item', PurchaseOrderItemSchema, PurchaseOrderItemInsertSchema, PurchaseOrderItemUpdateSchema);
  }

  async listByOrder(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    return this.getAll({ purchaseOrderId });
  }

  async addLines(rows: PurchaseOrderItemInsert[]): Promise<PurchaseOrderItem[]> {
    return this.bulkInsert(rows);
  }
}

/**
 * Tedarik siparişi (06.9) — DOMAIN §16. Taslak → gönderildi → mal kabulde kapanır.
 *
 * **Sistem GÖNDERMEZ.** Tedarikçi ilişkisi insan ilişkisidir: servis kopyalanabilir temiz bir liste
 * üretir (`printableList`), gönderimi insan yapar ve dönüp `markSent()` der. Otomatik gönderim
 * bilinçli olarak yoktur.
 *
 * PDF üretimi burada değil: biçim (PDF/metin) sunum katmanının işidir ve araç seçimi henüz açıktır
 * (06 "Netleşecekler"). Servis veriyi tedarikçinin diliyle hazırlar, biçimlendirmeye karışmaz.
 */
export class PurchaseOrderService extends BaseDbService<PurchaseOrder, PurchaseOrderInsert, PurchaseOrderUpdate> {
  private readonly items: PurchaseOrderItemService;
  private readonly mappings: SupplierProductService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'purchase_order', PurchaseOrderSchema, PurchaseOrderInsertSchema, PurchaseOrderUpdateSchema);
    this.items = new PurchaseOrderItemService(supabase);
    this.mappings = new SupplierProductService(supabase);
  }

  async listBySupplier(supplierId: string, status?: PurchaseOrderStatus): Promise<PurchaseOrder[]> {
    return this.getAll({ supplierId, status }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Siparişler ekranının sayfası (09.14) — **tek turda**, keyset imleçli.
   *
   * ── NEDEN AYRI BİR OKUMA ────────────────────────────────────────────────────
   * `listBySupplier` tedarikçi başına tur attırıyor: sayfalama bozulur (her tedarikçi kendi
   * sayfasını verir, birleştirme elde yapılır) ve sıralama listenin değil elin işi olur. Alternatifi
   * satır başına `progressOf` + kalem okumasıydı — N+1, `bundle_list_rows`'un kapattığı sınıf.
   *
   * ── VE NEDEN RPC DEĞİL ──────────────────────────────────────────────────────
   * `STACK §13`: okuma RPC'si istisnadır, N+1'i kırmanın **ilk** aracı gömülü `select`'tir. Zincirin
   * tamamı gerçek yabancı anahtar üzerinden gidiyor (`stock → purchase_order_item`,
   * `stock → warehouse`, `purchase_order → supplier`), yani sorgu kurucusu bunu ifade edebiliyor ve
   * eşiğin üçüncü koşulu ("fark bariz") sağlanmıyor. Toplama okunan SAYFA üzerinde yapılır: 20
   * satırlık sayfa 20 satırlık toplama demektir, veriyle büyümez.
   *
   * Depo kırılımı FİİLEN GİREN partilerden çıkar (`stock.warehouse_id`), kalemin
   * `target_warehouse_id`'sinden değil: o bir niyet beyanıdır, kısıt değil (K6).
   */
  async listRows(opts: { limit?: number; cursor?: KeysetCursor; status?: PurchaseOrderStatus; supplierId?: string } = {}): Promise<Page<PurchaseOrderRow>> {
    return this.getPageAs(PurchaseOrderRowSchema, { status: opts.status, supplierId: opts.supplierId }, {
      // `created_at` hem GÖRÜNÜM hem İMLEÇ alanı — dar şema onu taşısa da select'te bulunması şart
      // (bkz. `pageOf`): eksikse ikinci sayfa istenemez.
      select:
        'id,supplier_id,status,sent_at,note,created_at,' +
        'supplier:supplier_id(id,name),' +
        'items:purchase_order_item(id,qty,unit_price,batches:stock(initial_qty,warehouse:warehouse_id(id,code)))',
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: opts.limit ?? 20,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Gönderilmiş ve HENÜZ KAPANMAMIŞ sipariş sayısı — ekranın başlık altı (09.14).
   *
   * "Yolda ne var" sorusudur: `draft` daha gönderilmedi, `received`/`cancelled` kapandı. Satır
   * TAŞINMADAN sayılır (`head: true`).
   *
   * `supplierId` isteğe bağlı: tedarikçi kartı aynı soruyu tek tedarikçi için sorar ("bu firmadan
   * yolda ne var"). Aynı sayacı iki kez yazmamak için tek metot — sayaç ile listenin süzgeci
   * ayrışırsa "12 sonuç" yazıp 5 satır gösteren ekranlar doğar.
   */
  async countPending(supplierId?: string): Promise<number> {
    // Dizi değer PostgREST'te `IN (…)` demektir (bkz. `FilterOptions` künyesi).
    return this.count({ status: ['sent', 'partially_received'], supplierId });
  }

  /**
   * Taslak PO açar. Kalemlerin tedarikçi kod eşlemesi TEK sorguda bulunur (satır başına sorgu yok);
   * eşlemesi olmayan kalem de listeye girer — sadece bizim adımızla yazılır, iş durmaz.
   */
  async createDraft(supplierId: string, lines: DraftLine[], note?: string): Promise<{ order: PurchaseOrder; items: PurchaseOrderItem[] }> {
    if (lines.length === 0) throw new Error('purchase_order: kalemsiz taslak açılmaz');

    const order = await this.insert({ supplierId, note });
    const mappings = await this.mappings.listByVariants(lines.map((l) => l.variantId));
    const byVariant = new Map(mappings.filter((m) => m.supplierId === supplierId).map((m) => [m.variantId, m]));

    const items = await this.items.addLines(
      lines.map((line) => ({
        purchaseOrderId: order.id,
        variantId: line.variantId,
        supplierProductId: byVariant.get(line.variantId)?.id ?? null,
        qty: line.qty,
        unitPrice: line.unitPrice ?? byVariant.get(line.variantId)?.lastPurchasePrice ?? null,
        targetWarehouseId: line.targetWarehouseId ?? null,
      })),
    );
    return { order, items };
  }

  /**
   * Tedarikçiye kopyalanacak liste — onun kodu, onun adı, koli karşılığı. Biçimlendirme (PDF/metin)
   * çağıranın; burada yalnız doğru veri hazırlanır.
   */
  async printableList(purchaseOrderId: string): Promise<PurchaseListLine[]> {
    const { data, error } = await this.supabase
      .from('purchase_order_item')
      .select('qty,mapping:supplier_product(supplier_code,name_at_supplier,pack_qty)')
      .eq('purchase_order_id', purchaseOrderId);
    if (error) throw error;

    type Row = { qty: number; mapping: { supplier_code: string; name_at_supplier: string | null; pack_qty: number | null } | null };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      supplierCode: row.mapping?.supplier_code ?? null,
      nameAtSupplier: row.mapping?.name_at_supplier ?? null,
      qty: row.qty,
      packQty: row.mapping?.pack_qty ?? null,
    }));
  }

  /** İnsan gönderdikten sonra işaretlenir — sistemin gönderdiği anlamına GELMEZ. */
  async markSent(id: string): Promise<PurchaseOrder> {
    return this.update({ id, status: 'sent', sentAt: new Date().toISOString() });
  }

  /** İptal yolu: kapanmış (mal gelmiş) sipariş iptal edilmez — zincir kopar. */
  async cancel(id: string): Promise<PurchaseOrder> {
    const order = await this.getById(id);
    if (!order) throw new Error(`purchase_order bulunamadı: ${id}`);
    if (order.status === 'received') throw new Error('purchase_order: mal gelmiş sipariş iptal edilemez');
    return this.update({ id, status: 'cancelled' });
  }

  /**
   * Siparişin kalem kalem ilerlemesi (`purchase_order_progress`, 0042).
   *
   * PO durumu SAKLANAN bir sayaç değil, bu görünümden türer: tek sipariş birden çok depoda parça
   * parça kabul edilebilir (K6) ve ilk kabul siparişi kapatmaz. Ölçü `initial_qty` — `physical_qty`
   * satışla erir ve "ne kadar geldi" sorusuna yanlış cevap verir.
   */
  /**
   * AÇIK siparişlerin bekleyen kalemleri — "yolda ne var" (09.14 · üçüncü talep).
   *
   * `received` ve `cancelled` DIŞARIDA: ilki zaten stoğa girdi (iki kez sayılırdı), ikincisi hiç
   * gelmeyecek. `draft` İÇERİDE ama ayrı sayılmalı — çağıran onu `sent` ile toplamamalı: gönderilmiş
   * sipariş bir bekleyiştir, taslak yalnız bizim kararımızdır ve tedarikçi ondan habersizdir.
   *
   * Sayfalama YOK ve gerekmiyor: açık sipariş kümesi veriyle büyümez, kabul edildikçe kapanır
   * (`CLAUDE.md §1` — ölçüt liste olmak değil, sınırsız büyümek).
   */
  async openProgress(): Promise<Array<PurchaseOrderProgress & { status: PurchaseOrderStatus }>> {
    const open = await this.getAll({ status: ['draft', 'sent', 'partially_received'] });
    if (open.length === 0) return [];
    const statusOf = new Map(open.map((o) => [o.id, o.status]));

    const { data, error } = await this.supabase
      .from('purchase_order_progress')
      .select('*')
      .in('purchase_order_id', [...statusOf.keys()]);
    if (error) throw error;

    return (data ?? [])
      .map((row) => PurchaseOrderProgressSchema.parse(dbToApp(row)))
      // Tamamlanmış kalem "yolda" değildir: sipariş açık olsa da o satırın malı geldi.
      .filter((row) => row.missingQty > 0)
      .map((row) => ({ ...row, status: statusOf.get(row.purchaseOrderId)! }));
  }

  async progressOf(purchaseOrderId: string): Promise<PurchaseOrderProgress[]> {
    const { data, error } = await this.supabase
      .from('purchase_order_progress')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);
    if (error) throw error;
    return (data ?? []).map((row) => PurchaseOrderProgressSchema.parse(dbToApp(row)));
  }
}
