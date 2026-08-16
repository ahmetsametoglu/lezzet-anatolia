import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { buttonClass } from '@/components/operation/ui/button';
import { SkeletonBlock, SkeletonCard, SkeletonLine, SkeletonText } from '@/components/operation/ui/skeleton';

/**
 * Depolar ekranının ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakıyor ve operatör tıklamanın işlediğini anlamıyor.
 *
 * **Tek görünüme uyduruldu (16.08):** ekran artık liste ↔ kart diye ikiye ayrılmıyor, o yüzden
 * iskelet de tek düzeni çiziyor — tesis şeridi üstte, seçili tesisin bölümleri altta. Eski hâli
 * dört kartlık bir liste çiziyordu ve gelen ekranda öyle bir liste artık yok: yanlış bir yerleşim
 * vaat etmek, beklemeyi ikinci kez ödetir.
 *
 * Başlıktaki depo seçicisi burada da GİZLİ (`hideWarehousePicker`) — iskelette görünüp sayfa
 * gelince kaybolan bir kontrol, ekranın oynadığını gösterirdi.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Depolar yükleniyor">
      {/* Başlık ve "+ Depo" eylemi GERÇEK (15.08, emsal: fiyatlar/para) — ikisi de statik; eylem
          tıklanmaz süs (`buttonClass`lı span), davranışı sayfayla gelir. Seçili tesisin ADI ise
          çubuk: hangisinin açılacağını iskelet bilemez. */}
      <PageHeader title="Depolar" subtitle={<SkeletonLine className="w-56" />} hideWarehousePicker>
        <span className={buttonClass({ variant: 'primary' })}>+ Depo</span>
      </PageHeader>

      {/* Tesis şeridi — gerçek şeritle aynı yükseklikte, üç kutu. */}
      <div className="flex flex-none flex-col gap-2 border-b border-ops-line bg-ops-subtle px-6 py-3">
        <SkeletonLine className="w-72" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-[52px] w-[168px]" />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-hidden px-6 py-[18px]">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i}>
            <SkeletonText lines={2} />
          </SkeletonCard>
        ))}
      </div>
    </LoadingRegion>
  );
}
