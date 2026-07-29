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
 * DİNLENME HÂLİ DÜĞME DEĞİL (09.17). Düğme bir emniyet ağı olarak eklenmişti ama koşulsuz çiziliyordu:
 * `hasMore && !loading` olan her an ekranda duruyordu, yani listenin dinlenme hâli düğmeydi. Ekran
 * "tıkla" derken mekanizma "ben hallederim" diyordu ve operatör her sayfada ikisi arasında titreyen
 * bir şerit görüyordu. Oysa envanter (O4) bu yüzeyde yalnız sonsuz kaydırma istiyor — düğme hiçbir
 * operasyon tasarımında yok. (Müşteri yüzeyi ayrı: orada düğme tasarım kararıdır, bkz. `ui/load-more`.)
 *
 * Düğme artık yalnız otomatik yol İŞLEMEDİĞİNDE çıkar (`autoActive === false`): gözlemci hiç haber
 * vermiyorsa ya da üst üste çekilen sayfa sınırına varıldıysa. Sessiz kilit yerine görünür çıkış —
 * ama yalnız kilit varken.
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
  const { ref, autoActive, loadMore } = useLoadMore({ hasMore, loading, onLoadMore, rootMargin });
  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex items-center justify-center gap-3 px-6 py-4">
      {loading || autoActive ? (
        <span className="font-ops-body text-ops-sm text-ops-muted">Yükleniyor…</span>
      ) : (
        <button
          type="button"
          onClick={loadMore}
          className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
        >
          Daha fazla yükle
        </button>
      )}
    </div>
  );
}
