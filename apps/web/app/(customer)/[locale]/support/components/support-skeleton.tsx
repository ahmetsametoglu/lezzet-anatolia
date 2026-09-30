import { LoadingRegion } from '@/components/loading-region';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';
import { TICKET_CARD_SHELL } from './phone-ticket-card';

/*
  Taleplerin yükleme iskeletleri; liste ve yazışma rotası aynı parçaları kullanır. Ölçüler native iskeletlerden, başlık çubuğu
  iskelete girmez: geri yolu bekleme boyunca da açık kalmalı.
*/

/** Yazışma iki yanlıdır; tek yana yaslı balonlar sohbeti tek taraflı bir liste gibi okuturdu. */
const BUBBLE_SIDES = [false, true, false];

export function PhoneTicketsSkeleton() {
  return (
    <SkeletonRegion>
      <div className="flex flex-col gap-2.5 px-4.5 pt-4.5 pb-7.5">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className={TICKET_CARD_SHELL}>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <PhoneSkeleton tone="deep" className="h-4 w-[64%]" />
              <PhoneSkeleton tone="deep" className="h-3.5 w-[86%]" />
            </div>
            <PhoneSkeleton tone="deep" radius="control" className="h-6 w-[22%] flex-none" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** Yazışmanın gövdesi ve yazma çubuğu; başlık çubuğunu sayfa çizer. */
export function PhoneTicketThreadSkeleton() {
  return (
    <>
      {/* Kap yükseklik zincirinin halkası: yazışma kalan alanı doldurur, yazma çubuğu dipte durur. */}
      <LoadingRegion className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 py-4.5">
        <PhoneSkeleton className="h-3 w-[52%]" />
        {BUBBLE_SIDES.map((mine, index) => (
          <div key={index} className={['flex', mine ? 'justify-end' : 'justify-start'].join(' ')}>
            <PhoneSkeleton
              tone={mine ? 'deep' : 'default'}
              radius="control"
              className={`h-[50px] ${index === 1 ? 'w-[62%]' : 'w-[78%]'}`}
            />
          </div>
        ))}
      </LoadingRegion>
      <div className="flex flex-none items-end gap-2 border-t border-sand-200 bg-sand-50 px-4.5 py-2.5">
        <PhoneSkeleton className="h-12.5 min-w-0 flex-1" />
        <PhoneSkeleton className="size-11.5 flex-none" />
      </div>
    </>
  );
}

/** Masaüstünde liste ve yazışma iki bölme; iki rota da aynı düzeni açar. */
export function DesktopSupportSkeleton() {
  return (
    <LoadingRegion className="grid h-full min-h-0 grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-2.5 border-r border-sand-300 p-4.5">
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="flex flex-col gap-2 rounded-[14px] border border-sand-200 bg-card px-3.5 py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-col gap-3 px-6 py-4.5">
        <div className="flex items-center justify-between gap-3 border-b border-sand-200 pb-2.5">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-6 w-24 !rounded-pill" />
        </div>
        {BUBBLE_SIDES.map((mine, index) => (
          <div key={index} className={['flex', mine ? 'justify-end' : 'justify-start'].join(' ')}>
            <Skeleton className={`h-14 !rounded-soft ${index === 1 ? 'w-[46%]' : 'w-[58%]'}`} />
          </div>
        ))}
        <Skeleton className="mt-auto h-24 w-full !rounded-soft" />
      </div>
    </LoadingRegion>
  );
}
