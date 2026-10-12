'use server';

import { PriceService, ProductService, SettingsService, StockService, VariantBarcodeService, serviceDb } from '@lezzet/database';
import { readCostBasis } from '@lezzet/application';
import { readDistanceSaleThreshold } from '@lezzet/application/accounting/distance-sale-threshold';
import { AUTO_PRICE_STEP_DEFAULT, AUTO_PRICE_STEP_KEY } from '@lezzet/domain-core';
import { countryCellsOf, countryVatOf, generalPricesOf } from '@/components/operation/prices/country-prices';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { toChannelMaps, toPriceRows } from '@/lib/pricing/price-rows';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { toLevelRows } from '@/lib/stock/level-rows';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import type { VariantRowDetail } from '../products-types';
import type { ProductRowDetail } from '../tabs/product/row-detail-types';

// Açılan satırın tek isteği: boyun kimliği, partisi, fiyatları ve ürünün ülke oranları tek turda sorulur, yoksa bir satırı açmak
// ayrı bekleyişler üretirdi. Parti okuması listede değil burada, çünkü liste her sayfada katalogun partilerini çekemez.

export async function loadProductRowDetailAction(productId: string): Promise<ActionResult<ProductRowDetail | null>> {
  try {
    await requireAdmin();
    const ctx = await readWarehouseContext();
    const db = serviceDb();

    // Ürün tam okunur: aynı satır partinin, fiyatın ve ülke oranlarının tabanıdır.
    const page = await new ProductService(db).listWithRelations({ filters: { ids: [productId] }, limit: 1 });
    const product = page.rows[0];
    if (!product) return { data: null, error: 'Ürün bulunamadı.' };
    const variantIds = product.variants.map((v) => v.id);

    const stockSvc = new StockService(db);
    const priceSvc = new PriceService(db);
    const settings = new SettingsService(db);
    const [batchRows, available, thresholds, warehouseLabels, barcodes, b2c, b2b, costs, threshold, step] = await Promise.all([
      stockSvc.listInStockDetailed(variantIds, ctx.warehouseIds),
      stockSvc.listAvailableAcross(ctx.visibleWarehouseIds, variantIds),
      readExpiryThresholds(settings),
      readWarehouseLabels(),
      new VariantBarcodeService(db).listByVariants(variantIds),
      priceSvc.findListPricesMap(variantIds, 'b2c'),
      priceSvc.findListPricesMap(variantIds, 'b2b'),
      readCostBasis(db, variantIds),
      readDistanceSaleThreshold(db),
      settings.getNumber(AUTO_PRICE_STEP_KEY, AUTO_PRICE_STEP_DEFAULT),
    ]);

    // Kırılım stok ekranıyla aynı kurulumdan gelir: "en yakın parti" ve depo dağılımı iki ekranda iki ayrı kuralla hesaplanmaz.
    const batches = toBatchViews(batchRows, { now: new Date(), thresholds, warehouseLabels });
    const levels = toLevelRows({ products: page.rows, batches, available, categoryNames: new Map(), warehouseLabels });
    const prices = toPriceRows({
      products: page.rows,
      prices: toChannelMaps(generalPricesOf(b2c), generalPricesOf(b2b)),
      costs,
      categoryNames: new Map(),
    });

    const priceByVariant = new Map(prices.map((row) => [row.variantId, row]));
    const codesByVariant = new Map<string, VariantRowDetail['barcodes']>();
    for (const barcode of barcodes) {
      const list = codesByVariant.get(barcode.variantId) ?? [];
      list.push({ code: barcode.code, kind: barcode.kind });
      codesByVariant.set(barcode.variantId, list);
    }

    return {
      data: {
        variants: levels.map((level) => ({
          variantId: level.variantId,
          barcodes: codesByVariant.get(level.variantId) ?? [],
          warehouses: level.warehouses,
          availableQty: level.availableQty,
          nearest: level.nearest,
          price: priceByVariant.get(level.variantId) ?? null,
          countryPrices: countryCellsOf(level.variantId, b2c, b2b),
        })),
        sellerRate: product.vatRate,
        countryVat: countryVatOf(product, threshold.destinationTaxation),
        autoPriceStepCents: step,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
