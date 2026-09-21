'use server';

import { PriceService, ProductService, SettingsService, StockService, serviceDb } from '@lezzet/database';
import { requireAdmin, requireWarehouseScope } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import { toChannelMaps, toPriceRows, type PriceRow } from '@/lib/pricing/price-rows';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { toLevelRows, type StockLevelRow } from '@/lib/stock/level-rows';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';

// Önizleme panelinin bakış okumaları tıklamada yapılır, çünkü liste sorgusu her ürünün stok kırılımını taşıyamaz.
// Satır stok ekranıyla aynı kurulumdan (`toLevelRows`) ve depo kapsamı aynı kapıdan (`readWarehouseContext`) gelir.

export interface ProductStockPeek {
  /** Ürünün boyları — stok ekranının seviye satırıyla BİREBİR aynı kurulum. */
  rows: StockLevelRow[];
  /** Kapsamdaki depolar (bağlam sırasıyla) — çok boylu seçicinin kolonları, panelin depo adları. */
  warehouses: Array<{ id: string; code: string; name: string }>;
  /** Depo adları/kırılım çizilir mi — stok sayfasının kuralı (yalnız çok depolu bakışta). */
  showWarehouse: boolean;
}

export async function loadProductStockPeekAction(productId: string): Promise<ActionResult<ProductStockPeek>> {
  try {
    await requireWarehouseScope();
    const ctx = await readWarehouseContext();
    const db = serviceDb();
    const stockSvc = new StockService(db);

    const [page, thresholds, warehouseLabels] = await Promise.all([
      new ProductService(db).listStockRows({ filters: { ids: [productId] }, limit: 1 }),
      readExpiryThresholds(new SettingsService(db)),
      readWarehouseLabels(),
    ]);
    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));

    const [batchRows, available] = await Promise.all([
      stockSvc.listInStockDetailed(variantIds, ctx.warehouseIds),
      stockSvc.listAvailableAcross(ctx.visibleWarehouseIds, variantIds),
    ]);

    const batches = toBatchViews(batchRows, { now: new Date(), thresholds, warehouseLabels });
    return {
      data: {
        // Kategori adı bakışta çizilmiyor — boş harita bilinçli (satır alanı '—' bırakır).
        rows: toLevelRows({ products: page.rows, batches, available, categoryNames: new Map(), warehouseLabels }),
        // Stok BAKIŞI — seçenek değil KIRILIM: "bu ürün nerede duruyor" sorusunun cevabına araç da
        // girer (`data-model/depo.md`: depo bazlı okuma aracı aynen gösterir).
        warehouses: ctx.warehousesWithVehicles.map((w) => ({ id: w.id, code: w.code, name: w.name })),
        showWarehouse: ctx.activeWarehouseId === null && ctx.warehousesWithVehicles.length > 1,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Ürünün fiyat bakışı; satırlar fiyat ekranıyla aynı kurulumdan (`toPriceRows`) gelir ki marj tanımı ayrışmasın.
 * Yalnız admin, çünkü depo ve kurye maliyet görmez.
 */
export async function loadProductPricesPeekAction(productId: string): Promise<ActionResult<PriceRow[]>> {
  try {
    await requireAdmin();
    const db = serviceDb();

    const page = await new ProductService(db).listPriceRows({ filters: { ids: [productId] }, limit: 1 });
    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));

    const priceSvc = new PriceService(db);
    const [b2c, b2b, costs] = await Promise.all([
      priceSvc.findApplicableMap(variantIds, 'b2c'),
      priceSvc.findApplicableMap(variantIds, 'b2b'),
      readCostBasis(db, variantIds),
    ]);

    // Kategori adı diyalogda çizilmiyor — boş harita bilinçli (satır kurulumu alanı boş bırakır).
    return {
      data: toPriceRows({ products: page.rows, prices: toChannelMaps(b2c, b2b), costs, categoryNames: new Map() }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
