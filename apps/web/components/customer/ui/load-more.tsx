'use client';

import { useLoadMore } from '@/lib/use-load-more.hook';

/**
 * MÜŞTERİ yüzeyinin sona-yaklaşınca yükleme tetikleyicisi. Listenin sonuna konur; görünür alana
 * girdiğinde bir sonraki sayfayı ister.
 *
 * Gözlemci `useLoadMore` hook'unda (operasyon yüzeyiyle PAYLAŞILIR); burada kalan yalnız müşteri
 * görünümü. Metin ÇAĞIRANDAN gelir — bu yüzey üç dillidir, komponent metin taşımaz.
 *
 * Gözlemci beklenmedik bir yerleşimde hiç tetiklenmezse müşteri kilitlenmesin diye AÇIK bir buton da
 * durur: kaydırma bir vaat, düğme bir garanti.
 */
interface LoadMoreProps {
  /** Devam eden sayfa var mı (imleç null değil). Yoksa hiçbir şey çizilmez. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  label: string;
  loadingLabel: string;
}

export function LoadMore({ hasMore, loading, onLoadMore, label, loadingLabel }: LoadMoreProps) {
  const ref = useLoadMore({ hasMore, loading, onLoadMore });
  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <span className="font-sans text-body-sm text-muted">{loadingLabel}</span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="cursor-pointer rounded-pill border-[1.5px] border-sand-400 bg-card px-6 py-3 font-sans text-body font-bold text-ink transition-colors hover:border-olive hover:text-olive"
        >
          {label}
        </button>
      )}
    </div>
  );
}
