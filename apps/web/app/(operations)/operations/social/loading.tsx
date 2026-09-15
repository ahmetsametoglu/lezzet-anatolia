import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonFilterBar, SkeletonLine, SkeletonRows, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Bu dosya olmadan raydan geçişte tarayıcı eski sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz. İskelet ekranın üç
 * sütununu gerçek genişlikleriyle çizer ki yüklenme bitince yerleşim sıçramasın.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Sosyal mesajlar yükleniyor">
      {/* Başlık sabit metindir; alt satır sayaç olduğu için çubukla bekler. */}
      <PageHeader title="Sosyal Mesajlar" subtitle={<SkeletonLine className="w-64" />}>
        <Skeleton className={`${CONTROL_H.sm} w-[120px] rounded-ops-btn`} />
      </PageHeader>
      <SkeletonFilterBar count={2} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 w-[330px] flex-none overflow-hidden border-r border-ops-line">
          <SkeletonRows rows={7} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 bg-ops-subtle px-5 py-4">
          <SkeletonText lines={3} />
          <SkeletonText lines={4} />
        </div>
        <div className="flex min-h-0 w-[232px] flex-none flex-col gap-3 border-l border-ops-line bg-ops-subtle px-4 py-3.5">
          <SkeletonText lines={5} />
        </div>
      </div>
    </LoadingRegion>
  );
}
