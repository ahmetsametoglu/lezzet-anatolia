'use server';

import { PriceService, ProductService, SettingsService, StockService, VariantBarcodeService, serviceDb } from '@lezzet/database';
import { readCostBasis } from '@lezzet/application';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { toChannelMaps, toPriceRows } from '@/lib/pricing/price-rows';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { toLevelRows } from '@/lib/stock/level-rows';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import type { VariantRowDetail } from '../products-types';

// AÇILAN SATIRIN TEK İSTEĞİ. Liste satırı toplamları taşır (stok, birincil boyun fiyatı); boyun
// kimliği ve partisi ise ancak operatör satırı açınca sorulur — ve hepsi TEK turda sorulur, yoksa
// bir satırı açmak dört ayrı bekleyiş üretirdi.
//
// Parti okuması buradadır, listede değildir (kullanıcı kararı): "en yakın son tarih" kolonu listeye
// konsaydı her sayfa yüklemesi katalogun partilerini de çekerdi.

export async function loadProductRowDetailAction(productId: string): Promise<ActionResult<VariantRowDetail[]>> {
  try {
    await requireAdmin();
    const ctx = await readWarehouseContext();
    const db = serviceDb();

    // Ürün TAM okunur (dar stok/fiyat okumaları yerine tek okuma): aynı satır hem partinin hem
    // fiyatın tabanı ve iki dar okuma aynı ürünü iki kez getirirdi.
    const page = await new ProductService(db).listWithRelations({ filters: { ids: [productId] }, limit: 1 });
    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));
    if (variantIds.length === 0) return { data: [], error: null };

    const stockSvc = new StockService(db);
    const priceSvc = new PriceService(db);
    const [batchRows, available, thresholds, warehouseLabels, barcodes, b2c, b2b, costs] = await Promise.all([
      stockSvc.listInStockDetailed(variantIds, ctx.warehouseIds),
      stockSvc.listAvailableAcross(ctx.visibleWarehouseIds, variantIds),
      readExpiryThresholds(new SettingsService(db)),
      readWarehouseLabels(),
      new VariantBarcodeService(db).listByVariants(variantIds),
      priceSvc.findApplicableMap(variantIds, 'b2c'),
      priceSvc.findApplicableMap(variantIds, 'b2b'),
      readCostBasis(db, variantIds),
    ]);

    // Kırılım stok ekranıyla AYNI kurulumdan gelir: "en yakın parti" ve depo dağılımı iki ekranda
    // iki ayrı kuralla hesaplanmaz. Kategori adı çizilmiyor, boş harita bilinçli.
    const batches = toBatchViews(batchRows, { now: new Date(), thresholds, warehouseLabels });
    const levels = toLevelRows({ products: page.rows, batches, available, categoryNames: new Map(), warehouseLabels });
    const prices = toPriceRows({ products: page.rows, prices: toChannelMaps(b2c, b2b), costs, categoryNames: new Map() });

    const priceByVariant = new Map(prices.map((row) => [row.variantId, row]));
    const codesByVariant = new Map<string, VariantRowDetail['barcodes']>();
    for (const barcode of barcodes) {
      const list = codesByVariant.get(barcode.variantId) ?? [];
      list.push({ code: barcode.code, kind: barcode.kind });
      codesByVariant.set(barcode.variantId, list);
    }

    const rows: VariantRowDetail[] = levels.map((level) => {
      const price = priceByVariant.get(level.variantId);
      return {
        variantId: level.variantId,
        barcodes: codesByVariant.get(level.variantId) ?? [],
        warehouses: level.warehouses,
        availableQty: level.availableQty,
        nearest: level.nearest,
        b2cCents: price?.b2c.amountCents ?? null,
        b2bCents: price?.b2b.amountCents ?? null,
        costCents: price?.costCents ?? null,
        vatRate: price?.vatRate ?? 0,
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
