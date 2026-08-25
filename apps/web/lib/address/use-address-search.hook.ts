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

/**
 * Sorgu metni → öneriler. Modül düzeyinde: form kapanıp açılınca da yaşar (aynı oturum).
 *
 * **İKİ KATLI, ÇÜNKÜ CEVAP ARTIK YALNIZ METNE BAĞLI DEĞİL (08.41):** aynı sorgu, müşterinin
 * yerine göre farklı SIRADA dönüyor. Tek katlı bir depoda *"12 rue foch"* anahtarı Strasbourg'a
 * göre sıralanmış cevabı taşırdı ve müşteri yerini Paris yapınca **aynı cevabı yeniden görürdü** —
 * üstelik sessizce, çünkü liste dolu ve makul görünürdü. Dış anahtar noktadır; çekirdek yalnız iç
 * Map'i görür ve sorgu metnine göre çalışmaya devam eder (`use-debounced-lookup` sözleşmesi).
 */
const caches = new Map<string, Map<string, AddressSearchState>>();

function cacheFor(key: string): Map<string, AddressSearchState> {
  const found = caches.get(key);
  if (found !== undefined) return found;
  const fresh = new Map<string, AddressSearchState>();
  caches.set(key, fresh);
  return fresh;
}

async function lookup(term: string, near: NearPoint | undefined): Promise<LookupResult<AddressSearchState>> {
  /* Alan adları BİLEREK çevriliyor: bizim tarafımızda nokta `lat`/`lng` (kolon adlarının aynısı),
     BAN kapısında `latitude`/`longitude`. Paket kendi sözcüklerini kullanıyor ve öyle kalmalı —
     `@lezzet/address-fr` künyesi: servisin alan adları o sisteme ait, bizim tipimize dayatılmaz. */
  const found = await searchAddresses(
    near === undefined ? { query: term } : { query: term, near: { latitude: near.lat, longitude: near.lng } },
  );
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

/** Yakınlık ipucunun noktası — `DeliveryPlace.point` ile aynı şekil, çağıran onu geçiriyor. */
export interface NearPoint {
  lat: number;
  lng: number;
}

interface AddressSearchOptions {
  /** Kapalıyken hiç ağa çıkılmaz — form kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
  /**
   * Müşterinin bilinen yeri — öneriler buna YAKIN olanları öne alır (08.41). Süzgeç değil:
   * uzaktaki adres listede kalır, yalnız sırası düşer (ölçüm `@lezzet/address-fr` künyesinde).
   *
   * `undefined` = yer bilinmiyor → ipuçsuz sorulur, bugünkü davranış. Uydurulmuş bir merkez
   * KONMAZ: yeri bilinmeyen müşteri, farkında olmadan başkasının şehrine göre sıralanmış bir
   * liste okurdu.
   */
  near?: NearPoint;
}

export function useAddressSearch(query: string, { enabled, near }: AddressSearchOptions): AddressSearchState {
  /* Depo noktaya göre ayrılır (künye yukarıda). Anahtar altı haneye yuvarlanmış çift — kolonun
     kendi kesinliği de o (`numeric(9,6)`), yani yuvarlama bir kayıp değil aynı değerin metni. */
  const cache = cacheFor(near === undefined ? '-' : `${near.lat},${near.lng}`);
  return useDebouncedLookup(query, {
    enabled,
    minLength: MIN_QUERY_LENGTH,
    empty: EMPTY,
    /* Satır içi kapanış: çekirdek `lookup`ı ref'te tutuyor ve bağımlılık dizisine KOYMUYOR
       (kendi künyesi) — yani her render'da yeni kimlik almak gecikmeyi sıfırlamıyor. */
    lookup: (term) => lookup(term, near),
    cache,
  });
}
