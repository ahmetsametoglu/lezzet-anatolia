'use client';

import { useLoadMore } from '@/lib/use-load-more.hook';

/**
 * OPERASYON yüzeyinin sona-yaklaşınca yükleme tetikleyicisi. Listenin sonuna konur; görünür alana
 * girdiğinde bir sonraki sayfayı ister. `Table`'ın `footer` slotuna geçirilir (Komponent Envanteri
 * O4) ama tabloya bağımlı değildir — mobil kart listesi de aynı bileşeni kullanır.
 *
 * Gözlemci `useLoadMore` hook'unda (müşteri yüzeyiyle PAYLAŞILIR); burada kalan yalnız operasyon
 * görünümü: Türkçe metin ve `ops-*` token'ları. Bileşenin tamamı paylaşılsaydı operasyon metni
 * müşteri sayfasına sızardı.
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

export function LoadMoreSentinel({ hasMore, loading, onLoadMore, rootMargin }: LoadMoreSentinelProps) {
  const ref = useLoadMore({ hasMore, loading, onLoadMore, rootMargin });
  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex items-center justify-center gap-3 px-6 py-4">
      {loading ? (
        <span className="font-ops-body text-ops-sm text-ops-muted">Yükleniyor…</span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
        >
          Daha fazla yükle
        </button>
      )}
    </div>
  );
}
