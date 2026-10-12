import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WarehouseSchema,
  WarehouseInsertSchema,
  WarehouseShipCountryEntrySchema,
  WarehouseShipCountryInsertSchema,
  WarehouseShipCountrySchema,
  WarehouseUpdateSchema,
  WarehouseWithShipCountriesSchema,
  type Business,
  type Country,
  type Warehouse,
  type WarehouseAddress,
  type WarehouseInsert,
  type WarehouseShipCountry,
  type WarehouseShipCountryEntry,
  type WarehouseShipCountryInsert,
  type WarehouseUpdate,
  type WarehouseWithShipCountries,
  type WarehouseWithShipping,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Depo servisi (DOMAIN §17): karar vermez, satır getirir; posta kodundan ve personelden depo kararı saf motordadır
 * (`domain-core/warehouse`). Varsayılan depo yoktur, depo daima adresin posta kodundan ya da personelin deposundan gelir.
 */
export class WarehouseService extends BaseDbService<Warehouse, WarehouseInsert, WarehouseUpdate> {
  /** `shipCountries:warehouse_ship_country(...)` (bkz. `BaseDbService.embeds`). */
  protected override readonly embeds = ['shipCountries'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'warehouse', WarehouseSchema, WarehouseInsertSchema, WarehouseUpdateSchema);
  }

  /**
   * Tüm depolar ya da yalnız aktifler, operatörün sırasıyla ve gönderim ülkeleriyle; `warehouseIds` personelin kapsamıdır (boş dizi
   * hiçbiri) ve dizi olarak girer, çünkü `database` motorun `WarehouseScope` tipini bilmez. `kind` süzgeci pratikte `'facility'`dir.
   */
  async list(
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
  ): Promise<WarehouseWithShipping[]> {
    if (opts.warehouseIds?.length === 0) return [];
    const filters: Record<string, unknown> = {};
    if (opts.activeOnly) filters.isActive = true;
    if (opts.kind) filters.kind = opts.kind;
    if (opts.pickupEnabled !== undefined) filters.pickupEnabled = opts.pickupEnabled;
    if (opts.business) filters.business = opts.business;
    if (opts.homeWarehouseId) filters.homeWarehouseId = opts.homeWarehouseId;
    if (opts.vehicleId) filters.vehicleId = opts.vehicleId;
    if (opts.warehouseIds) filters.id = [...opts.warehouseIds];
    const rows = await this.getAllAs(WarehouseWithShipCountriesSchema, Object.keys(filters).length > 0 ? filters : undefined, {
      select: '*, shipCountries:warehouse_ship_country(country, handover)',
      orderBy: 'sort_order',
    });
    return rows.map(withShipping);
  }

  /** Belge önekinin ve ekranın okuduğu kısa kod ('STR'). */
  getByCode(code: string): Promise<Warehouse | null> {
    return this.getOneBy({ code });
  }

  /** Kargo yapılan ülkeler; bilgi metinlerinin "nereye gönderiyoruz" cümlesi veriden kurulsun diye yalnız aktif depolardan. */
  async listShippingCountries(): Promise<Country[]> {
    const rows = await this.list({ activeOnly: true });
    return [...new Set(rows.flatMap((w) => w.shipsTo))].sort();
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
   * Deponun gönderim ülkelerini teslim noktalarıyla verilen kümeye eşitler. Adresler yazımdan önce doğrulanır; sonra eklenir, kalanın
   * noktası yazılır, en son silinir, çünkü ülke çakışmasında reddedilen ekleme deponun eski kümesine dokunmamalı.
   */
  async setShipCountries(warehouseId: string, entries: readonly WarehouseShipCountryEntry[]): Promise<void> {
    const valid = entries.map((entry) => WarehouseShipCountryEntrySchema.parse(entry));
    const rows = new WarehouseShipCountryService(this.supabase);
    const current = new Map((await rows.listForWarehouse(warehouseId)).map((row) => [row.country, row.handover]));
    const next = new Map(valid.map((entry) => [entry.country, entry]));
    await rows.add(warehouseId, [...next.values()].filter((entry) => !current.has(entry.country)));
    for (const entry of next.values()) {
      const handover = current.get(entry.country);
      if (handover !== undefined && !sameAddress(handover, entry.handover)) await rows.setHandover(warehouseId, entry);
    }
    await rows.remove(warehouseId, [...current.keys()].filter((country) => !next.has(country)));
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

/** Ülke listesi ve `shipsOnline` gömülü satırlardan yalnız burada türer ki iki doğruluk ayrışmasın. */
function withShipping(warehouse: WarehouseWithShipCountries): WarehouseWithShipping {
  const shipCountries = [...warehouse.shipCountries].sort((a, b) => a.country.localeCompare(b.country));
  const shipsTo = shipCountries.map((row) => row.country);
  return { ...warehouse, shipCountries, shipsTo, shipsOnline: shipsTo.length > 0 };
}

function sameAddress(a: WarehouseAddress | null, b: WarehouseAddress | null): boolean {
  if (a === null || b === null) return a === b;
  return a.line1 === b.line1 && a.postalCode === b.postalCode && a.city === b.city;
}

/**
 * Deponun gönderim ülkesi satırları (`warehouse_ship_country`); anahtar `(depo, ülke)`. Ülke başına tek aktif depo ve yalnız Lezzet
 * tesisi kuralları veritabanındadır; satırın aktiflik kopyasını tetikleyici yazar.
 */
class WarehouseShipCountryService extends BaseDbService<
  WarehouseShipCountry,
  WarehouseShipCountryInsert,
  WarehouseShipCountryInsert
> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'warehouse_ship_country',
      WarehouseShipCountrySchema,
      WarehouseShipCountryInsertSchema,
      WarehouseShipCountryInsertSchema,
    );
  }

  listForWarehouse(warehouseId: string): Promise<WarehouseShipCountry[]> {
    return this.getAll({ warehouseId }, { orderBy: 'country' });
  }

  /** Tek ifadeyle yazılır ki ülke çakışmasında hiçbir satır yazılmasın. */
  async add(warehouseId: string, entries: readonly WarehouseShipCountryEntry[]): Promise<void> {
    await this.bulkInsert(entries.map((entry) => ({ warehouseId, ...entry })));
  }

  async setHandover(warehouseId: string, entry: WarehouseShipCountryEntry): Promise<void> {
    await this.upsert({ warehouseId, ...entry }, 'warehouse_id,country');
  }

  async remove(warehouseId: string, countries: readonly Country[]): Promise<void> {
    for (const country of countries) await this.deleteWhere({ warehouseId, country });
  }
}
