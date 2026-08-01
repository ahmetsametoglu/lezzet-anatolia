import 'server-only';
import { unstable_cache } from 'next/cache';
import { DeliveryZoneService, serviceDb } from '@lezzet/database';
import type { DeliveryZoneSummary } from './place-types';

/**
 * Kapıya teslim ettiğimiz yerler — vitrinin **açılışta bir kez** okuduğu liste.
 *
 * Önceden panel açıldığında istemciden bir action ile çekiliyordu: müşteri "posta kodumu
 * değiştireyim" deyip paneli açıyor, liste birkaç yüz milisaniye sonra alttan beliriyordu. Oysa
 * bu liste **operatörün elle kurduğu, doğal tavanı olan bir küme** (CLAUDE.md §1) — sayfa
 * açılırken sunucuda okunup bağlama konursa panelin hiç beklemesi gerekmez.
 *
 * **Önbellekli ve etiketli.** Bölgeler ayda bir değişir; her sayfa render'ında sorgulamak
 * anlamsız. Etiket bilerek var: bölge düzenleme ekranı geldiğinde (modül 09) kaydeden action
 * `revalidateTag(DELIVERY_ZONES_TAG)` çağıracak ve liste süre dolmasını beklemeden tazelenecek —
 * beklemek operatöre "kaydettim ama görünmüyor" dedirtirdi. Etiket o gün DIŞARI AÇILIR; bugün
 * tüketeni olmadığı için dosyanın içinde durur (ölü export yok — `knip`).
 *
 * Yalnız AKTİF bölgeler: hazırlanan bölge müşteriye söz vermez.
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
