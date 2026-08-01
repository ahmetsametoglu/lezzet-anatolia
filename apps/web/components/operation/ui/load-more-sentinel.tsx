'use client';

import { useLoadMore } from '@/lib/use-load-more.hook';
import { Skeleton } from './skeleton';

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

  // İSKELET YALNIZ GERÇEKTEN YÜKLERKEN. `autoActive` de eklenmişti ve titremeye yol açıyordu: hook
  // ilk boyamada `nearEnd === null` (gözlemci daha konuşmadı) için `autoActive: true` döndürüyor, yani
  // HER listenin dibinde, mount anında, hiçbir istek yokken nabız atan iki çubuk basılıyordu. Gözlemci
  // ilk raporunu verince düğmeye dönüyordu — 09.17'de kaldırılan iskelet↔düğme titremesinin bir karelik
  // hâli (bağımsız ajan denetimi, 30.07).
  //
  // Otomatik yol işliyor ama istek yokken görünür bir şey YOK: bekleyen bir şey de yok. Tetikleyicinin
  // kendisi yine de DOM'da kalmalı (gözlemci onu izliyor), o yüzden boş bir şerit çiziliyor.
  if (autoActive && !loading) return <div ref={ref} className="h-4" />;

  // Yükleme hâli İSKELET, "Yükleniyor…" yazısı değil: kuyruğa 30 satır gelecek ve tek satırlık bir
  // yazı, listenin dibinde gelenin ne olduğuna dair hiçbir şey söylemiyordu. Tabloya bağlı DEĞİL
  // (mobil kart listesi de bu bileşeni kullanıyor), o yüzden kolon şablonu taşımıyor — jenerik çubuk.
  if (loading) {
    return (
      <div ref={ref} className="flex flex-col gap-1.5 px-6 py-3" role="status" aria-busy="true" aria-label="Devamı yükleniyor">
        {[0, 1].map((i) => (
          <span key={i} className="flex items-center gap-3">
            <Skeleton className={`h-3 ${i === 0 ? 'w-2/5' : 'w-1/4'}`} />
            <Skeleton className="ml-auto h-3 w-16" />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="flex items-center justify-center gap-3 px-6 py-4">
      <button
        type="button"
        onClick={loadMore}
        className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-1.5 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:border-ops-olive hover:text-ops-olive"
      >
        Daha fazla yükle
      </button>
    </div>
  );
}
