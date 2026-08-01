import { LoadingRegion } from '@/components/loading-region';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Sipariş detayının ROTA DÜZEYİ beklemesi (09.7).
 *
 * En sık tıklanan derin yol — liste satırındaki numara, müşteri panelindeki sipariş kodu ve özet
 * diyaloğunun köprüsü hep buraya çıkıyor — ve bugüne dek hiçbir karşılık üretmiyordu: sayfa
 * `readOrderDetail` (kalemler + partiler + para hareketleri + durum günlüğü) dönene kadar tarayıcıda
 * eski ekran duruyordu (bağımsız ajan denetimi, 30.07).
 *
 * Detay TEK KAYIT sayfası, liste değil: iskelet de kolon şablonu değil, kartların düzenini taşıyor —
 * başlık şeridi, iki kolonlu gövde (kalemler solda, para ve durum sağda).
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Sipariş detayı yükleniyor">
      {/* Başlık: referans + durum rozetleri + geri dönüş bağı */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="mr-auto flex flex-col gap-1.5">
          <Skeleton className="h-7 w-40" />
          <span className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-[7px]" />
            <Skeleton className="h-5 w-24 rounded-[7px]" />
            <Skeleton className="h-3 w-28" />
          </span>
        </span>
        <Skeleton className="h-9 w-28 rounded-ops-btn" />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-4 overflow-hidden p-5">
        {/* Kalemler — sipariş başına tipik 3-6 satır. */}
        <div className="flex flex-col gap-3">
          <SkeletonCard>
            <Skeleton className="h-3 w-24" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-t border-ops-line-soft pt-2.5 first:border-t-0 first:pt-0">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className={`h-3.5 ${i % 2 === 0 ? 'w-3/5' : 'w-2/5'}`} />
                  <Skeleton className="h-2.5 w-24" />
                </span>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-3 w-28" />
            <SkeletonText lines={3} />
          </SkeletonCard>
        </div>

        {/* Sağ sütun: para kutusu · teslim · durum geçmişi */}
        <div className="flex flex-col gap-3">
          <SkeletonCard>
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </span>
            ))}
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-3 w-24" />
            <SkeletonText lines={2} />
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-3 w-28" />
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-2 w-2 flex-none rounded-full" />
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="ml-auto h-2.5 w-16" />
              </span>
            ))}
          </SkeletonCard>
        </div>
      </div>
    </LoadingRegion>
  );
}
