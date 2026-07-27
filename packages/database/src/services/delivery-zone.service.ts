import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DeliveryZoneSchema,
  DeliveryZoneInsertSchema,
  DeliveryZoneUpdateSchema,
  type DeliveryZone,
  type DeliveryZoneInsert,
  type DeliveryZoneUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Rota bölgesi servisi (07.2) — DOMAIN §6.
 *
 * **Karar vermez, satır getirir.** "Bu adres rota içinde mi", "hangi gün teslim edilir" kararları
 * saf motordadır (`domain-core/delivery`); servis bölgeleri getirir, kararı çağıran motora sorar.
 */
export class DeliveryZoneService extends BaseDbService<DeliveryZone, DeliveryZoneInsert, DeliveryZoneUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'delivery_zone', DeliveryZoneSchema, DeliveryZoneInsertSchema, DeliveryZoneUpdateSchema);
  }

  /** Tüm bölgeler (admin ekranı) ya da yalnız aktifler (checkout). */
  list(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZone[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }
}
