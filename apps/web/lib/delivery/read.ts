import 'server-only';
import { unstable_cache } from 'next/cache';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
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
    const zones = await new DeliveryZoneService(serviceDb()).listWithCodes({ activeOnly: true });
    return zones.map((zone) => ({ name: zone.name, postalCodes: zone.postalCodes.map((c) => c.postalCode) }));
  },
  ['delivery-zones'],
  { tags: [DELIVERY_ZONES_TAG], revalidate: REVALIDATE_SECONDS },
);
