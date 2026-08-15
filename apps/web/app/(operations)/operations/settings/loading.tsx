import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Ayarlar ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakıyor ve operatör tıklamanın işlediğini anlamıyor.
 *
 * İskelet AYAR LİSTESİ hâlini çiziyor: varsayılan sekme bir ayar grubudur, personel sekmesine
 * yalnız açık bir tıklamayla gidilir.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Ayarlar yükleniyor">
      {/* Başlık GERÇEK (15.08, emsal: fiyatlar); alt satır sayaçtır — veridir, çubuk kalır.
          Tek "aksiyon" arama kutusudur: yerini aynı genişlikte çubuk tutar. */}
      <PageHeader title="Ayarlar" subtitle={<Skeleton className="h-3 w-72" />}>
        <Skeleton className={`${CONTROL_H.md} w-[220px] rounded-ops-btn`} />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-6 py-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i}>
            <SkeletonText lines={2} />
          </SkeletonCard>
        ))}
      </div>
    </LoadingRegion>
  );
}
