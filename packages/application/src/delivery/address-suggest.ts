import { addressLineOf } from '@lezzet/address';
import { searchAddresses } from '@lezzet/address/fr';
import { autocompleteAddresses, lookupPlace, type AutocompleteLookup, type PlaceLookup } from '@lezzet/address/google';
import type { AddressGeoPrecision, Country } from '@lezzet/types';
import { googleMapsApiKey, traceGoogleFailure } from './google-maps';

/**
 * Web'in Almanya kapısı: Google'da kota projeye bağlı ve anahtar gizli olduğu için çağrı sunucudan gider; Fransa'da
 * `unsupported_country` döner ki yanlışlıkla düşen sorgu için Google'a ödeme yapılmasın. Öneri ve seçim aynı `sessionToken`la
 * sorulur, çünkü Google fiyatı oturum kademesinden keser.
 */
export type AddressSuggestOutcome = AutocompleteLookup | { status: 'not_configured' } | { status: 'unsupported_country' };

export type AddressResolveOutcome = PlaceLookup | { status: 'not_configured' };

/** Türkçe arayüzde adres ülkesinin dilinde biçimlenir. */
function languageFor(country: Country, locale: string): string {
  if (locale === 'fr' || locale === 'de') return locale;
  return country === 'DE' ? 'de' : 'fr';
}

export async function suggestAddresses(input: {
  country: Country;
  query: string;
  sessionToken: string;
  locale: string;
  near?: { lat: number; lng: number } | null;
}): Promise<AddressSuggestOutcome> {
  if (input.country !== 'DE') return { status: 'unsupported_country' };
  const apiKey = googleMapsApiKey();
  if (apiKey === null) return { status: 'not_configured' };

  const result = await autocompleteAddresses({
    apiKey,
    languageCode: languageFor(input.country, input.locale),
    query: input.query,
    country: input.country,
    sessionToken: input.sessionToken,
    ...(input.near ? { near: { latitude: input.near.lat, longitude: input.near.lng } } : {}),
  });
  return traceGoogleFailure('address_suggest', result);
}

export async function resolveAddressSuggestion(input: { placeId: string; sessionToken: string; locale: string }): Promise<AddressResolveOutcome> {
  const apiKey = googleMapsApiKey();
  if (apiKey === null) return { status: 'not_configured' };
  const result = await lookupPlace({ apiKey, languageCode: languageFor('DE', input.locale), placeId: input.placeId, sessionToken: input.sessionToken });
  return traceGoogleFailure('address_resolve', result);
}

/*
  Native adres çekmecesinin tek kapısı: ülke yalnız sağlayıcıyı seçer, Fransa BAN'a, Almanya Google'a gider. Bedeli BAN kotasının
  (IP başına) sunucuda paylaşılması; kota dolunca kapı `busy` döner ve elle giriş açık kalır.
*/
// BEKLEYEN(K.11): web'in Fransa önerisi hâlâ tarayıcıdan BAN'a gidiyor.

/** Google kodu ya da şehri vermeyebilir. */
export interface AddressLookupAddress {
  line1: string;
  postalCode: string | null;
  city: string | null;
  point: { lat: number; lng: number; precision: AddressGeoPrecision; source: 'ban' | 'google' };
}

/** `address` BAN'da doludur; Google öneride yalnız metin verdiği için `null`dur ve seçim `resolveAddressOption` ister. */
export interface AddressLookupOption {
  id: string;
  title: string;
  subtitle: string | null;
  address: AddressLookupAddress | null;
}

/** `busy` kota doluluğudur: hata değil, "biraz sonra". */
export type AddressLookupOutcome = { status: 'ok'; options: AddressLookupOption[] } | { status: 'busy' };

interface AddressLookupInput {
  country: Country;
  query: string;
  /** Google'ın ücret oturumu, yazma boyunca aynı; BAN kullanmaz. */
  sessionToken: string;
  locale: string;
}

async function lookupFrance(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  const found = await searchAddresses({ query: input.query, kind: 'housenumber' });
  if (found.status === 'rate_limited') return { status: 'busy' };
  // Servis düştü ya da cevap bozuk: öneri yok, müşteri elle yazar.
  if (found.status !== 'ok') return { status: 'ok', options: [] };
  return {
    status: 'ok',
    options: found.suggestions.map((row) => {
      const line1 = addressLineOf(row);
      return {
        id: row.id,
        title: line1,
        subtitle: `${row.postalCode} ${row.city}`,
        address: {
          line1,
          postalCode: row.postalCode,
          city: row.city,
          point: { lat: row.latitude, lng: row.longitude, precision: row.kind, source: 'ban' },
        },
      };
    }),
  };
}

async function lookupGermany(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  const outcome = await suggestAddresses({ ...input, country: 'DE' });
  // Anahtar yok ya da reddedildi: iz `traceGoogleFailure`ta, müşteri elle yazar.
  if (outcome.status !== 'ok') return { status: 'ok', options: [] };
  return {
    status: 'ok',
    options: outcome.suggestions.map((row) => ({ id: row.placeId, title: row.main, subtitle: row.secondary, address: null })),
  };
}

/** Yeni ülke yeni bir satırdır; çağıran değişmez. */
const LOOKUP_PROVIDERS: Record<Country, (input: AddressLookupInput) => Promise<AddressLookupOutcome>> = {
  FR: lookupFrance,
  DE: lookupGermany,
};

export function lookupAddressOptions(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  return LOOKUP_PROVIDERS[input.country](input);
}

/** Öneride adresi zaten veren BAN'da ikinci adım yoktur: `null`. */
export async function resolveAddressOption(input: {
  country: Country;
  id: string;
  sessionToken: string;
  locale: string;
}): Promise<AddressLookupAddress | null> {
  if (input.country !== 'DE') return null;
  const outcome = await resolveAddressSuggestion({ placeId: input.id, sessionToken: input.sessionToken, locale: input.locale });
  if (outcome.status !== 'ok') return null;
  const found = outcome.address;
  return {
    line1: found.line1,
    postalCode: found.postalCode,
    city: found.city,
    point: { lat: found.latitude, lng: found.longitude, precision: found.precision, source: 'google' },
  };
}
