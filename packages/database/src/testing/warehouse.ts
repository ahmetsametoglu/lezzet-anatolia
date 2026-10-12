import type { SupabaseClient } from '@supabase/supabase-js';
import { WarehouseService } from '../services/warehouse.service';
import { VehicleService } from '../services/storage-point.service';
import type { Country, Warehouse } from '@lezzet/types';

/**
 * Entegrasyon testlerinin depo kurulumu; kod damgalıdır (`Date.now()`), çünkü yerel veritabanı eşzamanlı koşularca paylaşılır ve
 * `warehouse.code` benzersizdir. Gönderim ülkesi varsayılan olarak yoktur, çünkü bir ülkeye tek aktif depo kargo yapar ve her test kendi
 * kargo deposunu açsaydı ikincisi reddedilirdi.
 */

let counter = 0;

export interface TestWarehouseOptions {
  /** Okunur ek (`STR`, `KEHL`) — damganın önüne gelir; hata mesajlarında hangisi olduğu anlaşılsın. */
  label?: string;
  countryCode?: Warehouse['countryCode'];
  /** Tesis mi araç mı; varsayılan `facility`, araç kurulumu kendi kurallarını sınayan testin işidir. */
  kind?: Warehouse['kind'];
  /** Deponun kargo yaptığı ülkeler (`warehouse_ship_country`); bulunduğu ülkeden bağımsızdır. */
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
  if (opts.shipsTo?.length) await warehouses.setShipsTo(warehouse.id, opts.shipsTo);
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
