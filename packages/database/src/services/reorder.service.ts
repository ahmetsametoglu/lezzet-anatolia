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
  lastPurchasePrice: number | null;
}

/** Tedarikçiye göre gruplanmış öneri — liste tek dokunuşla PO taslağına dönsün diye. */
export interface ReorderGroup {
  supplierId: string | null;
  lines: ReorderLine[];
}

/**
 * "Sipariş zamanı" önerisi (06.11) — DOMAIN §16 Faz 1 (eşik). Kullanılabilir stoğu `min_stock_qty`
 * altına düşen varyantlar tedarikçiye göre gruplanır; **otomatik sipariş yoktur**, karar admin'in.
 *
 * Tedarikçisi eşlenmemiş varyantlar da listelenir (`supplierId: null`) — görünmez olmaları
 * "eksik ürün fark edilmedi" demektir; eksik olan eşlemedir, ürünün kendisi değil.
 *
 * Faz 2 (satış hızı + tedarik süresi + sezon ile "şu tarihte biter" tahmini) AI içgörü ailesine ait.
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
   * BİR DEPODA eşik altına inen varyantlar, tercihli tedarikçilerine göre gruplu.
   *
   * Öneri depo başınadır (C6) ve bu isteğe bağlı bir ayrıntı değil: eşiğin kendisi depo bazlı
   * (varyanttaki değer varsayılan, depo satırı istisna). Depo-üstü tek bir öneri listesi "toplamda
   * 40 var" deyip Kehl'in boş rafını gizlerdi — sipariş de o rafı doldurmak için verilecek.
   */
  async suggestions(warehouseId: string): Promise<ReorderGroup[]> {
    const below = await this.stocks.listBelowMinStock(warehouseId);
    if (below.length === 0) return [];

    const mappings = await this.mappings.listByVariants(below.map((row) => row.variantId));
    // Bir varyantın birden çok kaynağı olabilir: tercihli olan kazanır, yoksa ilk eşleme.
    const chosen = new Map<string, (typeof mappings)[number]>();
    for (const mapping of mappings) {
      const current = chosen.get(mapping.variantId);
      if (!current || (mapping.isPreferred && !current.isPreferred)) chosen.set(mapping.variantId, mapping);
    }

    const groups = new Map<string | null, ReorderGroup>();
    for (const row of below) {
      const mapping = chosen.get(row.variantId) ?? null;
      const supplierId = mapping?.supplierId ?? null;
      const group = groups.get(supplierId) ?? { supplierId, lines: [] };
      group.lines.push({
        variantId: row.variantId,
        availableQty: row.availableQty,
        minStockQty: row.minStockQty,
        // Eşiğe çıkaracak kadar; koli içi adet biliniyorsa yukarı yuvarlanır (koli bölünmez).
        suggestedQty: roundToPack(row.minStockQty - row.availableQty, mapping?.packQty ?? null),
        supplierCode: mapping?.supplierCode ?? null,
        lastPurchasePrice: mapping?.lastPurchasePrice ?? null,
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
      unitPrice: line.lastPurchasePrice,
    }));
    return this.orders.createDraft(group.supplierId, lines, note);
  }
}

/** Koli içi adet biliniyorsa üste yuvarlar (yarım koli sipariş edilmez); en az 1. */
function roundToPack(qty: number, packQty: number | null): number {
  const needed = Math.max(1, qty);
  if (!packQty || packQty <= 1) return needed;
  return Math.ceil(needed / packQty) * packQty;
}
