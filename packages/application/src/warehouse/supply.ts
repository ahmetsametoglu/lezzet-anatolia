import type { SupabaseClient } from '@supabase/supabase-js';
import { ReorderService, SupplierService, WarehouseService, StockService } from '@lezzet/database';
import type { SupplyDraftResponse, SupplyGroup } from '@lezzet/types';
import { displayName, variantNames } from './names';

/*
  TEDARİK ÖNERİSİ KAPISI (21.12 · Y4) — öneri listesi + grup onayından taslak TS.

  ÖNERİYİ MOTOR KURAR (`ReorderService`: eşik depo bazlı, yoldaki düşülür, koli katına yuvarlanır);
  bu dosya yalnız ADLANDIRIR (varyant/tedarikçi/depo adları) ve BAŞKA TESİSTEKİ adedi iliştirir —
  transfer seçeneğinin ham verisi, kararı değil (v2:648; K6: ölçülmeyen varsayılmaz, ayrı gösterilir).

  ONAY ANINDA ÖNERİ YENİDEN HESAPLANIR: istemci kalem listesi GÖNDERMEZ. Bayat bir ekranın
  kalemlerini kayda geçirmek, onay ile stok arasında geçen sürede değişen gerçeği yok saymak olurdu;
  taslak TS zaten tedarikçiye gitmiyor (DOMAIN §16), tazesi her zaman doğrusudur.
*/

/** Verilen tesislerin eşik-altı önerileri, tedarikçiye gruplu ve adlandırılmış. */
export async function listSupplyGroups(
  db: SupabaseClient,
  input: { warehouseIds: readonly string[] },
): Promise<SupplyGroup[]> {
  if (input.warehouseIds.length === 0) return [];

  const reorder = new ReorderService(db);
  const groupsPerWarehouse = await Promise.all(input.warehouseIds.map((id) => reorder.suggestions(id)));
  const groups = groupsPerWarehouse.flat();
  if (groups.length === 0) return [];

  const variantIds = [...new Set(groups.flatMap((group) => group.lines.map((line) => line.variantId)))];
  const supplierIds = [...new Set(groups.map((g) => g.supplierId).filter((id): id is string => id !== null))];

  const warehouses = await new WarehouseService(db).list({ activeOnly: true });
  const codeOf = new Map(warehouses.map((w) => [w.id, w.code]));
  // Başka TESİSTE duran adet: önerinin çıktığı depo hariç, ağdaki öteki tesisler. Araçlar bilerek
  // dışarıda — araçtaki mal günün rotasınındır, raf doldurma kararının hammaddesi değil.
  const otherFacilityIds = warehouses
    .filter((w) => w.kind === 'facility')
    .map((w) => w.id);

  // Tedarikçi kümesi operatör kurulumudur (doğal tavan) — tek turda çekilir, kimlikle süzülür.
  const [names, suppliers, elsewhereRows] = await Promise.all([
    variantNames(db, variantIds),
    supplierIds.length > 0 ? new SupplierService(db).list() : Promise.resolve([]),
    new StockService(db).listAvailableAcross(otherFacilityIds, variantIds),
  ]);
  const supplierNameOf = new Map<string, string>(suppliers.map((supplier) => [supplier.id, supplier.name]));

  return groups.map((group) => ({
    supplierId: group.supplierId,
    supplierName: group.supplierId === null ? null : (supplierNameOf.get(group.supplierId) ?? null),
    warehouseId: group.warehouseId,
    warehouseCode: codeOf.get(group.warehouseId) ?? null,
    lines: group.lines.map((line) => ({
      variantId: line.variantId,
      title: displayName(names.get(line.variantId)),
      availableQty: line.availableQty,
      minStockQty: line.minStockQty,
      suggestedQty: line.suggestedQty,
      incomingQty: line.incomingQty,
      lastPurchaseCents: line.lastPurchasePriceCents,
      elsewhere: elsewhereRows
        .filter(
          (row) =>
            row.variantId === line.variantId && row.warehouseId !== group.warehouseId && row.availableQty > 0,
        )
        .map((row) => ({ warehouseCode: codeOf.get(row.warehouseId) ?? '?', qty: row.availableQty })),
    })),
  }));
}

/**
 * Grup onayı → taslak satın alma siparişi (TS). Öneri ONAY ANINDA yeniden hesaplanır; bu tedarikçi
 * için eşik-altı kalem kalmamışsa `no_suggestion` — bir hata değil, "ekran bayattı" cevabı.
 */
export async function createSupplyDraft(
  db: SupabaseClient,
  input: { warehouseId: string; supplierId: string },
): Promise<SupplyDraftResponse> {
  const groups = await new ReorderService(db).suggestions(input.warehouseId);
  const group = groups.find((candidate) => candidate.supplierId === input.supplierId);
  if (!group) return { status: 'no_suggestion' };

  const { order, items } = await new ReorderService(db).createDraftFrom(group);
  return { status: 'ok', purchaseOrderId: order.id, itemCount: items.length };
}
