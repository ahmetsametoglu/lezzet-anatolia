import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';

/*
  Seçenek bölümü başına iki satır çizilir, çünkü fazlası cevap gelince satır kaybettirir. Kabuk `OptionRow`un ölçüleriyle çizilir ki rota
  iskeleti (`loading.tsx`) ile ekranın kendi bekleme karesi arasında bölümler kaymasın.
*/
export function PhoneCheckoutSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((section) => (
          <div key={section} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-[34%]" />
            {[0, 1].map((option) => (
              <div key={option} className="flex flex-col gap-0.5 rounded-control border-[1.5px] border-sand-400 px-4 py-3">
                <Skeleton className="h-5.5 w-[62%]" />
                <Skeleton className="h-6 w-[86%]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
