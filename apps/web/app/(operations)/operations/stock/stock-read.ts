import { resolveLocalizedText, type ProductStockRow, type StockMovementDetail } from '@lezzet/types';
import { WarehouseVariantThresholdService, type Db, type UserProfileService } from '@lezzet/database';
import type { WarehouseContext } from '@/lib/warehouse/context';
import { titleOf } from '@/lib/catalog/title';
import { type LossRow } from './stock-types';

// DB satırı → view-model indirgemesi; sayfa ile eylemler paylaşır ki ilk sayfa ile sonraki sayfalar aynı şekli üretsin.
// `toLevelRows` ürünler önizlemesiyle ortak olduğu için lib'de durur, buradan yeniden dışa verilir.

export { toLevelRows } from '@/lib/stock/level-rows';

/** Seviye bakışının odak deposu: süzgeç seçiliyse o, bağlam tek depoya inmişse o; ağ bakışında depo eşiği yoktur. */
export function focusDepotOf(ctx: WarehouseContext, active: { id: string } | null): string | null {
  return active?.id ?? ctx.activeWarehouseId;
}

/** Odak deponun sayfadaki boylar için etkin eşikleri; varsayılan, ürün satırındaki varyant eşiğidir. */
export async function readDepotThresholds(db: Db, depotId: string | null, products: readonly ProductStockRow[]) {
  if (!depotId) return null;
  const defaults = new Map(products.flatMap((p) => p.variants.map((v) => [v.id, v.minStockQty] as const)));
  return { warehouseId: depotId, thresholds: await new WarehouseVariantThresholdService(db).resolve(depotId, defaults) };
}

export async function readActorNames(db: UserProfileService, rows: StockMovementDetail[]): Promise<Map<string, string>> {
  // `actor_id` FK taşımıyor (personel kimliği auth şemasında), gömülü select ile gelemez →
  // sayfadaki KİMLİKLER tek turda çözülür. Satır başına sorgu (N+1) bir geçmiş listesinde en pahalı
  // hatadır.
  const ids = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
  if (ids.length === 0) return new Map();
  const people = await db.listByIds(ids);
  return new Map(people.map((p) => [p.id, p.name]));
}

/** Defter kayıtlarını ekran satırına indirger — maliyet cent'e, adlar çözülmüş. */
export function toLossRows(
  rows: StockMovementDetail[],
  actorNames: Map<string, string> = new Map(),
  warehouseNames: Map<string, { code: string; name: string }> = new Map(),
): LossRow[] {
  return rows.map((row) => {
    const productName = resolveLocalizedText(row.stock.variant.product.name);
    const variantLabel = resolveLocalizedText(row.stock.variant.label);
    return {
      ...row,
      title: titleOf(productName, variantLabel),
      // Maliyet ve `qty` pozitiftir; yön `direction`da durur ve ekran onu sözle söyler, işaret "−14,45 €" gibi satır doğururdu.
      costCents: row.unitCostCents === null ? null : row.unitCostCents * row.qty,
      actorName: (row.actorId && actorNames.get(row.actorId)) || null,
      // Ad çözülemezse `null`, uydurma ad gösterilmez. Ekran dar sütunda kodu gösterir (belge numaraları da kodla ayrışır),
      // tam ad `title`da durur.
      warehouseCode: warehouseNames.get(row.warehouseId)?.code ?? null,
      warehouseName: warehouseNames.get(row.warehouseId)?.name ?? null,
    };
  });
}
