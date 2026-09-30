import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonCard, SkeletonLine, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Ayarlar ekranının rota düzeyi beklemesi; bu dosya olmadan menüden geçişte tarayıcı eski sayfayı bırakır ve tıklama işlemedi
 * sanılır. İskelet varsayılan sekmeyi çizer: sekme bandı, geniş saat kartı ve iki sütun kart.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Ayarlar yükleniyor">
      {/* Başlık gerçek; alt satır ve arama kutusu veriye bağlı, yerlerini aynı ölçüde çubuk tutar. */}
      <PageHeader title="Ayarlar" subtitle={<SkeletonLine className="w-48" />}>
        <Skeleton className={`${CONTROL_H.md} w-[220px] rounded-ops-btn`} />
      </PageHeader>
      <div className="flex items-center gap-6 border-b border-ops-line bg-ops-subtle px-6 py-3.5">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonLine key={i} className="w-24" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-hidden px-6 py-4">
        <SkeletonCard>
          <SkeletonText lines={3} />
        </SkeletonCard>
        <div className="grid grid-cols-2 gap-3.5">
          {[0, 1].map((i) => (
            <SkeletonCard key={i}>
              <SkeletonText lines={4} />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
