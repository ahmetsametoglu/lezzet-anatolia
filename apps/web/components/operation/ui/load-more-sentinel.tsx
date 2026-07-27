'use client';

import { useEffect, useRef } from 'react';

/**
 * Sona-yaklaşınca yükleme (infinite scroll) tetikleyicisi — TEK KAYNAK. Listenin sonuna konur; görünür
 * alana girdiğinde bir sonraki sayfayı ister. `Table`'ın `footer` slotuna geçirilir (Komponent Envanteri
 * O4: "sona yaklaşınca yükleme footer'a bağlanır") ama tabloya bağımlı değildir — mobil kart listesi
 * de aynı bileşeni kullanır.
 *
 * Kaydırma olayı dinlemek yerine IntersectionObserver: her karede hesap yapmaz, eşiğe girince bir kez
 * tetikler. `loading` sırasında yeniden tetiklenmez (aynı sayfa iki kez istenmesin).
 *
 * Gözlemci beklenmedik bir yerleşimde hiç tetiklenmezse kullanıcı kilitlenmesin diye AÇIK bir buton da
 * durur — aynı eylemi çağırır, sessiz kilit yerine görünür çıkış.
 */
interface LoadMoreSentinelProps {
  /** Devam eden sayfa var mı (imleç null değil). Yoksa hiçbir şey çizilmez. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Gözlemcinin kaç px önceden tetikleneceği — liste dibine varmadan yükleme başlasın. */
  rootMargin?: string;
}

export function LoadMoreSentinel({ hasMore, loading, onLoadMore, rootMargin = '240px' }: LoadMoreSentinelProps) {
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

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex items-center justify-center gap-3 px-6 py-4">
      {loading ? (
        <span className="font-ops-body text-[12px] text-ops-muted">Yükleniyor…</span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-[11.5px] font-semibold text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
        >
          Daha fazla yükle
        </button>
      )}
    </div>
  );
}
