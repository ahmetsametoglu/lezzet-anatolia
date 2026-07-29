'use client';

import { useLoadMore } from '@/lib/use-load-more.hook';

/**
 * MÜŞTERİ yüzeyinin sona-yaklaşınca yükleme tetikleyicisi. Listenin sonuna konur; görünür alana
 * girdiğinde bir sonraki sayfayı ister.
 *
 * Gözlemci `useLoadMore` hook'unda (operasyon yüzeyiyle PAYLAŞILIR); burada kalan yalnız müşteri
 * görünümü. Metin ÇAĞIRANDAN gelir — bu yüzey üç dillidir, komponent metin taşımaz.
 *
 * DÜĞME BU YÜZEYDE TASARIM KARARI ve o yüzden koşulsuz durur — operasyondaki kardeşinin (09.17'de
 * düzeltilen) davranışıyla bilinçli olarak ayrışır. `Musteri - Paketler.dc.html`: "ilk 12 paket
 * basılır, altında 'Daha fazla paket' ile sayfalanır (mobilde sonsuz kaydırma)". Yani listenin sonu
 * müşteriye görünür bir davettir; kaydırma bir vaat, düğme bir garanti.
 *
 * Tıklama `loadMore`'a bağlı, `onLoadMore`'a değil: elle çekmek otomatik tur hakkını da yeniler
 * (bkz. `useLoadMore`). Doğrudan bağlansaydı sınıra varmış bir liste, düğmeye basıldıktan sonra
 * kaydırmayla devam etmez, her sayfa için ayrı tıklama isterdi.
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
  const { ref, loadMore } = useLoadMore({ hasMore, loading, onLoadMore });
  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <span className="font-sans text-body-sm text-muted">{loadingLabel}</span>
      ) : (
        <button
          type="button"
          onClick={loadMore}
          className="cursor-pointer rounded-pill border-[1.5px] border-sand-400 bg-card px-6 py-3 font-sans text-body font-bold text-ink transition-colors hover:border-olive hover:text-olive"
        >
          {label}
        </button>
      )}
    </div>
  );
}
