'use client';

import { MIN_QUERY_LENGTH, searchAddresses, type AddressSuggestion } from '@lezzet/address-fr';
import { useDebouncedLookup, type LookupResult } from '@lezzet/react-hooks';

/*
  ADRES ÖNERİSİ DURUMU (web) — adres formunun sokak alanını Fransız devletinin adres servisine
  (BAN) bağlar. Paket (`@lezzet/address-fr`) yalnız kapıyı bilir; gecikme/önbellek/yarış kararları
  ortak çekirdekte (`@lezzet/react-hooks`). Burada kalan tek şey BU KAYNAĞIN kuralları.

  **Native'in aynısı ve öyle olması gerekiyor.** Paketin künyesi 09.08'de zaten yazmıştı: *"web
  formu da native uygulamanın adres çekmecesi de aynı kapıdan okur."* Web bu tura kadar hiç
  bağlanmamıştı — aynı müşteri, aynı adresi, hangi yüzeyden girdiğine göre farklı bir yardım
  alıyordu.

  ── TARAYICIDAN ÇAĞRILIYOR, SUNUCUDAN DEĞİL ─────────────────────────────────
  Servisin sınırı İSTEMCİ başına değil **IP başına saniyede 50 istek** ve gerekçe web'de native'e
  göre daha da güçlü: bir sunucu eylemi (server action) üstünden proxy'lenseydi tüm müşteriler
  sunucumuzun TEK IP'sini paylaşırdı, akşam saatinde eşzamanlı yazan birkaç düzine müşteri ortak
  kotayı tüketir ve 429 HERKESE birden çarpardı — üstelik suçlu ile mağdur ayırt edilemezdi.
  Tarayıcıdan çağrılınca her müşteri kendi IP'sinin kotasını kullanır.

  Bedeli: tarayıcının doğrudan dış servise çıkması — kabul edildi, çünkü servis anahtarsız ve
  gönderilen tek şey müşterinin YAZDIĞI adres metnidir (kimlik yok, oturum yok, çerez yok).
  Paket bunun için bilerek izomorfik tutuldu: `fetch` + `AbortController` dışında hiçbir şey
  istemiyor, `logger` gibi node-only bir bağımlılığı yok.

  ── BAŞARISIZLIKTA NE OLUR (sessiz catch YOK — CLAUDE §1) ───────────────────
  Paket fırlatmaz, her başarısızlığı ADLANDIRIR ve dördü de burada ayrı ayrı karşılanır:
  · `too_short`        — ağa hiç çıkılmaz (çekirdek zaten `MIN_QUERY_LENGTH` altını eler)
  · `rate_limited`     — `throttled` bayrağı kalkar, ekran "biraz sonra" der; ELLE YAZMA AÇIK
  · `unavailable`      — liste çizilmez, form bugünkü gibi çalışır (servis düşmesi müşteriyi durdurmaz)
  · `invalid_response` — aynısı; sözleşme değişmişse yanlış veriyi forma basmaktansa hiç önermeyiz
  Hiçbirinde `console` yok — zaten yasak (CLAUDE §1), ama burada ayrıca yazılacak tek şey
  müşterinin adresi olurdu ve log'a içerik yazılmaz.

  **Yalnız `ok` hatırlanır.** Kota ve arıza hâlleri GEÇİCİDİR; önbelleğe girselerdi müşteri aynı
  harfleri yazdığı sürece oturum boyunca aynı arızayı görürdü — servis çoktan düzelmiş olsa bile.
*/

interface AddressSearchState {
  suggestions: AddressSuggestion[];
  /** Servis kotayı kapattı — ekran kısa bir satır gösterir, alan yazmaya açık kalır. */
  throttled: boolean;
}

const EMPTY: AddressSearchState = { suggestions: [], throttled: false };

/** Sorgu metni → öneriler. Modül düzeyinde: form kapanıp açılınca da yaşar (aynı oturum). */
const cache = new Map<string, AddressSearchState>();

async function lookup(term: string): Promise<LookupResult<AddressSearchState>> {
  const found = await searchAddresses({ query: term });
  switch (found.status) {
    case 'ok':
      return { value: { suggestions: found.suggestions, throttled: false }, cache: true };
    case 'rate_limited':
      return { value: { suggestions: [], throttled: true }, cache: false };
    case 'unavailable':
    case 'invalid_response':
    case 'too_short':
      return { value: EMPTY, cache: false };
  }
}

interface AddressSearchOptions {
  /** Kapalıyken hiç ağa çıkılmaz — form kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
}

export function useAddressSearch(query: string, { enabled }: AddressSearchOptions): AddressSearchState {
  return useDebouncedLookup(query, { enabled, minLength: MIN_QUERY_LENGTH, empty: EMPTY, lookup, cache });
}
