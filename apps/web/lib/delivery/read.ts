import 'server-only';
import { unstable_cache } from 'next/cache';
import { DeliveryZoneService, WarehouseService, serviceDb } from '@lezzet/database';
import { zonesOfBusiness } from '@lezzet/domain-core';
import { BusinessEnum } from '@lezzet/types';
import type { DeliveryZoneSummary } from './place-types';

/**
 * Kapıya teslim ettiğimiz yerler, vitrinin açılışta bir kez okuduğu liste: operatörün kurduğu doğal tavanlı bir kümedir, bağlama
 * konunca yer paneli beklemez. Önbellekli ve etiketlidir, yalnız aktif bölgeleri taşır; hazırlanan bölge müşteriye söz vermez.
 */
const DELIVERY_ZONES_TAG = 'delivery-zones';

/** Bir saat: liste ayda bir değişiyor, ama ekran düzenlemeyi de saatlerce bekletmemeli. */
const REVALIDATE_SECONDS = 3600;

export const getDeliveryZones = unstable_cache(
  async (): Promise<DeliveryZoneSummary[]> => {
    // Kodlar bölgenin dizi kolonunda değil kendi tablosunda (DOMAIN §17) — `listWithCodes` ikisini
    // tek turda birleştirir. Panel yalnız kodu gösterir; ülke ayrımı çözümün işi, listenin değil.
    const db = serviceDb();
    const [zones, warehouses] = await Promise.all([
      new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
      new WarehouseService(db).list(),
    ]);
    // Bölgenin işi deposundan gelir; kural tek yerde (`zonesOfBusiness`), burada her iş için bir kez uygulanır.
    return BusinessEnum.options.flatMap((business) =>
      zonesOfBusiness(zones, warehouses, business).map((zone) => ({
        name: zone.name,
        business,
        postalCodes: zone.postalCodes.map((c) => c.postalCode),
      })),
    );
  },
  ['delivery-zones'],
  { tags: [DELIVERY_ZONES_TAG], revalidate: REVALIDATE_SECONDS },
);
