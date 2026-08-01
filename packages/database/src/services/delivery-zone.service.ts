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
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

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

  /**
   * Bölgeler + posta kodları — motorun yer çözümü için ihtiyaç duyduğu tam küme.
   *
   * Kodlar artık bölgenin dizi kolonunda değil kendi tablosunda (tekillik veride, DOMAIN §17).
   * İki turda okunur ve bellekte birleşir; bölge başına sorgu (N+1) yok. Küme SINIRSIZ BÜYÜMEZ —
   * bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme (CLAUDE.md §1), o yüzden tek turda
   * çekilir ve sayfalanmaz.
   */
  async listWithCodes(opts: { activeOnly?: boolean } = {}): Promise<DeliveryZoneWithCodes[]> {
    const zones = await this.list(opts);
    if (zones.length === 0) return [];

    const { data, error } = await this.supabase
      .from('delivery_zone_postal_code')
      .select('*')
      .in('zone_id', zones.map((z) => z.id));
    if (error) throw error;

    const byZone = new Map<string, Array<{ country: DeliveryZonePostalCode['country']; postalCode: string }>>();
    for (const row of data ?? []) {
      const parsed = DeliveryZonePostalCodeSchema.parse(dbToApp(row));
      const list = byZone.get(parsed.zoneId) ?? [];
      list.push({ country: parsed.country, postalCode: parsed.postalCode });
      byZone.set(parsed.zoneId, list);
    }
    return zones.map((zone) => ({ ...zone, postalCodes: byZone.get(zone.id) ?? [] }));
  }

  /**
   * Bölgenin posta kodu kümesini KOMPLE değiştirir (sil-yaz).
   *
   * Yamalamak yerine değiştirmek bilinçli: ekran kümenin son hâlini gönderir, "hangileri eklendi
   * hangileri silindi" hesabını iki tarafın da tutması gerekirdi. Çakışan bir kod varsa (başka
   * bölge onu tutuyor) yazım DB kısıtında patlar — sessiz "ilki kazanır" davranışı artık yok.
   */
  async replacePostalCodes(zoneId: string, codes: Array<{ country: DeliveryZonePostalCode['country']; postalCode: string }>): Promise<void> {
    const { error: deleteError } = await this.supabase.from('delivery_zone_postal_code').delete().eq('zone_id', zoneId);
    if (deleteError) throw deleteError;
    if (codes.length === 0) return;

    const { error } = await this.supabase.from('delivery_zone_postal_code').insert(
      codes.map((c) => ({
        zone_id: zoneId,
        country: c.country,
        // Normalize: DB'de de CHECK var, ama hatayı kullanıcıya göstermek yerine burada düzeltiyoruz —
        // "67 000" yazan operatör hata değil, boşluk yazmış bir insandır.
        postal_code: c.postalCode.replace(/\s/g, '').toUpperCase(),
      })),
    );
    if (error) throw error;
  }

  /**
   * "Nereye getirelim" sorulan posta kodunu TALEP olarak sayar (0029).
   *
   * Toplu sayaçtır: kim sorduğu tutulmaz, tekilleştirme yapılmaz (tekilleştirmek kimlik saklamak
   * demekti). Bölge içi kodlar da sayılır — talebin nerede yoğunlaştığı rota sıklığının girdisidir.
   *
   * Artırma RPC'de çünkü okuyup-yazan iki adım aynı anda gelen iki istekte birini kaybeder.
   */
  async recordDemand(postalCode: string): Promise<void> {
    await this.executeRpc('record_postal_code_demand', { p_postal_code: postalCode });
  }
}
