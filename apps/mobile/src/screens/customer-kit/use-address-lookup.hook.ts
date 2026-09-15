import { MIN_QUERY_LENGTH } from '@lezzet/address-fr';
import type { Locale } from '@lezzet/i18n';
import { useDebouncedLookup, type LookupResult } from '@lezzet/react-hooks';
import type { Country } from '@lezzet/types';

import { suggestAddressOptions, type AddressOption } from '@/lib/api/addresses';

/*
  ADRES ÖNERİSİ — TEK KAPI (21.313 · kullanıcı kararı 14.09): çekmecenin arama alanı hangi ülke
  seçiliyse onu PARAMETRE olarak geçirir; sağlayıcıyı (FR BAN · DE Google) sunucu seçer
  (`/me/addresses/lookup/suggest` → `lookupAddressOptions`). Çekmecede ülkeye göre dallanan kod yok.

  GECİKME, ÖNBELLEK VE YARIŞ kararları ortak çekirdekte (`useDebouncedLookup`); burada kalan tek şey
  bu kaynağın kuralları. Önbellek ÜLKE BAŞINA ayrı: aynı metin iki ülkede iki ayrı sorudur
  ("Hauptstraße 12" Fransa'da boş, Almanya'da dolu döner).

  Başarısızlık bir DEĞER: uç düşerse liste boş gelir ve çekmece "bulamadık → elle gireyim" yoluna
  düşer. `busy` (sağlayıcı kotası) GEÇİCİDİR — hatırlanmaz, bir sonraki duraklamada yeniden sorulur.
*/

interface AddressLookupState {
  options: AddressOption[];
  /** Sağlayıcının kotası doldu — ekran kısa bir satır gösterir, elle giriş açık kalır. */
  busy: boolean;
  /**
   * Cevabın ait olduğu sorgu. Çekmece "bulamadık" kutusunu YALNIZ cevap alandaki metnin cevabıysa
   * çizer — yoksa yazarken bir önceki sorgunun boş cevabı kutuyu yakıp söndürürdü.
   */
  term: string;
}

const EMPTY: AddressLookupState = { options: [], busy: false, term: '' };

/** Sorgu → cevap, ülke başına. Modül düzeyinde: çekmece kapanıp açılınca da yaşar (aynı oturum). */
const CACHES: Record<Country, Map<string, AddressLookupState>> = { FR: new Map(), DE: new Map() };

interface AddressLookupOptions {
  country: Country;
  /** Kapalıyken hiç ağa çıkılmaz — çekmece kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
  /** Google'ın ücret oturumu — yazma boyunca aynı, seçimle biter (çekmece üretir); BAN kullanmaz. */
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
