import { suggestPostalCodes, type PlaceOption } from '@/lib/api/places';
import { MIN_POSTAL_PREFIX_LENGTH } from '@lezzet/address';
import { useDebouncedLookup, type LookupResult } from '@lezzet/address/react';

/*
  Adres formunun posta kodu alanı kendi `postal_code_place` tablomuzdan önerilir, çünkü elle yazılan kod ülkesini
  söylemiyor ve 610 kod iki ülkede birden geçerli. Uç düşerse liste boş gelir ve form elle yazmaya açık kalır.
*/

const EMPTY: PlaceOption[] = [];

/** Önekten adaylara; modül düzeyinde, çekmece kapanıp açılınca da yaşar. */
const cache = new Map<string, PlaceOption[]>();

async function lookup(term: string): Promise<LookupResult<PlaceOption[]>> {
  const result = await suggestPostalCodes(term);
  // Taşıma hatası hatırlanmaz; boş ama başarılı cevap gerçek bir cevaptır ve hatırlanır.
  return result.error !== null ? { value: EMPTY, cache: false } : { value: result.data, cache: true };
}

export function usePostalSuggest(prefix: string, { enabled }: { enabled: boolean }): PlaceOption[] {
  // Küçük eşik: türe göre asıl eşik sunucuda uygulanır ve üç harfli bir ad oraya ulaşabilmeli.
  return useDebouncedLookup(prefix, { enabled, minLength: MIN_POSTAL_PREFIX_LENGTH, empty: EMPTY, lookup, cache });
}
