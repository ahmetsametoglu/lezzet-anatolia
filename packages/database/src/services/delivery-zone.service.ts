import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DeliveryZoneSchema,
  DeliveryZoneInsertSchema,
  DeliveryZonePostalCodeInsertSchema,
  DeliveryZonePostalCodeSchema,
  DeliveryZoneUpdateSchema,
  DeliveryZoneWithCodesSchema,
  type DeliveryZone,
  type DeliveryZoneInsert,
  type DeliveryZonePostalCode,
  type DeliveryZonePostalCodeInsert,
  type DeliveryZoneUpdate,
  type DeliveryZoneWithCodes,
} from '@lezzet/types';
import { normalizePostalCode } from '@lezzet/address';
import { BaseDbService } from '../core/base.service';

/** Karar vermez, bölge satırlarını getirir; rota içi ve teslim günü kararını çağıran motora sorar. */
export class DeliveryZoneService extends BaseDbService<DeliveryZone, DeliveryZoneInsert, DeliveryZoneUpdate> {
  /** `postalCodes:delivery_zone_postal_code(...)` (bkz. `BaseDbService.embeds`). */
  protected override readonly embeds = ['postalCodes'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'delivery_zone', DeliveryZoneSchema, DeliveryZoneInsertSchema, DeliveryZoneUpdateSchema);
  }

  list(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZone[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }

  /**
   * Kodlar gömülü seçimle bölgelerle aynı turda gelir; yer çözümü her ürün ve katalog isteğinde bunu okur. Bölgeler operatörün kurduğu,
   * doğal tavanı olan bir küme olduğu için sayfalanmaz.
   */
  listWithCodes(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZoneWithCodes[]> {
    return this.getAllAs(DeliveryZoneWithCodesSchema, opts.activeOnly ? { isActive: true } : undefined, {
      select: '*, postalCodes:delivery_zone_postal_code(country, postal_code)',
      orderBy: 'name',
    });
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

/** Satırın kendi kimliği yok, anahtar `(country, postal_code, business)`; küme sil-yaz ile değiştiği için silme açık. */
export class DeliveryZonePostalCodeService extends BaseDbService<
  DeliveryZonePostalCode,
  DeliveryZonePostalCodeInsert,
  DeliveryZonePostalCodeInsert
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'delivery_zone_postal_code',
      DeliveryZonePostalCodeSchema,
      DeliveryZonePostalCodeInsertSchema,
      DeliveryZonePostalCodeInsertSchema,
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
