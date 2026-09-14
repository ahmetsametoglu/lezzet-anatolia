import { detectDevice } from '@/lib/device';
import { Skeleton, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';
import { PhoneCheckoutSkeleton } from './components/phone-checkout-skeleton';

/**
 * Checkout'un ROTA düzeyinde ilk karesi (Next `loading.tsx`).
 *
 * Sunucu burada kimliği çözüyor (oturum + profil); ardından istemci sepeti ve adım verisini
 * okuyor. Üç beklemenin ilki buradaydı ve bomboştu — sayfa "yükleniyor" bile demeden duruyordu.
 *
 * Metin YOK ve olmamalı: dil bağlamı bu karede henüz kurulu değil, uydurma bir başlık yazmaktansa
 * yalnız ölçüyü tutmak doğru. Adım numaraları da bu yüzden burada çizilmez — onlar adım verisi
 * beklerken görünür (`CheckoutStepsSkeleton`), orada dil elimizde.
 *
 * Telefon dalı ekranın kendi bekleme karesiyle AYNI parçaları çizer (14.09 — native ödeme ekranının ikizi): başlık
 * çubuğunun kabuğu gerçek (krem cam, mürekkep alt çizgi), bölümler `PhoneCheckoutSkeleton`, altında tutar özetinin
 * paneli. Sunucudan istemciye geçişte bölümler kaymaz.
 */
export default async function CheckoutLoading() {
  const compact = (await detectDevice()) === 'mobile';

  if (compact) {
    return (
      <SkeletonRegion>
        <div className="flex items-center gap-2.5 border-b-[1.5px] border-ink bg-sand-50/96 px-3.5 py-2">
          <Skeleton className="size-10 flex-none !rounded-full" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex flex-col gap-4 px-4.5 pt-4.5">
          <Skeleton className="h-8 w-3/4" />
          <PhoneCheckoutSkeleton />
          <Skeleton className="h-40 w-full !rounded-control" />
        </div>
      </SkeletonRegion>
    );
  }

  const steps = (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i}>
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
    <SkeletonCard>
      <Skeleton className="h-5 w-36" />
      <SkeletonText lines={4} />
      <Skeleton className="mt-2 h-12 w-full rounded-pill" />
    </SkeletonCard>
  );

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
