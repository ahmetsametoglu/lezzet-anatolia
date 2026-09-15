import type { SupabaseClient } from '@supabase/supabase-js';
import { AddressService } from '@lezzet/database';
import { addressVerdict, type AddressVerdict } from '@lezzet/domain-core';
import type { AddressGeoWrite } from '@lezzet/types';
import { captureError, SOURCES } from '@lezzet/observability';
import { geocoder as defaultGeocoder } from './geocode-provider';
import type { Geocoder } from './geocode-port';

/*
  Kapı doğrulaması adres girişinde değil sipariş anında yapılır: müşterinin kullanmayacağı adresler için servise gidilmesin. Cevap
  bir ret değil bilgidir; servis düşünce susulur, çünkü dış servisin kesintisi satışı durduramaz.
*/

export type AddressCheckOutcome =
  | { status: 'confirmed' }
  /** `label` ekranda gösterilir; teklif uygulanırken `postalCode` ve `city` yazılır, çünkü etiketi ayrıştırmak kırılgan olurdu. */
  | { status: 'wrong_postal_code'; label: string; postalCode: string; city: string }
  /** Yeni yapı olabilir; yalnız yumuşak uyarı. */
  | { status: 'street_only' }
  | { status: 'not_found' }
  /** Sorulamadı; susulur, çünkü "doğrulayamadım" demek "adres yanlış" demek değildir. */
  | { status: 'unknown' };

export async function checkAddress(
  db: SupabaseClient,
  input: { addressId: string; geocoder?: Geocoder },
): Promise<AddressCheckOutcome> {
  const addresses = new AddressService(db);
  try {
    const [row] = await addresses.listByIds([input.addressId]);
    if (!row) return { status: 'unknown' };

    const service = input.geocoder ?? defaultGeocoder();
    const query = { line1: row.line1, postalCode: row.postalCode, city: row.city, country: row.country };

    const located = await service.locate(query);
    if (located.status === 'rate_limited' || located.status === 'unavailable' || located.status === 'invalid_response') {
      return { status: 'unknown' };
    }
    // Ülkenin sağlayıcısı yoksa da susulur.
    if (located.status === 'unsupported_country') return { status: 'unknown' };

    const matchedPrecision = located.status === 'ok' ? located.precision : null;

    const alternatives = matchedPrecision === 'housenumber' ? [] : await elsewhereOf(service, query);
    if (alternatives === null) return { status: 'unknown' };

    const verdict = addressVerdict({ matchedPrecision, elsewhere: alternatives, postalCode: row.postalCode });
    await writeVerdict(addresses, { addressId: row.id, verdict, located });
    return toOutcome(verdict);
  } catch (error) {
    /* Bağlama kimlik yazılır, adres yazılmaz. Fırlatılmaz: bu kapı satışı durduramaz. */
    await captureError(error, {
      source: SOURCES.applicationDelivery,
      context: { flow: 'address_check', addressId: input.addressId },
    });
    return { status: 'unknown' };
  }
}

/** Geçici arıza `null` döner ki boş aday listesiyle karışmasın. */
async function elsewhereOf(service: Geocoder, query: Parameters<Geocoder['locate']>[0]) {
  const found = await service.elsewhere(query);
  if (found.status === 'unavailable') return null;
  // `unsupported_country` burada boş listeyle eştir: aday yok.
  return found.status === 'ok' ? found.candidates : [];
}

/**
 * Koordinat künyesi de taze yazılır: yeni cevabın yanında bayat koordinat satırı çelişkili bırakırdı ve `address_geo_alt` kısıtı
 * bunu reddeder.
 */
async function writeVerdict(
  addresses: AddressService,
  input: {
    addressId: string;
    verdict: AddressVerdict;
    located: { status: 'ok'; point: { lat: number; lng: number }; precision: AddressGeoWrite['geoPrecision']; source: AddressGeoWrite['geoSource'] } | { status: 'no_match' };
  },
): Promise<void> {
  const now = new Date().toISOString();
  const alt = input.verdict.kind === 'wrong_postal_code' ? input.verdict.suggestion.label : null;

  if (input.located.status === 'no_match') {
    // Künyenin beş alanı birlikte boşalır (`address_geo_meta`); deneme sayacı taramanın işi, burada artmaz.
    await addresses.update({
      id: input.addressId,
      lat: null,
      lng: null,
      geoPrecision: null,
      geoSource: null,
      geoAt: null,
      geoCheckedAt: now,
      geoAltLabel: alt,
    });
    return;
  }

  await addresses.update({
    id: input.addressId,
    lat: input.located.point.lat,
    lng: input.located.point.lng,
    geoPrecision: input.located.precision,
    geoSource: input.located.source,
    geoAt: now,
    geoCheckedAt: now,
    geoAltLabel: alt,
  });
}

function toOutcome(verdict: AddressVerdict): AddressCheckOutcome {
  switch (verdict.kind) {
    case 'confirmed':
      return { status: 'confirmed' };
    case 'wrong_postal_code':
      return {
        status: 'wrong_postal_code',
        label: verdict.suggestion.label,
        postalCode: verdict.suggestion.postalCode,
        city: verdict.suggestion.city,
      };
    case 'street_only':
      return { status: 'street_only' };
    case 'not_found':
      return { status: 'not_found' };
  }
}
