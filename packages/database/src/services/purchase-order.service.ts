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
import { toCents } from '@lezzet/helper';
import { z } from 'zod';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';
import { SupplierProductService } from './supplier.service';

/** PO taslağına konacak kalem — kod eşlemesini servis kendisi bulur, çağıran varyant + adet verir. */
export interface DraftLine {
  variantId: string;
  qty: number;
  /** Beklenen alış (**cent**); verilmezse eşlemedeki "geçen sefer kaçtı" kullanılır. */
  unitPriceCents?: number | null;
  /**
   * İsteğe bağlı hedef depo: tedarikçi listesine yazılır ve kabul eden depocu kendi payını oradan okur. Niyet beyanıdır, kısıt değil;
   * mal fiilen nereye girdiyse oraya yazılır.
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

/**
 * Liste satırının gömülü kalemlerini cent'e indirir: `moneyFields` yalnız üst düzey alanlara iner, kalem başka tablonun satırıdır ve
 * euro taşır. Çevrim doğrulamadan önce olmalı, bu yüzden `preprocess`; elle `* 100` değil `toCents`.
 */
const PurchaseOrderRowInCentsSchema = z.preprocess((raw) => {
  const row = raw as { items?: unknown };
  if (!Array.isArray(row?.items)) return raw;
  return {
    ...row,
    items: row.items.map((item) => {
      const { unitPrice, ...rest } = item as { unitPrice?: number | string | null };
      return { ...rest, unitPriceCents: unitPrice == null ? null : toCents(Number(unitPrice)) };
    }),
  };
}, PurchaseOrderRowSchema);

export class PurchaseOrderItemService extends BaseDbService<PurchaseOrderItem, PurchaseOrderItemInsert, PurchaseOrderItemUpdate> {
  /** Kolon `purchase_order_item.unit_price` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['unitPriceCents'];

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
 * Tedarik siparişi (DOMAIN §16): taslak → gönderildi → mal kabulde kapanır. Sistem göndermez, servis kopyalanabilir liste üretir
 * (`printableList`), gönderimi insan yapıp `markSent()` der; biçim (PDF/metin) sunum katmanının işidir.
 */
export class PurchaseOrderService extends BaseDbService<PurchaseOrder, PurchaseOrderInsert, PurchaseOrderUpdate> {
  /**
   * `supplier:supplier_id(...)` + `items:purchase_order_item(...)` — kalemin altında **üç kat**
   * daha var (`batches:stock(...)` → `warehouse:warehouse_id(...)`). Üst iki takma ad yeter: gömülü
   * alt ağaç bütünüyle çevrilir (bkz. `BaseDbService.embeds`).
   */
  protected override readonly embeds = ['supplier', 'items'];
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
   * Tedarikçinin henüz kapanmamış siparişleri, mal kabulün hangi siparişi karşıladığını bulmak için; "açık" tanımı `openProgress`le
   * aynıdır ve küme veriyle büyümediği için sayfalanmaz.
   */
  async listOpenBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
    return this.getAll(
      { supplierId, status: ['draft', 'sent', 'partially_received'] },
      { orderBy: 'createdAt', orderDirection: 'desc' },
    );
  }

  /**
   * Bütün açık siparişler, mal kabulün "kabul bekliyor" listesinin künyeleri; sipariş başına `getById` N+1 olurdu, küme tek sorguda
   * gelir.
   */
  async listOpen(): Promise<PurchaseOrder[]> {
    return this.getAll({ status: ['draft', 'sent', 'partially_received'] }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Kimliğe göre siparişler, geçmişe bakan okumaların künye kaynağı: kabul edilmiş giriş kapanmış bir siparişe bağlıdır ve numarası
   * okunmasaydı defter satırı siparişsiz kabul gibi görünürdü.
   */
  listByIds(ids: readonly string[]): Promise<PurchaseOrder[]> {
    return this.getByIds([...ids]);
  }

  /**
   * Siparişler ekranının sayfası, tek turda ve keyset imleçli: tedarikçi başına tur ya da satır başına ilerleme okuması N+1 olurdu ve
   * zincir gerçek yabancı anahtarlardan gittiği için gömülü `select` yeter. Depo kırılımı fiilen giren partilerden çıkar, hedef depodan
   * değil.
   */
  async listRows(opts: { limit?: number; cursor?: KeysetCursor; status?: PurchaseOrderStatus; supplierId?: string } = {}): Promise<Page<PurchaseOrderRow>> {
    return this.getPageAs(PurchaseOrderRowInCentsSchema, { status: opts.status, supplierId: opts.supplierId }, {
      // `created_at` hem GÖRÜNÜM hem İMLEÇ alanı — dar şema onu taşısa da select'te bulunması şart
      // (bkz. `pageOf`): eksikse ikinci sayfa istenemez.
      select:
        'id,supplier_id,status,reference_no,sent_at,note,created_at,' +
        'supplier:supplier_id(id,name),' +
        'items:purchase_order_item(id,qty,unit_price,batches:stock(initial_qty,warehouse:warehouse_id(id,code)))',
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: opts.limit ?? 20,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Gönderilmiş ve henüz kapanmamış sipariş sayısı ("yolda ne var"), satır taşınmadan sayılır. `supplierId` tedarikçi kartının aynı
   * sorusudur; sayaç ile listenin süzgeci ayrışmasın diye tek metot.
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
        // İkisi de cent: çağıranın verdiği fiyat da, eşlemedeki son alış da (`STACK §8`) — aynı
        // `??` zincirinde iki farklı birim yan yana duramaz.
        unitPriceCents: line.unitPriceCents ?? byVariant.get(line.variantId)?.lastPurchasePriceCents ?? null,
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

  /**
   * İnsan gönderdikten sonra işaretlenir; numara dışarıdan gelir, rastgelelik motorun, benzersizlik veritabanının işidir. Çarpışmada
   * `23505` fırlar ve çağıran yeni numarayla dener, "önce sorgula" iki eşzamanlı gönderime aynı numarayı verirdi.
   */
  async markSent(id: string, referenceNo: string): Promise<PurchaseOrder> {
    return this.update({ id, status: 'sent', referenceNo, sentAt: new Date().toISOString() });
  }

  /** İptal yolu: kapanmış (mal gelmiş) sipariş iptal edilmez — zincir kopar. */
  async cancel(id: string): Promise<PurchaseOrder> {
    const order = await this.getById(id);
    if (!order) throw new Error(`purchase_order bulunamadı: ${id}`);
    if (order.status === 'received') throw new Error('purchase_order: mal gelmiş sipariş iptal edilemez');
    return this.update({ id, status: 'cancelled' });
  }

  /**
   * Siparişin kalem kalem ilerlemesi (`purchase_order_progress`): durum saklanan sayaç değil bu görünümden türer, çünkü sipariş birden
   * çok depoda parça parça kabul edilebilir. Ölçü `initial_qty`dir, `physical_qty` satışla erir.
   */
  /**
   * Açık siparişlerin bekleyen kalemleri: `received` ve `cancelled` dışarıda, `draft` içeride ama ayrı sayılmalı, çünkü tedarikçi
   * taslaktan habersizdir. Açık küme veriyle büyümediği için sayfalanmaz.
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
