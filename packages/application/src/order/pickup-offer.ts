import { UserProfileService, WarehouseService, type Db } from '@lezzet/database';
import type { CheckoutPickup, UserProfile, Warehouse } from '@lezzet/types';
import { warehouseAddressLine } from '../warehouse/pickup';

/**
 * Gel-al teklifi: müşteri izni (`pickup_allowed`) × müşterinin işindeki gel-al noktaları; biri yoksa teklif yok. `requested` listede
 * değilse seçim düşer, çünkü istemcinin söylediği depo olduğu gibi yazılmaz.
 */
export async function readPickupOffer(db: Db, customerId: string, requested: string | null): Promise<PickupOffer> {
  return pickupOfferFor(db, await new UserProfileService(db).getById(customerId), requested);
}

type PickupOffer = { offer: CheckoutPickup | null; warehouse: Warehouse | null };

/** Profili elinde olan çağıranın yolu; gel-al depoları yalnız izinli müşteride okunur, izin varsayılan olarak kapalıdır. */
export async function pickupOfferFor(
  db: Db,
  customer: Pick<UserProfile, 'pickupAllowed' | 'business'> | null,
  requested: string | null,
): Promise<PickupOffer> {
  if (!customer?.pickupAllowed) return { offer: null, warehouse: null };
  // Öteki işin deposu bu müşteriye satamaz (karar 7); seçim de yalnız bu listeden kabul edilir.
  const warehouses = await new WarehouseService(db).list({
    activeOnly: true,
    kind: 'facility',
    pickupEnabled: true,
    business: customer.business,
  });
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

