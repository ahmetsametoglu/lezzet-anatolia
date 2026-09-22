import { AddressService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import type { ServicePoint } from '@lezzet/sendcloud';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShippingRateProvider } from './port';

/** Taşıyıcı başına haritaya gelen en yakın nokta sayısı; harita okunur kalsın diye sınırlı (parametrik). */
export const SERVICE_POINTS_PER_CARRIER = 10;

export type CheckoutServicePointsOutcome =
  | {
      status: 'ok';
      points: ServicePoint[];
      /** Araması düşen taşıyıcılar; ötekilerin noktaları yine gösterilir, eksik liste söylenir. */
      failedCarriers: string[];
    }
  | { status: 'address_not_found' };

/**
 * Müşterinin kendi adresine yakın teslim noktaları, istenen taşıyıcıların hepsi için birden. Adres istemciden değil
 * müşterinin kayıtlı adreslerinden okunur; fiyat burada yok, çünkü o anlık görüntünün teklifidir ve siparişte yeniden doğrulanır.
 */
export async function searchCheckoutServicePoints(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  input: { customerId: string; addressId: string; carrierCodes: readonly string[]; perCarrier?: number },
): Promise<CheckoutServicePointsOutcome> {
  const address = (await new AddressService(db).listByCustomer(input.customerId)).find((a) => a.id === input.addressId);
  if (!address) return { status: 'address_not_found' };

  const carriers = [...new Set(input.carrierCodes)];
  const results = await Promise.allSettled(
    carriers.map((carrierCode) =>
      provider.servicePoints({ countryCode: address.country, postalCode: address.postalCode, city: address.city ?? undefined, carrierCode }),
    ),
  );

  const points: ServicePoint[] = [];
  const failedCarriers: string[] = [];
  for (const [i, result] of results.entries()) {
    const carrierCode = carriers[i]!;
    if (result.status === 'fulfilled') {
      points.push(...result.value.slice(0, input.perCarrier ?? SERVICE_POINTS_PER_CARRIER));
      continue;
    }
    failedCarriers.push(carrierCode);
    // Taşıyıcı hesapta etkin değilse sağlayıcı 400 döner: bu bir yapılandırma işidir ve sistem ekranında görünmeli.
    await captureError(result.reason, { source: SOURCES.applicationShipping, context: { carrierCode, addressId: input.addressId } });
  }
  return { status: 'ok', points: points.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)), failedCarriers };
}
