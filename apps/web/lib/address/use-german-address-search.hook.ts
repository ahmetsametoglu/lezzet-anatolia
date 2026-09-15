'use client';

import { MIN_QUERY_LENGTH } from '@lezzet/address';
import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';
import { suggestGermanAddressesAction, type GermanSuggestion } from './lookup-actions';

/*
  Web adres formunun Almanya araması: Google'a sunucu eylemiyle sorulur, çünkü anahtar gizli ve kota projeye bağlı.
  Oturum jetonu yazma boyunca aynıdır ve seçimle biter; önbellek jetona göre ayrılmaz, jeton yalnız faturalama bağlamıdır.
*/

interface GermanSearchState {
  suggestions: GermanSuggestion[];
  /** Cevabın ait olduğu kırpılmış sorgu; boş hâlde `''`. */
  term: string;
}

const EMPTY: GermanSearchState = { suggestions: [], term: '' };
const cache = new Map<string, GermanSearchState>();

async function lookup(term: string, sessionToken: string): Promise<LookupResult<GermanSearchState>> {
  try {
    const suggestions = await suggestGermanAddressesAction({ query: term, sessionToken });
    return { value: { suggestions, term }, cache: suggestions.length > 0 };
  } catch {
    // İstek düştü (ağ, sayfa yenilendi): cevap "öneri yok" olarak döner ve ekran elle giriş yolunu açar.
    return { value: { suggestions: [], term }, cache: false };
  }
}

interface GermanSearchOptions {
  /** Kapalıyken ağa çıkılmaz: ülke Almanya değilken ya da öneri seçilmişken. */
  enabled: boolean;
  sessionToken: string;
}

export function useGermanAddressSearch(query: string, { enabled, sessionToken }: GermanSearchOptions): GermanSearchState {
  return useDebouncedLookup(query, {
    enabled,
    minLength: MIN_QUERY_LENGTH,
    empty: EMPTY,
    lookup: (term) => lookup(term, sessionToken),
    cache,
  });
}
