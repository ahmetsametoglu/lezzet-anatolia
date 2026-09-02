'use server';

import { PriceService, ProductService, SettingsService, StockService, serviceDb } from '@lezzet/database';
import { requireAdmin, requireWarehouseScope } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import { toChannelMaps, toPriceRows, type PriceRow } from '@/lib/pricing/price-rows';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { toLevelRows, type StockLevelRow } from '@/lib/stock/level-rows';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';

// Önizleme panelinin BAKIŞ okumaları (16.08, kullanıcı kararı): "Stok" düğmesi artık sayfaya
// yönlendirmez, ürünün stok özetini DİYALOGDA açar. Okuma tıklamada yapılır (sipariş hızlı
// bakışının deseni): liste sorgusu her ürünün stok kırılımını taşıyamaz.
//
// SATIR STOK EKRANININKİYLE AYNI (16.08, ikinci tur): diyalog artık stok sayfasının ürün geçmişi
// panelini açıyor, o yüzden okuma da `toLevelRows`tan geçer — kullanılabilir/ayrılmış, depo
// kırılımı, eşik kararı iki yüzeyde tek kurulumdan çıkar. Depo kapsamı da stok sayfasıyla aynı
// kapıdan sorulur (`readWarehouseContext`, DOMAIN §17): personel görmediği deponun partisini
// bakışta da göremez.

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
 * Ürünün fiyat bakışı — "Fiyatlar" düğmesinin diyaloğu. Satırlar fiyat ekranıyla AYNI kurulumdan
 * gelir (`toPriceRows`, `lib/pricing`): marj tanımı ve marj-altı ölçütü iki yüzeyde ayrışamaz.
 *
 * **Yalnız ADMİN** (fiyat ekranının kendi kapısı): depo ve kurye maliyet/marj görmez — ürünler
 * sayfası personele açık olsa da bu okuma değildir; guard farkı bilinçli.
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
