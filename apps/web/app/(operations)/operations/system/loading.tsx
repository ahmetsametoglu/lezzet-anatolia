import { LoadingRegion } from '@/components/loading-region';
import { Skeleton, SkeletonCard, SkeletonMetric, SkeletonTable } from '@/components/operation/ui/skeleton';
import { ERROR_COLUMN_TRACKS } from './system-columns';
import { cardClass } from '@/components/operation/ui/card';

/**
 * Sistem ekranının ROTA DÜZEYİ beklemesi (18.5).
 *
 * Beş paralel okuma var (son görüntü · trend penceresi · hata sayfası · sekme sayaçları · en eski
 * kayıt) ve trend penceresi geniş seçilmişse en uzun süren o. Bu dosya olmadan sidebar duruyor, pane
 * bomboş kalıyordu.
 *
 * **Kolon ölçüleri gerçek tablodan** (`ERROR_COLUMN_TRACKS`) — iskelet ile tablo tek kaynağı paylaşır.
 *
 * **SENKRON ve cihaz forku CSS ile**, müşteriler rotasındaki gerekçenin aynısı: (a) `async` bir
 * fallback, React'in Suspense sınırını basmasını geciktirir — beklemeyi gösteren şeyin kendisi
 * beklerdi; (b) UA ile karar veren bir iskelet, mount'ta `matchMedia` ile yeniden karar veren
 * ekranla çakışır ve dar pencerede kabuk baştan değişir. İki kabuk da basılır, `useDevice` ile
 * AYNI eşikte (md = 768px) CSS seçer.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Sistem durumu yükleniyor">
      <DesktopShell />
      <MobileShell />
    </LoadingRegion>
  );
}

function DesktopShell() {
  return (
    <div className="hidden min-h-0 flex-1 flex-col md:flex">
      {/* Kontrol barı — `PageHeader` ölçüsü (px-6 py-4) + canlı göstergesi + iki düğme. */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="mr-auto flex flex-col gap-px">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-64" />
        </span>
        <Skeleton className="h-9 w-[190px] rounded-[7px]" />
        <Skeleton className="h-8 w-20 rounded-ops-btn" />
        <Skeleton className="h-8 w-28 rounded-ops-btn" />
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col gap-[22px] px-6 py-[22px]">
          {/* Hüküm şeridi — İSKELET, ton YOK: hükmü bilmeden renk seçmek, gelen "kritik" haberini bir
              an için sakin göstermek olurdu. Nötr bekler, gelince kendi sesini alır. */}
          <div className="flex flex-wrap items-start gap-[26px] rounded-[12px] border border-ops-gray-300 bg-ops-card px-[22px] py-[18px]">
            <span className="flex min-w-[210px] flex-col gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </span>
            <span className="flex min-w-[260px] flex-1 flex-col gap-2.5">
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="h-10 w-full rounded-[8px]" />
              <Skeleton className="h-10 w-4/5 rounded-[8px]" />
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[18px]">
            <SkeletonCard className="gap-3.5 px-[22px] py-[18px]">
              <Skeleton className="h-4 w-20" />
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline gap-2.5">
                    <Skeleton className="h-3 w-[104px] flex-none" />
                    <Skeleton className="h-3.5 w-32" />
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="w-[104px] flex-none" />
                    <Skeleton className="h-2 flex-1 rounded-[2px]" />
                  </span>
                </span>
              ))}
            </SkeletonCard>
            <SkeletonCard className="gap-3.5 px-[22px] py-[18px]">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-[132px] w-full rounded-[8px]" />
            </SkeletonCard>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[18px]">
            <SkeletonCard className="gap-3.5 px-[22px] py-[18px]">
              <Skeleton className="h-4 w-20" />
              <span className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
                <SkeletonMetric />
                <SkeletonMetric />
                <SkeletonMetric />
              </span>
            </SkeletonCard>
            <SkeletonCard className="gap-3.5 px-[22px] py-[18px]">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-[76px] w-full rounded-[9px]" />
              <Skeleton className="h-3 w-3/4" />
            </SkeletonCard>
          </div>

          <SkeletonCard className="gap-4 px-[22px] py-[18px]">
            <span className="flex items-center gap-3.5">
              <Skeleton className="mr-auto h-4 w-56" />
              <Skeleton className="h-9 w-[280px] rounded-[8px]" />
            </span>
            <span className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex flex-col gap-2.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-[78px] w-full rounded-[6px]" />
                  <Skeleton className="h-2.5 w-4/5" />
                </span>
              ))}
            </span>
          </SkeletonCard>

          <div className={cardClass('flex flex-col')}>
            <span className="flex flex-wrap items-center gap-3.5 px-[22px] py-4">
              <Skeleton className="mr-auto h-4 w-20" />
              <Skeleton className="h-9 w-[170px] rounded-[8px]" />
              <Skeleton className="h-9 w-[250px] rounded-ops-btn" />
            </span>
            <span className="flex gap-2 border-b border-ops-line bg-ops-subtle px-6 py-2.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </span>
            <SkeletonTable tracks={ERROR_COLUMN_TRACKS} rows={6} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileShell() {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:hidden">
      <div className="flex items-center gap-2.5 border-b border-ops-line px-4 py-3.5">
        <Skeleton className="mr-auto h-5 w-20" />
        <Skeleton className="h-6 w-24 rounded-[14px]" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-4 py-3.5">
        <Skeleton className="h-[120px] w-full rounded-[13px]" />
        <Skeleton className="h-3.5 w-28" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col gap-1.5 rounded-[11px] border border-ops-line bg-ops-white px-3 py-2.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className={`h-3.5 ${i % 2 === 0 ? 'w-4/5' : 'w-3/5'}`} />
            <Skeleton className="h-2.5 w-2/5" />
          </span>
        ))}
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-[140px] w-full rounded-[11px]" />
      </div>
    </div>
  );
}
