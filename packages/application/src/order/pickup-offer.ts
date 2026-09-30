import { UserProfileService, WarehouseService, type Db } from '@lezzet/database';
import type { CheckoutPickup, Warehouse } from '@lezzet/types';
import { warehouseAddressLine } from '../warehouse/pickup';

/**
 * Gel-al teklifi: müşteri izni (`pickup_allowed`) × gel-al noktası olan tesisler; biri yoksa teklif yok. `requested` listede
 * değilse seçim düşer, çünkü istemcinin söylediği depo olduğu gibi yazılmaz.
 */
export async function readPickupOffer(
  db: Db,
  customerId: string,
  requested: string | null,
): Promise<{ offer: CheckoutPickup | null; warehouse: Warehouse | null }> {
  const customer = await new UserProfileService(db).getById(customerId);
  if (!customer?.pickupAllowed) return { offer: null, warehouse: null };
  const warehouses = await new WarehouseService(db).list({ activeOnly: true, kind: 'facility', pickupEnabled: true });
  if (warehouses.length === 0) return { offer: null, warehouse: null };
  const warehouse = warehouses.find((w) => w.id === requested) ?? null;
  return {
    offer: {
      warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, addressLine: warehouseAddressLine(w) })),
      selectedWarehouseId: warehouse?.id ?? null,
    },
    warehouse,
  };
}

