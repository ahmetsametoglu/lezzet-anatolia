import { LoadingRegion } from '@/components/loading-region';
import { SkeletonFilterBar, SkeletonPageHeader, SkeletonRows, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Talepler ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz.
 *
 * İskelet ekranın gerçek iskeletini çiziyor — İKİ SÜTUN: solda kuyruk, sağda detay. Tek sütunluk
 * bir iskelet, yüklenme bitince yerleşimin sıçramasına yol açardı.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Talepler yükleniyor">
      <SkeletonPageHeader actions={['w-[104px]']} />
      <SkeletonFilterBar count={4} />
      <div className="grid min-h-0 flex-1 grid-cols-[330px_1fr] overflow-hidden">
        <div className="min-h-0 overflow-hidden border-r border-ops-line">
          <SkeletonRows rows={7} />
        </div>
        <div className="flex min-h-0 flex-col gap-3 bg-ops-subtle px-5 py-4">
          <SkeletonText lines={3} />
          <SkeletonText lines={4} />
        </div>
      </div>
    </LoadingRegion>
  );
}
