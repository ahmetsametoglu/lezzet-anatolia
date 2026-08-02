import { LoadingRegion } from '@/components/loading-region';
import { Skeleton, SkeletonRows } from '@/components/operation/ui/skeleton';

/**
 * Tedarik ekranının rota düzeyi beklemesi (09.2 deseni). Varsayılan sekme öneri kartlarıdır;
 * iskelet o yerleşimi taklit eder — kart kabuğu + satır çubukları, tablo değil.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Tedarik yükleniyor">
      {/* Başlık şeridi — `PageHeader` ölçüsü. */}
      <header className="flex flex-wrap items-center gap-3.5 border-b border-ops-line px-6 py-4">
        <span className="mr-auto flex flex-col gap-px">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-56" />
        </span>
      </header>

      {/* Sekme çubuğu — 3 sekme, `Tabs` ölçüsü. */}
      <div className="flex gap-0.5 border-b border-ops-line bg-ops-subtle px-6">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="px-3.5 py-[11px]">
            <Skeleton className="h-4 w-24" />
          </span>
        ))}
      </div>

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
