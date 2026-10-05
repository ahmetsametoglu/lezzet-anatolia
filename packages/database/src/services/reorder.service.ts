import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchaseOrder, PurchaseOrderItem } from '@lezzet/types';
import { PurchaseOrderService, type DraftLine } from './purchase-order.service';
import { StockService } from './stock.service';
import { SupplierProductService } from './supplier.service';

/** Eşiğin altına düşmüş bir varyant — önerilen sipariş miktarıyla. */
export interface ReorderLine {
  variantId: string;
  availableQty: number;
  minStockQty: number;
  /** Eşiğe çıkarmak için gereken adet — öneridir, admin değiştirebilir. */
  suggestedQty: number;
  supplierCode: string | null;
  /** Eşlemedeki "geçen sefer kaçtı" (**cent**, `STACK §8`) — taslağın beklenen alışı bundan doğar. */
  lastPurchasePriceCents: number | null;
  /**
   * **Yolda**: GÖNDERİLMİŞ siparişlerden bu depoya bekleyen adet (`sent` + `partially_received`).
   * Eşik karşılaştırmasına GİRER — mal yolda ise raf yakında dolacaktır.
   */
  incomingQty: number;
  /**
   * Taslakta: bu depoya açılmış, gönderilmemiş siparişlerdeki adet, eşikten düşülür, çünkü düşülmeseydi her basış aynı öneriden yeni
   * taslak açardı. `incomingQty`den ayrı alandır: biri tedarikçinin bildiği bekleyiş, öteki bizim kararımız.
   */
  draftQty: number;
  /**
   * Hedef deposu yazılmamış açık siparişlerdeki adet: hiçbir depoya sayılmaz ama görünür kalır, çünkü malın bakılan depoya geleceğini
   * varsaymak "eksik kapandı" deyip rafı boş bırakırdı.
   */
  unassignedQty: number;
}

/** Tedarikçiye göre gruplanmış öneri — liste tek dokunuşla PO taslağına dönsün diye. */
export interface ReorderGroup {
  supplierId: string | null;
  /**
   * Önerinin ÇIKTIĞI depo (C6) — taslağa hedef olarak yazılır.
   *
   * Bunu taşımak zorunlu: hedefsiz açılan sipariş hiçbir deponun eksiğini kapatmaz (yukarı bak) ve
   * öneriden açılan siparişler hedefsiz kalsaydı, "yolda" hesabı tam da onu doğuran akışta
   * çalışmazdı — düzeltme kâğıt üstünde kalırdı.
   */
  warehouseId: string;
  lines: ReorderLine[];
}

/**
 * Sipariş zamanı önerisi (DOMAIN §16, eşik): kullanılabilir stoğu `min_stock_qty` altına düşen varyantlar tedarikçiye göre gruplanır,
 * otomatik sipariş yoktur. Tedarikçisi eşlenmemiş varyant da listelenir (`supplierId: null`), eksik olan eşlemedir.
 */
export class ReorderService {
  private readonly stocks: StockService;
  private readonly mappings: SupplierProductService;
  private readonly orders: PurchaseOrderService;

  constructor(supabase: SupabaseClient) {
    this.stocks = new StockService(supabase);
    this.mappings = new SupplierProductService(supabase);
    this.orders = new PurchaseOrderService(supabase);
  }

