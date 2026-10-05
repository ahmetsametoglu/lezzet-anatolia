import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehouseSchema,
  WarehouseInsertSchema,
  WarehouseUpdateSchema,
  type Business,
  type Warehouse,
  type WarehouseInsert,
  type WarehouseUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Depo servisi (DOMAIN §17): karar vermez, satır getirir; posta kodundan ve personelden depo kararı saf motordadır
 * (`domain-core/warehouse`). Varsayılan depo yoktur, depo daima adresin posta kodundan ya da personelin deposundan gelir.
 */
export class WarehouseService extends BaseDbService<Warehouse, WarehouseInsert, WarehouseUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'warehouse', WarehouseSchema, WarehouseInsertSchema, WarehouseUpdateSchema);
  }

  /**
   * Tüm depolar ya da yalnız aktifler, operatörün sırasıyla; `warehouseIds` personelin kapsamıdır (boş dizi hiçbiri) ve dizi olarak
   * girer, çünkü `database` motorun `WarehouseScope` tipini bilmez. `kind` süzgeci pratikte `'facility'`dir: araç bir yazma hedefi olamaz.
   */
  list(
    opts: {
      activeOnly?: boolean;
      warehouseIds?: readonly string[];
      kind?: Warehouse['kind'];
      /** Evi bu tesis olan araçlar; panelin ve depo kartının sorgusu. */
      homeWarehouseId?: string;
      /** Bu aracın deposu; bağ 1:1 olduğu için sonuç tek satır ya da boştur. */
      vehicleId?: string;
      /** Gel-al noktaları — checkout'un müşteriye sunduğu küme. */
      pickupEnabled?: boolean;
      /** Bu işin depoları; gel-al teklifi müşterinin işinden okunur. */
      business?: Business;
    } = {},
  ): Promise<Warehouse[]> {
    if (opts.warehouseIds?.length === 0) return Promise.resolve([]);
    const filters: Record<string, unknown> = {};
    if (opts.activeOnly) filters.isActive = true;
    if (opts.kind) filters.kind = opts.kind;
    if (opts.pickupEnabled !== undefined) filters.pickupEnabled = opts.pickupEnabled;
    if (opts.business) filters.business = opts.business;
    if (opts.homeWarehouseId) filters.homeWarehouseId = opts.homeWarehouseId;
    if (opts.vehicleId) filters.vehicleId = opts.vehicleId;
    if (opts.warehouseIds) filters.id = [...opts.warehouseIds];
    return this.getAll(Object.keys(filters).length > 0 ? filters : undefined, { orderBy: 'sort_order' });
  }

  /** Belge önekinin ve ekranın okuduğu kısa kod ('STR'). */
  getByCode(code: string): Promise<Warehouse | null> {
    return this.getOneBy({ code });
  }

  /**
   * Kargo çıkış deposu; ülke başına en fazla bir aktif tane olduğu için (kısmi unique indeks) tek satır okunur. `null` gerçek bir
   * arızadır: kargo deposu yoksa bölge dışına satış yapılamaz ve çağıran bunu açıkça söylemeli.
   */
  getShippingWarehouse(country: Warehouse['countryCode']): Promise<Warehouse | null> {
    return this.getOneBy({ countryCode: country, shipsOnline: true, isActive: true });
  }

  /**
   * Kargo çıkışı olan ülkeler; bilgi metinlerinin "nereye gönderiyoruz" cümlesi veriden kurulsun diye. `listActiveCountries`ten farkı
   * araç bölgesini saymamasıdır: küme yalnız kargonun gidebildiği yerlerdir.
   */
  async listShippingCountries(): Promise<Warehouse['countryCode'][]> {
    const rows = await this.getAll({ isActive: true, shipsOnline: true });
    return [...new Set(rows.map((w) => w.countryCode))].sort();
  }

  /**
   * Aktif depoların ülke kümesi — ülke seçicisinin görünüp görünmeyeceği BURADAN türer (C11):
   * küme 1'i aşmadıkça seçici gösterilmez. Ayar değil veri; yeni ülke depo açılınca kendiliğinden
   * belirir, kimsenin bir bayrağı açması gerekmez.
   */
  async listActiveCountries(): Promise<Warehouse['countryCode'][]> {
    const rows = await this.getAll({ isActive: true });
    return [...new Set(rows.map((w) => w.countryCode))];
  }

  /**
   * Sürükle-bırak sıralamasının tek turu (`reorderBy`); bütün depo seçicileri bu sırayı okur ve satır satır yazım aradaki bir okumaya
   * yarı sıralı liste gösterirdi.
   */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }

  /** Kullanılmaya başlamış depolar; işleri değişmez ve kural veritabanındadır (`warehouse_in_use`). */
  async inUseIds(): Promise<Set<string>> {
    return new Set(await this.executeRpc<string[]>('warehouses_in_use', {}));
  }
}
