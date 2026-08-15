import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { CONTROL_H } from '@/components/operation/ui/control';
import { Skeleton, SkeletonMetric, SkeletonRows, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { TAB_LABEL } from './reports-labels';
import { REPORT_TABS } from './reports-url';

/**
 * Raporlar yükleme hâli (09.2) — statik kimlik gerçek, yalnız veri iskelet (15.08, emsal: fiyatlar).
 *
 * Başlık GERÇEK `PageHeader` (kabuk blokları `OpsShellProvider`'dan); alt başlık ve başlıktaki ay
 * seçici/karşılaştırma düğmesi VERİDİR (seçili ay URL'den gelir) — çubuk kalırlar. Eski hâlde
 * `SkeletonPageHeader actions`'a genişlik sınıfı yerine METİN verilmişti ('Temmuz 2026') — geçersiz
 * class, çubuklar sıfır genişlikte kalıyor ve hiç görünmüyordu.
 *
 * Sekme adları gerçek metin (`REPORT_TABS` + `TAB_LABEL` — gerçek çubuğun okuduğu kaynak). Rol
 * nüansı bilinçli göze alındı: muhasebeci yalnız "Dışa aktarım" görür ve onun için bar içerik
 * gelince daralır — ama bu, eski 4 eş çubuk için de aynen geçerliydi (o da 4 sekme vaat ediyordu);
 * yaygın hâl (admin, 4 sekme) için artık doğru adlar görünüyor. Rozet çizilmez: okunmamış sayı.
 *
 * Kabuk sınıfları `LoadingRegion`'da ZORUNLU (flex zinciri dersi) — eski hâl sınıfsızdı: iskelet
 * zemin rengini almıyor, paneli kaplamıyordu.
 */
export default function ReportsLoading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Raporlar yükleniyor">
      {/* Ay seçici (`Select` field kipi) + "↳ geçen aya göre" düğmesinin yer tutucuları. */}
      <PageHeader title="Raporlar" subtitle={<Skeleton className="h-3 w-56" />}>
        <Skeleton className={`${CONTROL_H.md} w-36 rounded-ops-btn`} />
        <Skeleton className={`${CONTROL_H.md} w-36 rounded-ops-btn`} />
      </PageHeader>
      <SkeletonTabs labels={REPORT_TABS.map((t) => TAB_LABEL[t])} />

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
