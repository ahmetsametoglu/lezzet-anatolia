import type { SupabaseClient } from '@supabase/supabase-js';
import { PurchaseOrderService, ReorderService, SupplierService, WarehouseService, StockService, type DraftLine } from '@lezzet/database';
import { purchaseOrderBusinessOf } from '@lezzet/domain-core';
import type { Business, PurchaseOrder, PurchaseOrderItem, SupplyDraftResponse, SupplyGroup } from '@lezzet/types';
import { displayName, variantNames } from './names';

/*
  Tedarik önerisi kapısı: öneriyi motor kurar (`ReorderService`), bu dosya adlandırır ve başka tesisteki adedi transfer seçeneğinin ham
  verisi olarak iliştirir. Onay anında öneri yeniden hesaplanır, istemci kalem listesi göndermez.
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
      // Ad okumasının zaten taşıdığı küçük resim — ikinci bir sorgu yok (depo ekranlarının deseni).
      imageUrl: names.get(line.variantId)?.imageUrl ?? null,
      availableQty: line.availableQty,
      minStockQty: line.minStockQty,
      suggestedQty: line.suggestedQty,
      incomingQty: line.incomingQty,
      draftQty: line.draftQty,
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
  const reorder = new ReorderService(db);
  const [groups, warehouse] = await Promise.all([
    reorder.suggestions(input.warehouseId),
    new WarehouseService(db).getById(input.warehouseId),
  ]);
  const group = groups.find((candidate) => candidate.supplierId === input.supplierId);
  if (!group || !warehouse) return { status: 'no_suggestion' };

  // Grubun tek hedef deposu vardır, siparişin işi o deponun işidir.
  const { order, items } = await reorder.createDraftFrom(group, warehouse.business);
  return { status: 'ok', purchaseOrderId: order.id, itemCount: items.length };
}

/**
 * Taslak tedarik siparişi açar; işini kalemlerin hedef depolarından, hedef yoksa tedarikçinin varsayılan işinden alır
 * (`purchaseOrderBusinessOf`). İki işin deposuna giden kalemler tek siparişte durmaz.
 */
export async function openPurchaseDraft(
  db: SupabaseClient,
  input: { supplierId: string; lines: readonly DraftLine[]; note?: string },
): Promise<{ status: 'ok'; order: PurchaseOrder; items: PurchaseOrderItem[] } | { status: 'mixed_business' }> {
  const targetIds = [...new Set(input.lines.flatMap((line) => (line.targetWarehouseId ? [line.targetWarehouseId] : [])))];
  const [targets, supplier] = await Promise.all([
    targetIds.length > 0 ? new WarehouseService(db).list({ warehouseIds: targetIds }) : Promise.resolve([]),
    new SupplierService(db).getById(input.supplierId),
  ]);
  const decided = purchaseOrderBusinessOf({
    targetBusinesses: targets.map((warehouse) => warehouse.business),
    supplierDefault: supplier?.defaultBusiness,
  });
  if ('problem' in decided) return { status: 'mixed_business' };
  const { order, items } = await new PurchaseOrderService(db).createDraft(input.supplierId, decided.business, [...input.lines], input.note);
  return { status: 'ok', order, items };
}

/**
 * Öneriden taslak: tedarikçinin eşik altı kalemleri tesis tesis yeniden okunur ve her iş kendi taslağını alır, çünkü bir sipariş tek işe
 * yazılır. Kalem kalmadıysa liste boştur.
 */
export async function openSuggestionDrafts(
  db: SupabaseClient,
  input: { supplierId: string; facilityIds: readonly string[] },
): Promise<PurchaseOrder[]> {
  const reorder = new ReorderService(db);
  const [groups, facilities] = await Promise.all([
    Promise.all(input.facilityIds.map(async (warehouseId) => ({ warehouseId, groups: await reorder.suggestions(warehouseId) }))),
    new WarehouseService(db).list({ warehouseIds: input.facilityIds }),
  ]);
  const businessOf = new Map(facilities.map((warehouse) => [warehouse.id, warehouse.business]));
  const linesOf = new Map<Business, DraftLine[]>();
  for (const { warehouseId, groups: perWarehouse } of groups) {
    const business = businessOf.get(warehouseId);
    const group = perWarehouse.find((candidate) => candidate.supplierId === input.supplierId);
    if (!business || !group) continue;
    // Kalem hedef deposunu taşır: aynı varyant iki depoda eşik altıysa iki satır olur, mal ayrı yere gidecek iki partidir.
    const lines = linesOf.get(business) ?? [];
    for (const line of group.lines) {
      lines.push({
        variantId: line.variantId,
        qty: line.suggestedQty,
        unitPriceCents: line.lastPurchasePriceCents,
        targetWarehouseId: warehouseId,
      });
    }
    linesOf.set(business, lines);
  }
  const orders: PurchaseOrder[] = [];
  for (const [business, lines] of linesOf) {
    orders.push((await new PurchaseOrderService(db).createDraft(input.supplierId, business, lines)).order);
  }
  return orders;
}
