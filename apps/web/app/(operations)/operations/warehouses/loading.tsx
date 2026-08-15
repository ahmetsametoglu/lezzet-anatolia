import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { buttonClass } from '@/components/operation/ui/button';
import { Skeleton, SkeletonCard, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Depolar ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakıyor ve operatör tıklamanın işlediğini anlamıyor.
 *
 * İskelet LİSTE hâlini çiziyor, kart hâlini değil: adresinde seçim olmayan giriş olağan yoldur
 * (raydan gelinir), kartın iki bölmeli düzenini çizmek beklerken yanlış bir yerleşim vaat ederdi.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Depolar yükleniyor">
      {/* Başlık ve "+ Depo" eylemi GERÇEK (15.08, emsal: fiyatlar/para) — ikisi de statik; eylem
          tıklanmaz süs (`buttonClass`lı span), davranışı sayfayla gelir. Alt satır sayaç, çubuk. */}
      <PageHeader title="Depolar" subtitle={<Skeleton className="h-3 w-56" />}>
        <span className={buttonClass({ variant: 'primary' })}>+ Depo</span>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-6 py-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i}>
            <SkeletonText lines={2} />
          </SkeletonCard>
        ))}
      </div>
    </LoadingRegion>
  );
}
