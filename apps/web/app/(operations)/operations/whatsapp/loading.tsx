import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonFilterBar, SkeletonLine, SkeletonRows, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * WhatsApp ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz.
 *
 * İskelet ekranın gerçek iskeletini çiziyor — ÜÇ SÜTUN: kuyruk, sohbet, müşteri bağlamı. Daha az
 * sütunlu bir iskelet, yüklenme bitince yerleşimin sıçramasına yol açardı.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="WhatsApp konuşmaları yükleniyor">
      {/* Başlık GERÇEK (15.08, emsal: fiyatlar); alt satır sayaçtır — veridir, çubuk kalır. */}
      <PageHeader title="WhatsApp" subtitle={<SkeletonLine className="w-64" />}>
        {/* "+ Elle DM" gerçekte `sm` (32px). */}
        <Skeleton className={`${CONTROL_H.sm} w-[120px] rounded-ops-btn`} />
      </PageHeader>
      <SkeletonFilterBar count={2} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Genişlik ekranın kendisiyle AYNI olmak zorunda (330 px): iskelet dar kalırsa yüklenme
            bitince yerleşim sıçrar — bu dosyanın var oluş sebebinin tam tersi. */}
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
