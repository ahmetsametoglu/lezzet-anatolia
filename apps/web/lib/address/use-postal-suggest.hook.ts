'use client';

import { MIN_POSTAL_PREFIX_LENGTH } from '@lezzet/address';
import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';

import type { PlaceOption } from '@lezzet/types';

import { suggestPostalCodesAction } from '@/lib/delivery/actions';

/*
  Web adres formunun posta kodu alanı kendi `postal_code_place` tablomuzdan önerilir, çünkü elle yazılan kod ülkesini
  söylemiyor ve 610 kod iki ülkede birden geçerli. Seçilen satır `(country, postalCode)` ikilisini birlikte taşır.
*/

const EMPTY: PlaceOption[] = [];

/** Önekten adaylara; modül düzeyinde, form kapanıp açılınca da yaşar. */
const cache = new Map<string, PlaceOption[]>();

async function lookup(term: string): Promise<LookupResult<PlaceOption[]>> {
  const rows = await suggestPostalCodesAction(term);
  // Eylem arızayı da boş listeye indirdiği için boş cevap hatırlanmaz; dolu cevapta böyle bir belirsizlik yok.
  return { value: rows, cache: rows.length > 0 };
}

export function usePostalSuggest(prefix: string, { enabled }: { enabled: boolean }): PlaceOption[] {
  // Küçük eşik: türe göre asıl eşik eylemde uygulanır ve üç harfli bir ad oraya ulaşabilmeli.
  return useDebouncedLookup(prefix, { enabled, minLength: MIN_POSTAL_PREFIX_LENGTH, empty: EMPTY, lookup, cache });
}
