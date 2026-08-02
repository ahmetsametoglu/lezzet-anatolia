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
import { normalizePostalCode } from '@lezzet/helper';
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

    const rows = await new DeliveryZonePostalCodeService(this.supabase).listByZones(zones.map((z) => z.id));

    const byZone = new Map<string, Array<{ country: DeliveryZonePostalCode['country']; postalCode: string }>>();
    for (const row of rows) {
      const list = byZone.get(row.zoneId) ?? [];
      list.push({ country: row.country, postalCode: row.postalCode });
      byZone.set(row.zoneId, list);
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
    await new DeliveryZonePostalCodeService(this.supabase).replaceForZone(zoneId, codes);
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

/**
 * Bölge ↔ posta kodu junction servisi (19.5 · `STACK §6`).
 *
 * **Junction tablosu kendi alt sınıfını hak eder** ve bu bir düzen kaygısı değil: bu tablo iki
 * farklı sorunun kapısı — "bölgenin kodları neler" (yazma yolu) ve "bu kod rota içinde mi" (okuma
 * yolu). İkisi de `DeliveryZoneService` içinde ham `this.supabase` çağrısı olarak duruyordu; ham
 * sorgu şema doğrulamasını ve ad dönüşümünü çağıranın hatırlamasına bırakır (biri `dbToApp`
 * yazmayı unutunca `zone_id` diye bir alan uygulamaya sızar).
 *
 * Yazma AÇIK (`allowDelete`), çünkü küme sil-yaz ile değiştiriliyor — ama satırın kendi kimliği
 * yok: anahtar `(country, postal_code)`.
 */
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

  /** Verilen bölgelerin tüm kodları — bölge başına sorgu (N+1) yerine tek tur. */
  listByZones(zoneIds: readonly string[]): Promise<DeliveryZonePostalCode[]> {
    if (zoneIds.length === 0) return Promise.resolve([]);
    return this.getAll({ zoneId: [...zoneIds] });
  }

  /**
   * Verilen kodlardan HANGİLERİ bir bölgeye bağlı — "rota içinde mi" sorusunun toplu cevabı.
   *
   * Küme çağıranın elindeki kısa listedir (öneri satırları); kod başına ayrı sorgu N+1 olurdu ve
   * bu uç **tuş yolunda**. Ülke süzgeci YOK: aynı kod iki ülkede geçerli olabilir ve hangisinin
   * rotada olduğu `(ülke, kod)` çiftiyle ayrılır — çağıran eşleştirir.
   */
  listByCodes(codes: readonly string[]): Promise<DeliveryZonePostalCode[]> {
    if (codes.length === 0) return Promise.resolve([]);
    return this.getAll({ postalCode: [...codes] });
  }

  /**
   * Bölgenin kod kümesini KOMPLE değiştirir (sil-yaz).
   *
   * Yamalamak yerine değiştirmek bilinçli: ekran kümenin son hâlini gönderir, "hangileri eklendi
   * hangileri silindi" hesabını iki tarafın da tutması gerekirdi. Çakışan bir kod varsa (başka
   * bölge onu tutuyor) yazım DB kısıtında patlar — sessiz "ilki kazanır" davranışı yok.
   */
  async replaceForZone(zoneId: string, codes: ReadonlyArray<{ country: DeliveryZonePostalCode['country']; postalCode: string }>): Promise<void> {
    await this.deleteWhere({ zoneId });
    if (codes.length === 0) return;
    await this.bulkInsert(
      codes.map((c) => ({
        zoneId,
        country: c.country,
        // Normalize: DB'de de CHECK var, ama hatayı kullanıcıya göstermek yerine burada düzeltiyoruz —
        // "67 000" yazan operatör hata değil, boşluk yazmış bir insandır.
        postalCode: normalizePostalCode(c.postalCode),
      })),
    );
  }
}

// Posta kodu normalizasyonu `@lezzet/helper`'da (denetim A2) — saklama biçimi ile karşılaştırma
// biçimi aynı olmak ZORUNDA, o yüzden iki katman aynı fonksiyonu okur.
