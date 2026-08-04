import { LoadingRegion } from '@/components/loading-region';
import { SkeletonMetric, SkeletonPageHeader, SkeletonRows, SkeletonTabs } from '@/components/operation/ui/skeleton';

// Raporlar yükleme hâli — iskelet GERÇEK ekranın iskeleti: başlık, sekme barı, üç ölçü ve tablo.
// Sekme etiketleri çubuk değil gerçek metin olsaydı iyi olurdu ama sekmelerin kaçının çizileceği
// role bağlı (muhasebeci yalnız export görür) ve sunucu cevabı gelmeden bilinmiyor.

export default function ReportsLoading() {
  return (
    <LoadingRegion label="Raporlar yükleniyor">
      <SkeletonPageHeader actions={['Temmuz 2026', '↳ geçen aya göre']} />
      <SkeletonTabs count={4} />

      <div className="grid grid-cols-3 border-b border-ops-line-soft bg-ops-surface-sunken px-6 py-3.5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="px-4">
            <SkeletonMetric boxed={false} />
          </div>
        ))}
      </div>

      <SkeletonRows rows={8} />
    </LoadingRegion>
  );
}
