import { MIN_QUERY_LENGTH, searchAddresses, type AddressSuggestion } from '@lezzet/address-fr';
import { useEffect, useRef, useState } from 'react';

/*
  ADRES ÖNERİSİ DURUMU (21.15) — adres çekmecesinin sokak alanını Fransız devletinin adres
  servisine (BAN) bağlar. Paket (`@lezzet/address-fr`) yalnız kapıyı bilir; GECİKMELİ ÇAĞRI,
  ÖNBELLEK ve EKRAN DURUMU bilerek onun dışında bırakılmış — ikisi yüzeye göre değişir ve karar
  buranın. Bu dosya o üç kararı taşır.

  ── CİHAZDAN ÇAĞRILIYOR, SUNUCUDAN DEĞİL (karar 09.08) ──────────────────────
  Servisin sınırı İSTEMCİ başına değil **IP başına saniyede 50 istek**. Sunucumuzdan (mobile-api)
  proxy'lenseydi tüm müşteriler TEK IP'yi paylaşırdı: akşam saatinde eşzamanlı yazan birkaç düzine
  müşteri ortak kotayı tüketir ve 429 HERKESE birden çarpardı — üstelik suçlu müşteri ile mağdur
  müşteri ayırt edilemezdi. Cihazdan çağrılınca her müşteri kendi IP'sinin kotasını kullanır ve
  bir müşterinin hızlı yazması ötekini etkilemez. Bedeli: telefonun doğrudan dış servise çıkması —
  kabul edildi, çünkü servis anahtarsız ve gönderilen tek şey müşterinin YAZDIĞI adres metnidir
  (kimlik yok, oturum yok). Ayrıntı: `packages/address-fr/src/ban-client.ts` künyesi.

  ── ÜÇ KARAR ────────────────────────────────────────────────────────────────
  1. GECİKME (debounce) — her tuşa basışta istek atmak hem kotayı yer hem gereksiz: "12 rue du
     marché" 17 istek demekti. Yazma durunca tek istek atılır.
  2. ÖNBELLEK — müşteri harf silip geri yazınca (çok olur) aynı sorgu tekrar ağa çıkmasın. Sorgu
     metnine göre, oturum boyu, TAVANLI.
  3. YARIŞ — geç dönen cevap yeni sorgunun önerilerini EZMEZ (`generation` sayacı; deponun
     `use-me.hook`taki deseninin aynısı, yenisi uydurulmadı).

  ── BAŞARISIZLIKTA NE OLUR (sessiz catch YOK — CLAUDE §1) ───────────────────
  Paket fırlatmaz, her başarısızlığı ADLANDIRIR ve dördü de burada AYRI AYRI karşılanır:
  · `too_short`        — ağa hiç çıkılmaz (aşağıdaki kapı zaten `MIN_QUERY_LENGTH` altını eler)
  · `rate_limited`     — `throttled` bayrağı kalkar, ekran "biraz sonra" der; ELLE YAZMA AÇIK
  · `unavailable`      — liste çizilmez, form bugünkü gibi çalışır (servis düşmesi müşteriyi durdurmaz)
  · `invalid_response` — aynısı; sözleşme değişmişse yanlış veriyi forma basmaktansa hiç önermeyiz
  Hiçbirinde `console` yok: istemcide teşhis kanalımız yok ve yazılacak tek şey müşterinin adresi
  olurdu (log'a içerik yazılmaz — CLAUDE §1).
*/

/**
 * Yazma durduktan sonra isteğin atılması için beklenen süre. 300 ms insanın tuşlar arası
 * ortalamasının (~150-200 ms) üstünde, algılanabilir gecikmenin (~400 ms) altında: hızlı yazan
 * müşteri tek istek üretir, duraklayan müşteri beklediğini hissetmez. Değer VARSAYILAN, sabit
 * değil: çağıran `debounceMs` ile değiştirir (ölçüm ve testte gecikmeyi sıfırlamak için). Dışarı
 * AÇILMADI — ikinci bir ayar kapısı olurdu; ayarın tek kapısı hook'un seçeneği.
 */
const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Önbellek tavanı. Bir çekmece oturumunda benzersiz sorgu sayısı onlarla ölçülür; tavan
 * sınırsız büyümeyi keser, en eski giriş düşer (ekleme sırası = `Map` sırası).
 */
const CACHE_LIMIT = 40;

/** Sorgu metni → öneriler. Modül düzeyinde: çekmece kapanıp açılınca da yaşar (aynı oturum). */
const cache = new Map<string, AddressSuggestion[]>();

function remember(term: string, suggestions: AddressSuggestion[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(term, suggestions);
}

interface AddressSearchState {
  suggestions: AddressSuggestion[];
  /** Servis kotayı kapattı — ekran kısa bir satır gösterir, alan yazmaya açık kalır. */
  throttled: boolean;
}

const EMPTY: AddressSearchState = { suggestions: [], throttled: false };

interface AddressSearchOptions {
  /** Kapalıyken hiç ağa çıkılmaz — çekmece kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
  debounceMs?: number;
}

export function useAddressSearch(query: string, { enabled, debounceMs = DEFAULT_DEBOUNCE_MS }: AddressSearchOptions): AddressSearchState {
  const [state, setState] = useState<AddressSearchState>(EMPTY);
  /* Kaçıncı sorgudayız — cevap döndüğünde hâlâ SON sorgu muyuz diye bakılır. Ref, çünkü değeri
     render'ı ilgilendirmiyor; state olsaydı her tuş iki render yapardı. */
  const generation = useRef(0);

  useEffect(() => {
    const term = query.trim();
    // Yeni bir soru soruldu: bu andan önce yola çıkmış her cevap artık ESKİ.
    const run = ++generation.current;

    if (!enabled || term.length < MIN_QUERY_LENGTH) {
      setState((current) => (current === EMPTY ? current : EMPTY));
      return;
    }

    const cached = cache.get(term);
    if (cached !== undefined) {
      setState({ suggestions: cached, throttled: false });
      return;
    }

    const timer = setTimeout(() => {
      void searchAddresses({ query: term }).then((lookup) => {
        if (run !== generation.current) return;
        switch (lookup.status) {
          case 'ok':
            remember(term, lookup.suggestions);
            setState({ suggestions: lookup.suggestions, throttled: false });
            return;
          case 'rate_limited':
            setState({ suggestions: [], throttled: true });
            return;
          // Servis yok / cevap tanınmadı / (kapıdan geçemeyen) kısa sorgu: liste ÇİZİLMEZ.
          // Müşteriye hata gösterilmez — öneri yardımcı bir özellik, yokluğu arıza değil.
          case 'unavailable':
          case 'invalid_response':
          case 'too_short':
            setState(EMPTY);
            return;
        }
      });
    }, debounceMs);

    /* Sorgu değişti ya da ekran kapandı: bekleyen istek HİÇ atılmaz. Yolda olan bir istek varsa
       onu `generation` eler — iptal etmek yerine cevabını yok saymak yeter ve `AbortController`ı
       her tuşta kurup yıkmaktan ucuz. */
    return () => clearTimeout(timer);
  }, [query, enabled, debounceMs]);

  return state;
}
