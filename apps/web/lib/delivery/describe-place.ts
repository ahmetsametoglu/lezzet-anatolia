import 'server-only';
import type { DeliveryZoneService } from '@lezzet/database';
import { findZoneForPostalCode, zonesOfBusiness, type WarehouseCandidate } from '@lezzet/domain-core';
import type { Business, Country } from '@lezzet/types';
import { resolveDelivery } from '@/lib/order/delivery';
import type { DeliveryPlace } from './place-types';

/**
 * Çözülmüş yerin ekran hâli: kimlik (kod, ülke, yerleşimler) `DeliveryPlace`e çevrilir; talep sayımı eylemde kalır, burada yalnız
 * tarif var. Müşterinin niyeti (eylem) ve sunucunun ilk karesi aynı yolu kullanır, hap ile panel ayrışmasın.
 */
type ZonesWithCodes = Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>;

export async function describePlace(
  postalCode: string,
  identity: { country: Country; placeName: string | null; places: readonly string[] },
  zones: ZonesWithCodes,
  /** Bölgenin işi deposundan okunur. */
  warehouses: readonly Pick<WarehouseCandidate, 'id' | 'business'>[],
  /** Kodun referans satırları; nokta buradan, ülkeye göre okunur, çünkü 610 kod iki ülkede geçerli ve noktaları aynı yer değil. */
  matches: readonly { country: Country; lat: number | null; lng: number | null }[],
  /** Müşterinin işi; teslimat ve bölge adı yalnız o işin bölgesinden okunur. */
  business: Business,
): Promise<DeliveryPlace> {
  const row = matches.find((m) => m.country === identity.country);
  const point = row?.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
  // Checkout'un teslimat çözümüyle aynı kapı: "rota içi mi, hangi gün" kuralı iki yerde yaşamaz.
  const delivery = await resolveDelivery({ postalCode, country: identity.country, business });

  // Bölge adı yalnız rota içinde bilinir. Motor aday tipini döndürür (ad taşımaz — karar için
  // gereksiz); adı kendi listemizden okuruz.
  const matched = findZoneForPostalCode({ country: identity.country, postalCode }, zonesOfBusiness(zones, warehouses, business));
  const zone = matched ? zones.find((z) => z.id === matched.id) : undefined;
  const inRoute = delivery.deliveryType === 'route';

  return {
    postalCode,
    country: identity.country,
    // Rota dışında da dolu ("75011 Paris · kargo"); çok yerleşimli kodda `null` kalır ve ekran `places`'ten kendi etiketini kurar.
    placeName: identity.placeName,
    places: [...identity.places],
    zoneName: inRoute ? (zone?.name ?? null) : null,
    inRoute,
    nextDate: delivery.availableDates[0] ?? null,
    point,
  };
}
