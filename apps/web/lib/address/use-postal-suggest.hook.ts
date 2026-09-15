'use client';

import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';

import type { PlaceOption } from '@lezzet/types';

import { suggestPostalCodesAction } from '@/lib/delivery/actions';

/*
  Web adres formunun posta kodu alanı kendi `postal_code_place` tablomuzdan önerilir, çünkü elle yazılan kod ülkesini
  söylemiyor ve 610 kod iki ülkede birden geçerli. Seçilen satır `(country, postalCode)` ikilisini birlikte taşır.
*/

/** Kancanın eşiği iki: gerçek eşik eylemde terimin türüne göre uygulanıyor (kodda 2, adda 3); burada küçüğü duruyor ki üç harfli bir ad eyleme ulaşabilsin. */
const MIN_PREFIX_LENGTH = 2;

const EMPTY: PlaceOption[] = [];

/** Önekten adaylara; modül düzeyinde, form kapanıp açılınca da yaşar. */
const cache = new Map<string, PlaceOption[]>();

async function lookup(term: string): Promise<LookupResult<PlaceOption[]>> {
  const rows = await suggestPostalCodesAction(term);
  // Eylem arızayı da boş listeye indirdiği için boş cevap hatırlanmaz; dolu cevapta böyle bir belirsizlik yok.
  return { value: rows, cache: rows.length > 0 };
}

export function usePostalSuggest(prefix: string, { enabled }: { enabled: boolean }): PlaceOption[] {
  return useDebouncedLookup(prefix, { enabled, minLength: MIN_PREFIX_LENGTH, empty: EMPTY, lookup, cache });
}
