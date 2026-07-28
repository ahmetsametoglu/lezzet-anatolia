import { detectDevice } from '@/lib/device';
import { Skeleton, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';

/**
 * Checkout'un ROTA düzeyinde ilk karesi (Next `loading.tsx`).
 *
 * Sunucu burada kimliği çözüyor (oturum + profil); ardından istemci sepeti ve adım verisini
 * okuyor. Üç beklemenin ilki buradaydı ve bomboştu — sayfa "yükleniyor" bile demeden duruyordu.
 *
 * Metin YOK ve olmamalı: dil bağlamı bu karede henüz kurulu değil, uydurma bir başlık yazmaktansa
 * yalnız ölçüyü tutmak doğru. Adım numaraları da bu yüzden burada çizilmez — onlar adım verisi
 * beklerken görünür (`CheckoutStepsSkeleton`), orada dil elimizde.
 */
export default async function CheckoutLoading() {
  const compact = (await detectDevice()) === 'mobile';

  const steps = (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} compact={compact}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-[30px] flex-none rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <SkeletonText lines={2} />
        </SkeletonCard>
      ))}
    </div>
  );

  const summary = (
    <SkeletonCard compact={compact}>
      <Skeleton className="h-5 w-36" />
      <SkeletonText lines={4} />
      <Skeleton className="mt-2 h-12 w-full rounded-pill" />
    </SkeletonCard>
  );

  if (compact) {
    return (
      <SkeletonRegion>
        <div className="flex flex-col gap-3.5 px-4 py-5">
          {steps}
          {summary}
        </div>
      </SkeletonRegion>
    );
  }

  return (
    <SkeletonRegion>
      <div className="mx-auto w-full max-w-[1180px]">
        {/* Başlık çubuğu: ayraç gerçek, içi iskelet — çubuk sayfanın iskeletinin bir parçası. */}
        <div className="flex items-center gap-9 border-b border-sand-200 px-12 py-4.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="ml-auto h-4 w-28" />
        </div>
        <div className="grid grid-cols-[1.5fr_1fr] items-start gap-10 px-12 pt-9 pb-12">
          {steps}
          {summary}
        </div>
      </div>
    </SkeletonRegion>
  );
}
