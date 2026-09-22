import { SettingsService } from '@lezzet/database';
import type { UnitCosts } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Sipariş anında maliyete yazılacak birim maliyetler (cent), ayarlardan. */
export async function readUnitCosts(db: SupabaseClient): Promise<UnitCosts> {
  const settings = new SettingsService(db);
  const [routeDeliveryCents, packagingCents, doorPackagingCents] = await Promise.all([
    settings.getNumber('route_delivery_unit_cost_cents', 250),
    settings.getNumber('packaging_unit_cost_cents', 120),
    settings.getNumber('door_packaging_unit_cost_cents', 0),
  ]);
  return { routeDeliveryCents, packagingCents, doorPackagingCents };
}
