import { detectDevice } from '@/lib/device';
import { Skeleton, SkeletonBlock, SkeletonCard, SkeletonRegion, SkeletonText } from '@/components/customer/ui/skeleton';

/**
 * Sepetin ROTA düzeyinde ilk karesi (Next `loading.tsx`).
 *
 * İki ayrı bekleme var ve ikisi de doldurulmalı: sunucu render'ı (bu dosya) ve ondan sonra sepetin
 * istemcide okunması (`CartSkeleton`). Yalnız ikincisini doldurmak, ilk beklemede bomboş bir sayfa
 * bırakıyordu — müşteri önce boşluğa, sonra iskelete, sonra içeriğe bakıyordu.
 *
 * Cihaz forku BURADA DA geçerli (ADR Sapma 3): `md:` ile akışkan bir iskelet yazmak yerine ölçü
 * sunucudan gelen ipucuyla seçilir — yoksa telefonda iki sütunluk bir iskelet çizip içerik gelince
 * tek sütuna düşerdi.
 */
export default async function CartLoading() {
  const compact = (await detectDevice()) === 'mobile';

  return (
    <SkeletonRegion>
      <div className={compact ? 'flex flex-col gap-3 px-4 py-4' : 'grid grid-cols-[1.6fr_1fr] items-start gap-10 px-12 pt-9 pb-12'}>
        <div className="flex flex-col gap-3.5">
          {!compact && <Skeleton className="h-9 w-52" />}
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} compact={compact} className="!flex-row items-center gap-4">
              <SkeletonBlock className={compact ? 'size-16 flex-none' : 'size-20 flex-none'} />
              <div className="flex flex-1 flex-col gap-2.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
              <Skeleton className={compact ? 'h-4 w-14' : 'h-4 w-20'} />
            </SkeletonCard>
          ))}
        </div>
        {!compact && (
          <SkeletonCard>
            <Skeleton className="h-5 w-32" />
            <SkeletonText lines={3} />
            <Skeleton className="mt-2 h-11 w-full rounded-pill" />
          </SkeletonCard>
        )}
      </div>
    </SkeletonRegion>
  );
}
