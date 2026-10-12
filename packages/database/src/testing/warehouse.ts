import type { SupabaseClient } from '@supabase/supabase-js';
import { WarehouseService } from '../services/warehouse.service';
import { VehicleService } from '../services/storage-point.service';
import type { Country, Warehouse, WarehouseShipCountryEntry } from '@lezzet/types';

/**
 * Entegrasyon testlerinin depo kurulumu; kod damgalıdır (`Date.now()`), çünkü yerel veritabanı eşzamanlı koşularca paylaşılır ve
 * `warehouse.code` benzersizdir. Gönderim ülkesi varsayılan olarak yoktur, çünkü bir ülkeye tek aktif depo kargo yapar; ülkeyi aktif
 * test deposuna `claimShipCountry` verir.
 */

let counter = 0;

export interface TestWarehouseOptions {
  /** Okunur ek (`STR`, `KEHL`) — damganın önüne gelir; hata mesajlarında hangisi olduğu anlaşılsın. */
  label?: string;
  countryCode?: Warehouse['countryCode'];
  /** Tesis mi araç mı; varsayılan `facility`, araç kurulumu kendi kurallarını sınayan testin işidir. */
  kind?: Warehouse['kind'];
  /** Deponun kargo yaptığı ülkeler; yalnız pasif depoda güvenlidir, aktif depoya ülkeyi `claimShipCountry` verir. */
  shipsTo?: readonly Country[];
  /** Gel-al noktası — checkout'un gel-al testi bu tesisi ister; varsayılan kapalı (üretim varsayılanıyla aynı). */
  pickupEnabled?: boolean;
  isActive?: boolean;
  /** Aracın evi olan tesis — yalnız `kind: 'vehicle'` ile birlikte anlamlı. */
  homeWarehouseId?: string;
  /**
   * Deponun araç kaydı; yalnız `kind: 'vehicle'`de anlamlı ve orada zorunlu (`warehouse_vehicle_identity`). Verilmezse yardımcı
   * damgalı bir araç açar ve `purgeTestData({ warehouseIds })` onu depoyla birlikte toplar.
   */
  vehicleId?: string;
}

/**
 * Tek depo açar ve kaydı döner. Kodu benzersizdir; testin sonunda `purgeTestData({ warehouseIds })` ile toplanmalıdır — depo silme
 * `restrict` FK'lerle korunuyor, yani önce partiler/siparişler gider.
 */
export async function createTestWarehouse(db: SupabaseClient, opts: TestWarehouseOptions = {}): Promise<Warehouse> {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter.toString(36)}`.toUpperCase().slice(-10);
  // Plaka damgalı, çünkü `vehicle.plate` benzersiz ve sabit plaka eşzamanlı iki koşuyu çakıştırırdı.
  const vehicleId =
    opts.kind === 'vehicle'
      ? (opts.vehicleId ?? (await new VehicleService(db).insert({ plate: `T-${stamp}`, label: 'Test aracı' })).id)
      : null;
  const warehouses = new WarehouseService(db);
  const warehouse = await warehouses.insert({
    code: `T${opts.label ?? ''}-${stamp}`,
    name: `Test deposu ${opts.label ?? stamp}`,
    countryCode: opts.countryCode ?? 'FR',
    kind: opts.kind ?? 'facility',
    homeWarehouseId: opts.homeWarehouseId ?? null,
    vehicleId,
    pickupEnabled: opts.pickupEnabled ?? false,
    isActive: opts.isActive ?? true,
  });
  if (opts.shipsTo?.length) {
    await warehouses.setShipCountries(
      warehouse.id,
      opts.shipsTo.map((country) => ({ country, handover: null })),
    );
  }
  return warehouse;
}

/**
 * İki depo: aynı varyant biri dolu biri boş; boş depodan istenen rezervasyon reddedilmeli ve bu hata tek depolu kurulumda hiç
 * görünmez.
 */
export async function createTestWarehousePair(db: SupabaseClient): Promise<{ primary: Warehouse; secondary: Warehouse }> {
  const [primary, secondary] = await Promise.all([
    createTestWarehouse(db, { label: 'A' }),
    createTestWarehouse(db, { label: 'B' }),
  ]);
  return { primary, secondary };
}

/** Ülkenin geçici sahipliği; `restore` ülkeyi asıl sahibine teslim noktasıyla geri verir, ikinci çağrı bir şey yapmaz. */
export interface ShipCountryClaim {
  restore(): Promise<void>;
}

/**
 * Ülkeyi aktif test deposuna verir: bir ülkeye tek aktif depo kargo yapar ve besleme ülkeleri tutar, bu yüzden tutan deponun satırı
 * teslim noktasıyla birlikte okunur, geçici kaldırılır ve `restore` onu geri koyar. Ülke başka bir test deposuna taşındıysa o depo
 * `restore`dan önce silinmelidir.
 */
export async function claimShipCountry(db: SupabaseClient, warehouseId: string, country: Country): Promise<ShipCountryClaim> {
  const warehouses = new WarehouseService(db);
  const without = (rows: readonly WarehouseShipCountryEntry[]) => rows.filter((row) => row.country !== country);
  const read = async (id: string) => (await warehouses.list({ warehouseIds: [id] }))[0] ?? null;
  const holder = (await warehouses.list({ activeOnly: true })).find((w) => w.id !== warehouseId && w.shipsTo.includes(country)) ?? null;
  const held = holder?.shipCountries.find((row) => row.country === country) ?? null;
  const giveBack = async () => {
    const current = holder && held ? await read(holder.id) : null;
    if (current && held) await warehouses.setShipCountries(current.id, [...without(current.shipCountries), held]);
  };
  const release = async () => {
    const own = await read(warehouseId);
    if (own?.shipsTo.includes(country)) await warehouses.setShipCountries(warehouseId, without(own.shipCountries));
  };

  if (holder) await warehouses.setShipCountries(holder.id, without(holder.shipCountries));
  try {
    const own = await read(warehouseId);
    await warehouses.setShipCountries(warehouseId, [...(own?.shipCountries ?? []), { country, handover: null }]);
  } catch (err) {
    await giveBack();
    throw err;
  }

  let restored = false;
  return {
    async restore() {
      if (restored) return;
      restored = true;
      await release();
      await giveBack();
    },
  };
}
