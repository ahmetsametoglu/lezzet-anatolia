'use server';

import { PriceService, ProductService, ProductVariantService, StockService, WarehouseService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import { requireAdmin, requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import { toChannelMaps, toPriceRows, type PriceRow } from '@/lib/pricing/price-rows';

// Önizleme panelinin BAKIŞ okumaları (16.08, kullanıcı kararı): "Stok" düğmesi artık sayfaya
// yönlendirmez, ürünün stok özetini DİYALOGDA açar. Okuma tıklamada yapılır (sipariş hızlı
// bakışının deseni): liste sorgusu her ürünün stok kırılımını taşıyamaz.
//
// DEPO BİR BOYUT DEĞİL DEĞİŞMEZ (CLAUDE.md §1): özet depo başına verilir, tek sayıya İNDİRGENMEZ —
// toplam yalnız "hiç var mı" sorusunun cevabıdır ve ekranda o adla durur.

export interface ProductStockPeek {
  /** Aktif depolar — kolonlar bu sırayla çizilir. */
  warehouses: Array<{ id: string; code: string; name: string }>;
  rows: Array<{
    variantId: string;
    label: string;
    isActive: boolean;
    /** Boyun asgari stok eşiği; `null` = eşik tanımsız (uyarı verilmez). */
    minStockQty: number | null;
    /** Depo başına kullanılabilir (rezervasyon düşülmüş) ve rezerve adet. */
    byWarehouse: Array<{ warehouseId: string; availableQty: number; reservedQty: number }>;
    /** Ağ geneli toplam — yalnız "hiç var mı" okuması, satış kararının sayısı değil. */
    totalAvailable: number;
  }>;
}

export async function loadProductStockPeekAction(productId: string): Promise<ActionResult<ProductStockPeek>> {
  try {
    await requireStaff();
    const db = serviceDb();

    const [variants, warehouses] = await Promise.all([
      new ProductVariantService(db).listByProduct(productId),
      new WarehouseService(db).list({ activeOnly: true }),
    ]);

    const available = await new StockService(db).listAvailableAcross(
      warehouses.map((w) => w.id),
      variants.map((v) => v.id),
    );
    const byKey = new Map(available.map((a) => [`${a.variantId}:${a.warehouseId}`, a]));

    return {
      data: {
        warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
        rows: [...variants]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((v) => {
            const byWarehouse = warehouses.map((w) => {
              const cell = byKey.get(`${v.id}:${w.id}`);
              return { warehouseId: w.id, availableQty: cell?.availableQty ?? 0, reservedQty: cell?.reservedQty ?? 0 };
            });
            return {
              variantId: v.id,
              label: resolveLocalizedText(v.label),
              isActive: v.isActive,
              minStockQty: v.minStockQty,
              byWarehouse,
              totalAvailable: byWarehouse.reduce((sum, c) => sum + c.availableQty, 0),
            };
          }),
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
