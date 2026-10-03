import { detectDevice } from '@/lib/device';
import { Skeleton, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';

/**
 * Onay sayfasının yükleme karesi: olmasaydı sipariş verildikten sonraki geçişte üst segmentin, yani ödeme formunun iskeleti
 * görünürdü. Kare onay ekranının yerleşimini taşır ki içerik gelince öğeler yerinden oynamasın.
 */
export default async function ConfirmationLoading() {
  if ((await detectDevice()) === 'mobile') {
    return (
      <SkeletonRegion>
        <div className="flex flex-col items-center gap-3.5 px-7.5 pt-17.5">
          <Skeleton className="size-23 flex-none !rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <SkeletonCard className="w-full">
            <SkeletonText lines={3} />
          </SkeletonCard>
          <Skeleton className="mt-2 h-12 w-full rounded-pill" />
          <Skeleton className="h-12 w-full rounded-pill" />
        </div>
      </SkeletonRegion>
    );
  }

  const card = (
    <SkeletonCard>
      <Skeleton className="h-5 w-32" />
      <SkeletonText lines={2} />
    </SkeletonCard>
  );

  return (
    <SkeletonRegion>
      <div className="mx-auto w-full max-w-[1360px] px-12 pt-9">
        <Skeleton className="h-28 w-full !rounded-card" />
      </div>
      <div className="mx-auto grid w-full max-w-[1360px] grid-cols-[1.5fr_1fr] items-start gap-10 px-12 py-9">
        <div className="flex flex-col gap-5.5">
          <div className="grid grid-cols-2 gap-4.5">
            {card}
            {card}
          </div>
          <SkeletonCard>
            <SkeletonText lines={4} />
          </SkeletonCard>
        </div>
        <SkeletonCard>
          <Skeleton className="h-5 w-36" />
          <SkeletonText lines={4} />
        </SkeletonCard>
      </div>
    </SkeletonRegion>
  );
}
