import { MIN_QUERY_LENGTH } from '@lezzet/address';
import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';
import type { Locale } from '@lezzet/i18n';
import type { Country } from '@lezzet/types';

import { suggestAddressOptions, type AddressOption } from '@/lib/api/addresses';

/*
  Adres çekmecesinin araması tek kapıdan gider: ülke parametre olarak geçer, sağlayıcıyı (Fransa BAN, Almanya Google)
  sunucu seçer. Önbellek ülke başına ayrıdır, çünkü aynı metin iki ülkede iki ayrı sorudur.
*/

interface AddressLookupState {
  options: AddressOption[];
  /** Sağlayıcının kotası doldu: ekran kısa bir satır gösterir; geçici olduğu için hatırlanmaz. */
  busy: boolean;
  /** Cevabın ait olduğu sorgu; çekmece "bulamadık" kutusunu yalnız alandaki metnin cevabıysa çizer. */
  term: string;
}

const EMPTY: AddressLookupState = { options: [], busy: false, term: '' };

/** Sorgudan cevaba, ülke başına; modül düzeyinde, çekmece kapanıp açılınca da yaşar. */
const CACHES: Record<Country, Map<string, AddressLookupState>> = { FR: new Map(), DE: new Map() };

interface AddressLookupOptions {
  country: Country;
  /** Kapalıyken ağa çıkılmaz: çekmece kapalı ya da öneri seçilmişken. */
  enabled: boolean;
  /** Google'ın ücret oturumu: yazma boyunca aynı, seçimle biter; BAN kullanmaz. */
  sessionToken: string;
  locale: Locale;
  debounceMs?: number;
}

export function useAddressLookup(
  query: string,
  { country, enabled, sessionToken, locale, debounceMs }: AddressLookupOptions,
): AddressLookupState {
  const lookup = async (term: string): Promise<LookupResult<AddressLookupState>> => {
    const result = await suggestAddressOptions({ country, query: term, sessionToken, locale });
    if (result.error !== null) return { value: { ...EMPTY, term }, cache: false };
    return { value: { options: result.data.options, busy: result.data.busy, term }, cache: !result.data.busy };
  };
  return useDebouncedLookup(query, {
    enabled,
    minLength: MIN_QUERY_LENGTH,
    empty: EMPTY,
    lookup,
    cache: CACHES[country],
    debounceMs,
  });
}
