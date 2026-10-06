import type { SupabaseClient } from '@supabase/supabase-js';
import { WarehouseVariantThresholdSchema, type DepotStockThreshold, type WarehouseVariantThreshold } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Depo bazlı asgari stok eşiği istisnaları (`warehouse_variant_threshold`). Satır yalnız varyantın varsayılanından farkı yazar;
 * etkin eşik `resolve`da tek yerde çözülür ki tedarik önerisi ile stok ekranı aynı sayıyı görsün.
 */
export class WarehouseVariantThresholdService extends BaseDbService<
  WarehouseVariantThreshold,
  WarehouseVariantThreshold,
  WarehouseVariantThreshold
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'warehouse_variant_threshold',
      WarehouseVariantThresholdSchema,
      WarehouseVariantThresholdSchema,
      WarehouseVariantThresholdSchema,
      false,
    );
  }

  /** Deponun bütün istisnaları; tablo yalnız farkları taşıdığı için küme küçüktür ve varyant listesiyle daraltılmaz. */
  async listForWarehouse(warehouseId: string): Promise<WarehouseVariantThreshold[]> {
    return this.getAll({ warehouseId });
  }

  /** Verilen varyantların bu depodaki eşiği; `defaults` varyantın kendi eşiğidir (`product_variant.min_stock_qty`). */
  async resolve(warehouseId: string, defaults: ReadonlyMap<string, number | null>): Promise<Map<string, DepotStockThreshold>> {
    if (defaults.size === 0) return new Map();
    return WarehouseVariantThresholdService.combine(defaults, await this.listForWarehouse(warehouseId));
  }

  /** Etkin eşik kuralı: istisna varsa o, yoksa varsayılan; okumayı başka sorguyla paralel yürüten çağıran için ayrı durur. */
  static combine(
    defaults: ReadonlyMap<string, number | null>,
    overrides: readonly WarehouseVariantThreshold[],
  ): Map<string, DepotStockThreshold> {
    const byVariant = new Map(overrides.map((row) => [row.variantId, row.minStockQty]));
    return new Map(
      [...defaults].map(([variantId, defaultQty]) => {
        const overrideQty = byVariant.get(variantId) ?? null;
        return [variantId, { defaultQty, overrideQty, minStockQty: overrideQty ?? defaultQty }] as const;
      }),
    );
  }

  /** İstisnayı yazar ya da değiştirir. */
  async set(row: WarehouseVariantThreshold): Promise<WarehouseVariantThreshold> {
    return this.upsert(row, 'warehouse_id,variant_id');
  }

  /** İstisnayı kaldırır; depo yeniden varyantın varsayılanını kullanır. */
  async clear(warehouseId: string, variantId: string): Promise<void> {
    await this.deleteWhere({ warehouseId, variantId });
  }
}
