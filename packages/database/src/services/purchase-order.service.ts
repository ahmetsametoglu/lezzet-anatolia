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
  async progressOf(purchaseOrderId: string): Promise<PurchaseOrderProgress[]> {
    const { data, error } = await this.supabase
      .from('purchase_order_progress')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);
    if (error) throw error;
    return (data ?? []).map((row) => PurchaseOrderProgressSchema.parse(dbToApp(row)));
  }
}
