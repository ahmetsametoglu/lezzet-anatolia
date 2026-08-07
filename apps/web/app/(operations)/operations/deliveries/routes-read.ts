import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map';
import type { PostalCodePick } from './routes-types';

/**
 * Rota kurulumunun okuması (19.20 · 09.15) — `design/project/Depolar - Bolge Haritasi.html`.
 *
 * **Rota = bölge.** Kullanıcının tanımı (07.08): *"bir bölge tanımlamak = bir dağıtım güzergâhı
 * tanımlamak; günü gelince o rotayı dağıtıma çıkarıyoruz."* Veri modeli adı `delivery_zone` kalıyor;
 * arayüz dili tek kelimeye oturdu — bölgenin haftalık günleri taşıması zaten onu bir güzergâh yapar.
 *
 * **Depo süzgeci YOK ve olmamalı:** operatör "hangi depodan" diye değil "nereye" diye düşünüyor;
 * rotalar depoya göre GRUPLANIR ama liste bütündür. Süzgeç koymak, iki deposu olan bir kurulumda
 * komşu iki güzergâhı birbirinden gizlerdi — oysa çakışan posta kodu tam orada doğar.
 */

export interface RouteView {
  id: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  /** ISO haftalık günler (1=Pazartesi). Boşsa bu rotaya teslimat planlanmaz. */
  weekdays: number[];
  isActive: boolean;
  postalCodes: PostalCodePick[];
}

export interface RoutesData {
  routes: RouteView[];
  warehouses: { id: string; name: string; code: string; countryCode: string }[];
  /**
   * TANIMLI kodların koordinatları. "Boşta" kodlar burada YOK — onları çizebilmek için haritanın
   * kendi okuması gerekiyor (görünen alandaki tüm kodlar) ve o kapı henüz açılmadı. Bugün haritadan
   * çıkarılır, eklenmez. BEKLEYEN(19.20)
   */
  points: ZoneMapPoint[];
}

export async function readRoutes(): Promise<RoutesData> {
  const db = serviceDb();

  // Pasif rota da GELİR: kodlarını tutmaya devam ediyor (kural veritabanında) ve haritada görünmezse
  // operatör "boşta" sanıp eklemeye çalışır, kayıt reddedilir ve sebebi görünmez olur.
  const [zones, warehouses] = await Promise.all([
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list(),
  ]);

  const warehouseName = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
  const allCodes = zones.flatMap((zone) => zone.postalCodes);

  const places = allCodes.length > 0
    ? await new PostalCodePlaceService(db).listByPostalCodes([...new Set(allCodes.map((code) => code.postalCode))])
    : [];
  // Ülke süzgeci BURADA: `67000` hem Fransa'da hem Almanya'da geçerli, okuma yalnız kodla yapılıyor.
  const wanted = new Set(allCodes.map((code) => `${code.country}:${code.postalCode}`));

  return {
    routes: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      warehouseId: zone.warehouseId,
      warehouseName: warehouseName.get(zone.warehouseId) ?? '—',
      weekdays: zone.weekdays,
      isActive: zone.isActive,
      postalCodes: zone.postalCodes,
    })),
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      countryCode: warehouse.countryCode,
    })),
    // Koordinatı olmayan kod ATLANIR: haritada `(0, 0)`a düşen nokta Gine Körfezi'nde durur ve
    // operatöre "bu kod orada" der (19.18'in kendi kuralı).
    points: places
      .filter((place) => wanted.has(`${place.country}:${place.postalCode}`) && place.lat !== null && place.lng !== null)
      .map((place) => ({ country: place.country, postalCode: place.postalCode, lat: place.lat!, lng: place.lng! })),
  };
}
