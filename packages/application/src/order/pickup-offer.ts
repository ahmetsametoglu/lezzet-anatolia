import { UserProfileService, WarehouseService, type Db } from '@lezzet/database';
import type { CheckoutPickup, Warehouse } from '@lezzet/types';
import { warehouseAddressLine } from '../warehouse/pickup';

/**
 * Gel-al teklifi: müşteri izni × gel-al noktası olan tesisler. İki okuma, ikisi de kapı: `pickup_allowed` olmayan müşteriye
 * teklif yok, gel-al deposu olmayan kurulumda da yok. `requested` listede değilse seçim düşer — istemcinin söylediği depo
 * hiçbir zaman olduğu gibi yazılmaz. Adres seçici (web + native), sepet ve checkout aynı teklifi buradan okur.
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

