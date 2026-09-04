import type { SupabaseClient } from '@supabase/supabase-js';
import { WarehouseService } from '../services/warehouse.service';
import { VehicleService } from '../services/storage-point.service';
import type { Warehouse } from '@lezzet/types';

/**
 * Entegrasyon testlerinin **depo kurulumu** yardımcısı (19.1).
 *
 * Depo geçişinden sonra DB'ye vuran hemen her test bir depoya ihtiyaç duyuyor: parti, rezervasyon,
 * sipariş ve mal kabul artık deposuz yazılamaz. Her dosya kendi kurulumunu tekrarlasaydı yalnız
 * gürültü olmazdı — testler birbirinin depolarını da miras alırdı ve "kaç aktif depo var"a bakan
 * bir sorgu başka bir dosyanın bıraktığı satırla bozulurdu.
 *
 * **Damgalı kod (`Date.now()`)**: üç ajan tek yerel veritabanını paylaşıyor (CLAUDE.md §4b) ve
 * `warehouse.code` benzersiz. Sabit kod yazan iki eşzamanlı koşu birbirini çakıştırırdı; damga
 * çakışmayı imkânsız kılar.
 *
 * **`shipsOnline` varsayılan `false`**: kargo deposu ülke başına TEK ve kural veritabanında (kısmi
 * unique indeks). Her test kendi kargo deposunu açsaydı ikincisi reddedilir ve testler birbirini
 * düşürürdü. Kargo yolunu sınayan test bunu açıkça ister — ve o da tek başına koşmalıdır.
 */

let counter = 0;

export interface TestWarehouseOptions {
  /** Okunur ek (`STR`, `KEHL`) — damganın önüne gelir; hata mesajlarında hangisi olduğu anlaşılsın. */
  label?: string;
  countryCode?: Warehouse['countryCode'];
  /**
   * Tesis mi araç mı (26.08). Varsayılan `facility` — bugüne kadarki her test bir tesis kuruyordu
   * ve araç İSTİSNADIR. Araç kurulumu kendi kurallarını sınayan testin işidir: araca bölge
   * bağlanamaz, araç kargo deposu olamaz, araç depo-üstü toplama girmez.
   */
  kind?: Warehouse['kind'];
  shipsOnline?: boolean;
  isActive?: boolean;
  /** Aracın evi olan tesis (02.09) — yalnız `kind: 'vehicle'` ile birlikte anlamlı. */
  homeWarehouseId?: string;
  /**
   * Deponun ARAÇ kaydı (21.249) — yalnız `kind: 'vehicle'`de anlamlı ve orada ZORUNLU
   * (`warehouse_vehicle_identity`).
   *
   * Verilmezse yardımcı damgalı bir araç AÇAR: araç deposu kuran onlarca test aracın kendisiyle
   * ilgilenmiyor, yalnız "bir araç deposu olsun" diyor. Bağı her dosyaya elle yazdırmak aynı üç
   * satırı otuz yere kopyalamak olurdu (CLAUDE §1). Açılan araç `purgeTestData({ warehouseIds })`
   * ile depoyla birlikte gider — testin ayrıca `vehicleIds` bildirmesi gerekmez.
   */
  vehicleId?: string;
}

/**
 * Tek depo açar ve kaydı döner. Kodu benzersizdir; testin sonunda `purgeTestData({ warehouseIds })`
 * ile toplanmalıdır — depo silme `restrict` FK'lerle korunuyor, yani önce partiler/siparişler gider.
 */
export async function createTestWarehouse(db: SupabaseClient, opts: TestWarehouseOptions = {}): Promise<Warehouse> {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter.toString(36)}`.toUpperCase().slice(-10);
  /* Araç deposu ARACINI söylemek zorunda (21.249). Plaka damgalı: `vehicle.plate` benzersiz ve üç
     ajan tek veritabanını paylaşıyor — sabit plaka eşzamanlı iki koşuyu çakıştırırdı (kodun aynı
     gerekçesi). */
  const vehicleId =
    opts.kind === 'vehicle'
      ? (opts.vehicleId ?? (await new VehicleService(db).insert({ plate: `T-${stamp}`, label: 'Test aracı' })).id)
      : null;
  return new WarehouseService(db).insert({
    code: `T${opts.label ?? ''}-${stamp}`,
    name: `Test deposu ${opts.label ?? stamp}`,
    countryCode: opts.countryCode ?? 'FR',
    kind: opts.kind ?? 'facility',
    homeWarehouseId: opts.homeWarehouseId ?? null,
    vehicleId,
    shipsOnline: opts.shipsOnline ?? false,
    isActive: opts.isActive ?? true,
  });
}

/**
 * İki depo — depo geçişinin çıkış ölçütü olan yarış testinin zemini: aynı varyant, biri dolu biri
 * boş; boş depodan istenen rezervasyon REDDEDİLMELİ. Tek depolu bir kurulumda bu hata hiç
 * görünmez, o yüzden iki depolu kurulum ayrı bir yardımcı olarak duruyor.
 */
export async function createTestWarehousePair(db: SupabaseClient): Promise<{ primary: Warehouse; secondary: Warehouse }> {
  const [primary, secondary] = await Promise.all([
    createTestWarehouse(db, { label: 'A' }),
    createTestWarehouse(db, { label: 'B' }),
  ]);
  return { primary, secondary };
}
