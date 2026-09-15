import { useEffect, useRef, useState } from 'react';

/*
  Yazarken öneri getiren aramanın üç kararı tek yerde: gecikme, önbellek ve geç dönen cevabın yeni sorgunun önerilerini
  ezmemesi. Nereye sorulacağını bilmez; kaynak ve hangi cevabın hatırlanacağı `lookup`ın işi.
*/

/** Önbellek tavanı; en eski giriş düşer (ekleme sırası `Map` sırasıdır). */
const CACHE_LIMIT = 40;

/** `lookup`ın cevabı: ekrana verilecek değer ve hatırlanıp hatırlanmayacağı; boş liste hatırlanır, servis arızası hatırlanmaz. */
export interface LookupResult<T> {
  value: T;
  cache: boolean;
}

interface DebouncedLookupOptions<T> {
  /** Kapalıyken ağa çıkılmaz. */
  enabled: boolean;
  /** Bu uzunluğun altındaki sorgu ağa çıkmaz. */
  minLength: number;
  /** Sorgu yokken gösterilen değer; kimliği sabit olmalı (modül düzeyi). */
  empty: T;
  /** Sorgu metninden cevap; başarısızlığı bir değer olarak adlandırmak çağıranın işi, yine de fırlarsa liste boşalır. */
  lookup: (term: string) => Promise<LookupResult<T>>;
  /** Sorgudan cevaba depo; her kaynak kendi deposunu verir, modül düzeyinde tutulur ki ekran kapanıp açılınca da yaşasın. */
  cache: Map<string, T>;
  debounceMs?: number;
}

/** Tuşlar arası ortalamanın üstünde, algılanan gecikmenin altında: hızlı yazan tek istek üretir, duraklayan beklediğini hissetmez. */
const DEFAULT_DEBOUNCE_MS = 300;

export function useDebouncedLookup<T>(
  query: string,
  { enabled, minLength, empty, lookup, cache, debounceMs = DEFAULT_DEBOUNCE_MS }: DebouncedLookupOptions<T>,
): T {
  const [state, setState] = useState<T>(empty);
  // Cevap döndüğünde hâlâ son sorgu muyuz diye bakılır; render'ı ilgilendirmediği için ref.
  const generation = useRef(0);
  // `lookup` çoğu çağıranda satır içi kurulur; bağımlılık dizisine girseydi gecikme hiç dolmazdı.
  const call = useRef(lookup);
  call.current = lookup;

  useEffect(() => {
    const term = query.trim();
    const run = ++generation.current;

    if (!enabled || term.length < minLength) {
      setState((current) => (current === empty ? current : empty));
      return;
    }

    const cached = cache.get(term);
    if (cached !== undefined) {
      setState(cached);
      return;
    }

    const timer = setTimeout(() => {
      void call.current(term).then(
        (result) => {
          if (run !== generation.current) return;
          if (result.cache) {
            if (cache.size >= CACHE_LIMIT) {
              const oldest = cache.keys().next();
              if (!oldest.done) cache.delete(oldest.value);
            }
            cache.set(term, result.value);
          }
          setState(result.value);
        },
        // Fırlayan arama (ör. ağda düşen sunucu eylemi) önceki sorgunun adaylarını ekranda bırakmasın; cevap hatırlanmaz.
        () => {
          if (run === generation.current) setState(empty);
        },
      );
    }, debounceMs);

    // Sorgu değişti ya da ekran kapandı: bekleyen istek atılmaz, yoldaki cevabı `generation` eler.
    return () => clearTimeout(timer);
  }, [query, enabled, minLength, empty, cache, debounceMs]);

  return state;
}
