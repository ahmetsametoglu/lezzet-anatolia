import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DeliveryZoneSchema,
  DeliveryZoneInsertSchema,
  DeliveryZonePostalCodeSchema,
  DeliveryZoneUpdateSchema,
  type DeliveryZone,
  type DeliveryZoneInsert,
  type DeliveryZonePostalCode,
  type DeliveryZoneUpdate,
  type DeliveryZoneWithCodes,
} from '@lezzet/types';
import { normalizePostalCode } from '@lezzet/address';
import { BaseDbService } from '../core/base.service';

/** Karar vermez, bölge satırlarını getirir; rota içi ve teslim günü kararını çağıran motora sorar. */
export class DeliveryZoneService extends BaseDbService<DeliveryZone, DeliveryZoneInsert, DeliveryZoneUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'delivery_zone', DeliveryZoneSchema, DeliveryZoneInsertSchema, DeliveryZoneUpdateSchema);
  }

  list(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZone[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }

  /**
   * Kodlar kendi tablosunda; iki turda okunup bellekte birleşir. Bölgeler operatörün kurduğu, doğal tavanı olan bir küme olduğu
   * için sayfalanmaz.
   */
  async listWithCodes(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZoneWithCodes[]> {
    const zones = await this.list(opts);
    if (zones.length === 0) return [];

    const rows = await new DeliveryZonePostalCodeService(this.supabase).listByZones(zones.map((z) => z.id));

    const byZone = new Map<string, Array<{ country: DeliveryZonePostalCode['country']; postalCode: string }>>();
    for (const row of rows) {
      const list = byZone.get(row.zoneId) ?? [];
      list.push({ country: row.country, postalCode: row.postalCode });
      byZone.set(row.zoneId, list);
    }
    return zones.map((zone) => ({ ...zone, postalCodes: byZone.get(zone.id) ?? [] }));
  }

  async replacePostalCodes(zoneId: string, codes: Array<{ country: DeliveryZonePostalCode['country']; postalCode: string }>): Promise<void> {
    await new DeliveryZonePostalCodeService(this.supabase).replaceForZone(zoneId, codes);
  }

  /**
   * Kimliksiz toplu sayaç; bölge içi kodlar da sayılır, çünkü talebin yoğunluğu rota sıklığının girdisi. Artırma RPC'de, çünkü
   * oku-yaz iki eşzamanlı istekten birini kaybederdi.
   */
  async recordDemand(postalCode: string): Promise<void> {
    await this.executeRpc('record_postal_code_demand', { p_postal_code: postalCode });
  }
}

/** Satırın kendi kimliği yok, anahtar `(country, postal_code)`; küme sil-yaz ile değiştiği için silme açık. */
export class DeliveryZonePostalCodeService extends BaseDbService<DeliveryZonePostalCode, DeliveryZonePostalCode, DeliveryZonePostalCode> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'delivery_zone_postal_code',
      DeliveryZonePostalCodeSchema,
      DeliveryZonePostalCodeSchema,
      DeliveryZonePostalCodeSchema,
    );
  }

  /** Bölge başına sorgu yerine tek tur. */
  listByZones(zoneIds: readonly string[]): Promise<DeliveryZonePostalCode[]> {
    if (zoneIds.length === 0) return Promise.resolve([]);
    return this.getAll({ zoneId: [...zoneIds] });
  }

  /**
   * Tuş yolunda olduğu için tek tur. Ülke süzgeci yok: aynı kod iki ülkede geçerli olabilir, `(ülke, kod)` eşleşmesini çağıran
   * yapar.
   */
  listByCodes(codes: readonly string[]): Promise<DeliveryZonePostalCode[]> {
    if (codes.length === 0) return Promise.resolve([]);
    return this.getAll({ postalCode: [...codes] });
  }

  /** Ekran kümenin son hâlini gönderdiği için sil-yaz; başka bölgenin tuttuğu kod veritabanı kısıtında reddedilir. */
  async replaceForZone(zoneId: string, codes: ReadonlyArray<{ country: DeliveryZonePostalCode['country']; postalCode: string }>): Promise<void> {
    await this.deleteWhere({ zoneId });
    if (codes.length === 0) return;
    await this.bulkInsert(
      codes.map((c) => ({
        zoneId,
        country: c.country,
        // Veritabanı da biçimi zorluyor; boşluklu yazan operatöre hata göstermek yerine burada düzeltilir.
        postalCode: normalizePostalCode(c.postalCode),
      })),
    );
  }
}