  /**
   * Bir depoda eşik altına inen varyantlar, tercihli tedarikçilerine göre gruplu: eşik depo bazlıdır ve depo-üstü tek liste "toplamda 40
   * var" deyip boş rafı gizlerdi.
   */
  async suggestions(warehouseId: string): Promise<ReorderGroup[]> {
    const below = await this.stocks.listBelowMinStock(warehouseId);
    if (below.length === 0) return [];

    // Yoldaki mal da eldedir: sipariş stoğu değiştirmez ve yalnız `availableQty < minStockQty`ye bakılsaydı aynı tedarikçiye üst üste
    // basmak ikinci, üçüncü siparişi açardı.
    const pending = await this.orders.openProgress();
    const incoming = sumByVariant(pending, (row) => row.status !== 'draft' && row.targetWarehouseId === warehouseId);
    const drafts = sumByVariant(pending, (row) => row.status === 'draft' && row.targetWarehouseId === warehouseId);
    const unassigned = sumByVariant(pending, (row) => row.targetWarehouseId === null);

    const mappings = await this.mappings.listByVariants(below.map((row) => row.variantId));
    // Bir varyantın birden çok kaynağı olabilir: tercihli olan kazanır, yoksa ilk eşleme.
    const chosen = new Map<string, (typeof mappings)[number]>();
    for (const mapping of mappings) {
      const current = chosen.get(mapping.variantId);
      if (!current || (mapping.isPreferred && !current.isPreferred)) chosen.set(mapping.variantId, mapping);
    }

    const groups = new Map<string | null, ReorderGroup>();
    for (const row of below) {
      const incomingQty = incoming.get(row.variantId) ?? 0;
      const draftQty = drafts.get(row.variantId) ?? 0;
      // Yoldaki ve taslaktaki adet eksiği kapatıyorsa satır düşer; süzgeç SQL'de değil burada, çünkü aday kümeyi yalnız küçültür.
      if (row.availableQty + incomingQty + draftQty >= row.minStockQty) continue;

      const mapping = chosen.get(row.variantId) ?? null;
      const supplierId = mapping?.supplierId ?? null;
      const group = groups.get(supplierId) ?? { supplierId, warehouseId, lines: [] };
      group.lines.push({
        variantId: row.variantId,
        availableQty: row.availableQty,
        minStockQty: row.minStockQty,
        // Eşiğe çıkaracak kadar, yoldaki ve taslaktaki düşülerek; koli içi adet biliniyorsa yukarı yuvarlanır, koli bölünmez.
        suggestedQty: roundToPack(
          row.minStockQty - row.availableQty - incomingQty - draftQty,
          mapping?.packQty ?? null,
        ),
        supplierCode: mapping?.supplierCode ?? null,
        lastPurchasePriceCents: mapping?.lastPurchasePriceCents ?? null,
        incomingQty,
        draftQty,
        unassignedQty: unassigned.get(row.variantId) ?? 0,
      });
      groups.set(supplierId, group);
    }
    return [...groups.values()];
  }

  /**
   * Bir öneri grubundan taslak PO üretir — "tek dokunuş". Tedarikçisi olmayan grup sipariş edilemez:
   * kime yazılacağı belli değildir, sessizce boş tedarikçiyle kayıt açmak yerine açıkça reddedilir.
   */
  async createDraftFrom(group: ReorderGroup, note?: string): Promise<{ order: PurchaseOrder; items: PurchaseOrderItem[] }> {
    if (!group.supplierId) throw new Error('reorder: tedarikçisi eşlenmemiş kalemlerden sipariş açılamaz');

    const lines: DraftLine[] = group.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.suggestedQty,
      unitPriceCents: line.lastPurchasePriceCents,
      // Hedef depo yazılır, çünkü öneri depo başınadır; yazılmasa sonraki turda `incomingQty` 0 kalır ve operatör ikinci siparişi açardı.
      targetWarehouseId: group.warehouseId,
    }));
    return this.orders.createDraft(group.supplierId, lines, note);
  }
}

/** Varyant başına bekleyen adet toplamı — süzgeci çağıran verir (yolda / taslak / hedefsiz). */
function sumByVariant<T extends { variantId: string; missingQty: number }>(
  rows: readonly T[],
  keep: (row: T) => boolean,
): Map<string, number> {
  const total = new Map<string, number>();
  for (const row of rows) {
    if (!keep(row)) continue;
    total.set(row.variantId, (total.get(row.variantId) ?? 0) + row.missingQty);
  }
  return total;
}

/** Koli içi adet biliniyorsa üste yuvarlar (yarım koli sipariş edilmez); en az 1. */
function roundToPack(qty: number, packQty: number | null): number {
  const needed = Math.max(1, qty);
  if (!packQty || packQty <= 1) return needed;
  return Math.ceil(needed / packQty) * packQty;
}
