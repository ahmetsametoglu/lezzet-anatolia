'use client';

import { MIN_QUERY_LENGTH } from '@lezzet/address-fr';
import { useDebouncedLookup, type LookupResult } from '@lezzet/react-hooks';
import { suggestGermanAddressesAction, type GermanSuggestion } from './lookup-actions';

/*
  ALMANYA ADRES ÖNERİSİ (web, v1 13.09) — adres penceresinin arama alanını Google Places'a bağlar,
  SUNUCU kapısından (`suggestGermanAddressesAction`): Google'da anahtar gizli ve kota projeye bağlı.
  BAN kardeşi (`use-address-search.hook`) tarayıcıdan gidiyor; gerekçe ters, künyesi orada.

  Gecikme, önbellek ve yarış kararları ortak çekirdekte (`useDebouncedLookup`). Eşik BAN'ınkiyle
  aynı değer (üç harf) ve oradan okunuyor: Google kapısı da (`@lezzet/address-google`) üçün altına
  `too_short` der; web o pakete bağlanmıyor (sunucu tarafı), iki kapının eşiği aynı sayıdır.

  Oturum jetonu ÇAĞIRANDA: yazma boyunca aynı jeton, seçimle biter (Google oturum kademesinden ücret
  keser — paket künyesi). Önbellek jetona göre ayrılmaz: aynı sorgu aynı cevabı verir, jeton yalnız
  faturalama bağlamı.

  Başarısızlık boş liste — ekran "bulamadık → elle gireyim" yoluna düşer. Yalnız dolu cevap
  hatırlanır: geçici bir arıza oturum boyunca aynı boşluğu göstermesin.
*/

interface GermanSearchState {
  suggestions: GermanSuggestion[];
  /** Bu cevap hangi (kırpılmış) sorgunun — BAN kardeşindeki gerekçe; boş hâlde `''`. */
  term: string;
}

const EMPTY: GermanSearchState = { suggestions: [], term: '' };
const cache = new Map<string, GermanSearchState>();

async function lookup(term: string, sessionToken: string): Promise<LookupResult<GermanSearchState>> {
  try {
    const suggestions = await suggestGermanAddressesAction({ query: term, sessionToken });
    return { value: { suggestions, term }, cache: suggestions.length > 0 };
  } catch {
    // İstek düştü (ağ, sayfa yenilendi): sessiz değil — cevap "bu sorguda öneri yok" olarak döner ve
    // ekran elle giriş yolunu açar; öneri bir kolaylık, yokluğu formu durdurmaz.
    return { value: { suggestions: [], term }, cache: false };
  }
}

interface GermanSearchOptions {
  /** Kapalıyken hiç ağa çıkılmaz — ülke Almanya değilken ya da müşteri öneriyi seçmişken. */
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
