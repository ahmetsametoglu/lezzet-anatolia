import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Skeleton, SkeletonLine, SkeletonRows, SkeletonTabs } from '@/components/operation/ui/skeleton';
import { PROCUREMENT_TABS, TAB_LABEL } from './procurement-url';

/**
 * Tedarik ekranının rota düzeyi beklemesi (09.2 deseni). Varsayılan sekme öneri kartlarıdır;
 * iskelet o yerleşimi taklit eder — kart kabuğu + satır çubukları, tablo değil.
 *
 * Başlık GERÇEK `PageHeader`, sekme adları gerçek metin (15.08, emsal: fiyatlar) — eski elle
 * dizilmiş şerit kabuk bloklarını hiç çizmiyordu ve sekmeler adsız çubuktu. Alt satır ile sekme
 * rozetleri VERİDİR, çizilmez; "+ Tedarik siparişi" düğmesi yalnız sipariş sekmesinde var ve
 * hangi sekmede olunduğu URL'den gelir — bilinmediği için eylem yeri de boş bırakılır (eskisi gibi).
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Tedarik yükleniyor">
      <PageHeader title="Tedarik" subtitle={<SkeletonLine className="w-56" />} />
      <SkeletonTabs labels={PROCUREMENT_TABS.map((t) => TAB_LABEL[t])} />

      {/* Öneri kartları — başlıklı kart kabuğu + satırlar. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        <Skeleton className="h-3.5 w-3/4" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-ops-card border border-ops-line">
            <div className="flex items-center gap-3 border-b border-ops-line bg-ops-subtle px-4 py-3">
              <span className="mr-auto flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </span>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <SkeletonRows rows={3} className="px-4 py-2.5" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
