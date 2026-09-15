'use client';

import { MIN_QUERY_LENGTH, searchAddresses, type AddressSuggestion } from '@lezzet/address';
import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';

/*
  Web adres formunun sokak alanı: Fransa adres servisine (BAN) tarayıcıdan sorulur. Servisin sınırı IP başına olduğu için
  sunucudan sorulsaydı bütün müşteriler tek IP'nin kotasını paylaşırdı; giden tek şey müşterinin yazdığı metin.
*/

interface AddressSearchState {
  suggestions: AddressSuggestion[];
  /** Servis kotayı kapattı: ekran kısa bir satır gösterir, alan yazmaya açık kalır. */
  throttled: boolean;
  /** Cevabın ait olduğu kırpılmış sorgu; ekran önceki sorgunun boş cevabını "bulamadık" diye okumasın. Boş hâlde `''`. */
  term: string;
}

const EMPTY: AddressSearchState = { suggestions: [], throttled: false, term: '' };

/** Önbellek yakınlık noktasına göre ayrılır: aynı sorgu başka yerde başka sırayla döner. */
const caches = new Map<string, Map<string, AddressSearchState>>();

function cacheFor(key: string): Map<string, AddressSearchState> {
  const found = caches.get(key);
  if (found !== undefined) return found;
  const fresh = new Map<string, AddressSearchState>();
  caches.set(key, fresh);
  return fresh;
}

async function lookup(term: string, near: NearPoint | undefined): Promise<LookupResult<AddressSearchState>> {
  // Yalnız kapı düzeyi istenir: teslimat kapıya yapılıyor, sokak önerisiyle girilen adres ödemede ve kuryede "kapı doğrulanmadı" görünür.
  const found = await searchAddresses({
    query: term,
    kind: 'housenumber',
    ...(near === undefined ? {} : { near: { latitude: near.lat, longitude: near.lng } }),
  });
  switch (found.status) {
    case 'ok':
      return { value: { suggestions: found.suggestions, throttled: false, term }, cache: true };
    // Kota ve arıza geçicidir, hatırlanmaz.
    case 'rate_limited':
      return { value: { suggestions: [], throttled: true, term }, cache: false };
    case 'unavailable':
    case 'invalid_response':
    case 'too_short':
      return { value: { ...EMPTY, term }, cache: false };
  }
}

interface NearPoint {
  lat: number;
  lng: number;
}

interface AddressSearchOptions {
  /** Kapalıyken ağa çıkılmaz: form kapalı ya da öneri seçilmişken. */
  enabled: boolean;
  /** Müşterinin bilinen yeri; yakın öneriler öne alınır, uzaktakiler elenmez. Yer bilinmiyorsa uydurma merkez konmaz. */
  near?: NearPoint;
}

export function useAddressSearch(query: string, { enabled, near }: AddressSearchOptions): AddressSearchState {
  // Anahtar altı haneli nokta; kolonun kesinliği de o.
  const cache = cacheFor(near === undefined ? '-' : `${near.lat},${near.lng}`);
  return useDebouncedLookup(query, {
    enabled,
    minLength: MIN_QUERY_LENGTH,
    empty: EMPTY,
    lookup: (term) => lookup(term, near),
    cache,
  });
}
