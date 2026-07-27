'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Sona-yaklaşınca yükleme (infinite scroll) tetikleyicisinin MEKANİZMASI — iki yüzey de bunu kullanır.
 *
 * Yalnız gözlemci burada; görünüm çağıranın işi. Operasyon yüzeyi Türkçe ve `ops-*` token'larıyla,
 * müşteri yüzeyi üç dilli ve müşteri token'larıyla çizer — ortak olan "eşiğe girince bir kez tetikle"
 * kuralıdır, düğmenin nasıl göründüğü değil. Bileşenin tamamı paylaşılsaydı ya operasyon metni
 * müşteriye sızardı ya da iki kopya doğardı.
 *
 * Kaydırma olayı dinlemek yerine IntersectionObserver: her karede hesap yapmaz, eşiğe girince bir kez
 * tetikler. `loading` sırasında gözlemci hiç kurulmaz — aynı sayfa iki kez istenmesin.
 */
interface UseLoadMoreOptions {
  /** Devam eden sayfa var mı (imleç null değil). Yoksa gözlemci kurulmaz. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Gözlemcinin kaç px önceden tetikleneceği — liste dibine varmadan yükleme başlasın. */
  rootMargin?: string;
}

export function useLoadMore({ hasMore, loading, onLoadMore, rootMargin = '240px' }: UseLoadMoreOptions): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  // Callback'i ref'te tutuyoruz: her render'da yeni fonksiyon gelse de gözlemci yeniden kurulmasın.
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, rootMargin]);

  return ref;
}
