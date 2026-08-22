import { MIN_QUERY_LENGTH, searchAddresses, type AddressSuggestion } from '@lezzet/address-fr';

import { useDebouncedLookup, type LookupResult } from '@lezzet/react-hooks';

/*
  ADRES ÖNERİSİ DURUMU (21.15) — adres çekmecesinin sokak alanını Fransız devletinin adres
  servisine (BAN) bağlar. Paket (`@lezzet/address-fr`) yalnız kapıyı bilir; GECİKMELİ ÇAĞRI,
  ÖNBELLEK ve YARIŞ kararları onun dışında ve artık bu dosyanın da dışında: ortak çekirdekte
  (`use-debounced-lookup.hook`, 21.28). Posta kodu alanı da aynı üç kararı istiyordu; ikinci bir
  nüsha yazmak, birinin bir gün ötekinden farklı davranması demekti (CLAUDE §1).

  Burada kalan tek şey BU KAYNAĞIN kuralları: nereye sorulacağı, dört başarısızlık hâlinin ne
  anlama geldiği ve hangisinin hatırlanmaya değer olduğu.

  ── CİHAZDAN ÇAĞRILIYOR, SUNUCUDAN DEĞİL (karar 09.08) ──────────────────────
  Servisin sınırı İSTEMCİ başına değil **IP başına saniyede 50 istek**. Sunucumuzdan (mobile-api)
  proxy'lenseydi tüm müşteriler TEK IP'yi paylaşırdı: akşam saatinde eşzamanlı yazan birkaç düzine
  müşteri ortak kotayı tüketir ve 429 HERKESE birden çarpardı — üstelik suçlu müşteri ile mağdur
  müşteri ayırt edilemezdi. Cihazdan çağrılınca her müşteri kendi IP'sinin kotasını kullanır ve
  bir müşterinin hızlı yazması ötekini etkilemez. Bedeli: telefonun doğrudan dış servise çıkması —
  kabul edildi, çünkü servis anahtarsız ve gönderilen tek şey müşterinin YAZDIĞI adres metnidir
  (kimlik yok, oturum yok). Ayrıntı: `packages/address-fr/src/ban-client.ts` künyesi.

  ── BAŞARISIZLIKTA NE OLUR (sessiz catch YOK — CLAUDE §1) ───────────────────
  Paket fırlatmaz, her başarısızlığı ADLANDIRIR ve dördü de burada AYRI AYRI karşılanır:
  · `too_short`        — ağa hiç çıkılmaz (çekirdek zaten `MIN_QUERY_LENGTH` altını eler)
  · `rate_limited`     — `throttled` bayrağı kalkar, ekran "biraz sonra" der; ELLE YAZMA AÇIK
  · `unavailable`      — liste çizilmez, form bugünkü gibi çalışır (servis düşmesi müşteriyi durdurmaz)
  · `invalid_response` — aynısı; sözleşme değişmişse yanlış veriyi forma basmaktansa hiç önermeyiz
  Hiçbirinde `console` yok: istemcide teşhis kanalımız yok ve yazılacak tek şey müşterinin adresi
  olurdu (log'a içerik yazılmaz — CLAUDE §1).

  **Yalnız `ok` hatırlanır.** Kota ve arıza hâlleri GEÇİCİDİR; önbelleğe girselerdi müşteri aynı
  harfleri yazdığı sürece oturum boyunca aynı arızayı görürdü — servis çoktan düzelmiş olsa bile.
*/

interface AddressSearchState {
  suggestions: AddressSuggestion[];
  /** Servis kotayı kapattı — ekran kısa bir satır gösterir, alan yazmaya açık kalır. */
  throttled: boolean;
}

const EMPTY: AddressSearchState = { suggestions: [], throttled: false };

/** Sorgu metni → öneriler. Modül düzeyinde: çekmece kapanıp açılınca da yaşar (aynı oturum). */
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
  /** Kapalıyken hiç ağa çıkılmaz — çekmece kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
  debounceMs?: number;
}

export function useAddressSearch(query: string, { enabled, debounceMs }: AddressSearchOptions): AddressSearchState {
  return useDebouncedLookup(query, { enabled, minLength: MIN_QUERY_LENGTH, empty: EMPTY, lookup, cache, debounceMs });
}
