import { MIN_QUERY_LENGTH, type AddressSuggestion } from '@lezzet/address';
import { searchAddresses } from '@lezzet/address/fr';

import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';

/*
  Profesyonel başvuru formunun sokak alanı: oturumsuz ziyaretçi adres çekmecesinin tek kapısını kullanamadığı için Fransa
  adres servisine (BAN) cihazdan sorulur. Servisin sınırı IP başına olduğundan cihazdan sormak her müşteriye kendi kotasını verir.
*/

interface AddressSearchState {
  suggestions: AddressSuggestion[];
  /** Servis kotayı kapattı: ekran kısa bir satır gösterir, alan yazmaya açık kalır. */
  throttled: boolean;
}

const EMPTY: AddressSearchState = { suggestions: [], throttled: false };

/** Sorgudan önerilere; modül düzeyinde, çekmece kapanıp açılınca da yaşar. */
const cache = new Map<string, AddressSearchState>();

async function lookup(term: string): Promise<LookupResult<AddressSearchState>> {
  // Yalnız kapı düzeyi istenir: teslimat kapıya yapılıyor.
  const found = await searchAddresses({ query: term, kind: 'housenumber' });
  switch (found.status) {
    case 'ok':
      return { value: { suggestions: found.suggestions, throttled: false }, cache: true };
    // Kota ve arıza geçicidir, hatırlanmaz.
    case 'rate_limited':
      return { value: { suggestions: [], throttled: true }, cache: false };
    case 'unavailable':
    case 'invalid_response':
    case 'too_short':
      return { value: EMPTY, cache: false };
  }
}

interface AddressSearchOptions {
  /** Kapalıyken ağa çıkılmaz: çekmece kapalı ya da öneri seçilmişken. */
  enabled: boolean;
  debounceMs?: number;
}

export function useAddressSearch(query: string, { enabled, debounceMs }: AddressSearchOptions): AddressSearchState {
  return useDebouncedLookup(query, { enabled, minLength: MIN_QUERY_LENGTH, empty: EMPTY, lookup, cache, debounceMs });
}
