import { Skeleton, SkeletonBlock, SkeletonRegion } from '@/components/customer/ui/skeleton';
import type { Messages } from '../cart-types';

/**
 * Sepetin ilk karesi. Sepet sunucuda okunamıyor (ziyaretçininki tarayıcıda yaşıyor), yani bir
 * bekleme anı KAÇINILMAZ — sorun onu nasıl doldurduğumuzdu: boş bir `40vh` blok bırakılıyordu ve
 * sayfa veri gelince bir anda aşağı doğru açılıyordu.
 *
 * İskelet gerçek yerleşimin ölçüsünü taşır (sol kalemler, sağ özet): gelen içerik zıplamasın.
 */
export function CartSkeleton({ t, compact = false }: { t: Messages; compact?: boolean }) {
  const lines = [0, 1, 2];

  if (compact) {
    return (
      <SkeletonRegion label={t.title}>
        <div className="flex flex-col gap-3 px-4 py-4">
          {lines.map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-card border border-sand-200 bg-card px-3 py-3">
              <SkeletonBlock className="size-16 flex-none" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    );
  }

  return (
    <SkeletonRegion label={t.title}>
      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-10 px-12 pt-9 pb-12">
        <div className="flex flex-col gap-3.5">
          <Skeleton className="h-9 w-52" />
          {lines.map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-card border border-sand-200 bg-card px-4 py-4">
              <SkeletonBlock className="size-20 flex-none" />
              <div className="flex flex-1 flex-col gap-2.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-card px-6 py-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-2 h-11 w-full rounded-pill" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
