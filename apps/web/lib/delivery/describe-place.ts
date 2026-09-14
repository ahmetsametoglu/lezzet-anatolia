import 'server-only';
import type { DeliveryZoneService } from '@lezzet/database';
import { findZoneForPostalCode } from '@lezzet/domain-core';
import type { Country } from '@lezzet/types';
import { resolveDelivery } from '@/lib/order/delivery';
import type { DeliveryPlace } from './place-types';

/**
 * Çözülmüş yerin EKRAN hâli — kimlik (kod · ülke · yerleşimler) → `DeliveryPlace`.
 *
 * `resolvePlaceAction`ın içinde yaşıyordu (`finishResolved`) ve orada iki şey birbirine bağlıydı:
 * yeri TARİF etmek ile talebi SAYMAK (`recordDemand`, `place_resolved` olayı). Layout'un ilk kareyi
 * sunucudan verebilmesi için tarifin sayımdan ayrılması gerekiyordu — 19.7'nin (b) notu tam bunu
 * söylüyordu: *"layout doğrudan `resolvePlaceAction` çağıramaz — içindeki `recordDemand` her sayfa
 * açılışında bölge dışı talep sayacına yazardı."* Sayaç eylemin içinde kaldı; burada yalnız tarif var.
 *
 * İki çağıran, tek yol: müşterinin niyeti (eylem) ve sunucunun ilk karesi (`readPlaceSnapshot`).
 * Aynı yer iki yerde iki türlü tarif edilseydi hap ile panel bir gün ayrışırdı.
 */
type ZonesWithCodes = Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>;

export async function describePlace(
  postalCode: string,
  identity: { country: Country; placeName: string | null; places: readonly string[] },
  zones: ZonesWithCodes,
  /**
   * Kodun referans satırları — nokta buradan okunur (08.41). Ülkeye göre seçiliyor: 610 kod iki
   * ülkede birden geçerli ve iki ülkenin noktası aynı yer değil.
   */
  matches: readonly { country: Country; lat: number | null; lng: number | null }[],
): Promise<DeliveryPlace> {
  const row = matches.find((m) => m.country === identity.country);
  const point = row?.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
  // Checkout'un teslimat çözümüyle AYNI kapı (07.2): "rota içi mi, hangi gün" kuralı iki yerde yaşamaz.
  const delivery = await resolveDelivery({ postalCode, country: identity.country });

  // Bölge adı yalnız rota içinde bilinir. Motor aday tipini döndürür (ad taşımaz — karar için
  // gereksiz); adı kendi listemizden okuruz.
  const matched = findZoneForPostalCode({ country: identity.country, postalCode }, zones);
  const zone = matched ? zones.find((z) => z.id === matched.id) : undefined;
  const inRoute = delivery.deliveryType === 'route';

  return {
    postalCode,
    country: identity.country,
    // Rota dışında da dolu: "75011 Paris · kargo" yazılabiliyor (19.8). Çok yerleşimli kodda `null`
    // kalır ve ekran `places`'ten kendi etiketini kurar (19.17).
    placeName: identity.placeName,
    places: [...identity.places],
    zoneName: inRoute ? (zone?.name ?? null) : null,
    inRoute,
    nextDate: delivery.availableDates[0] ?? null,
    point,
  };
}
