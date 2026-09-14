import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';

/*
  ÖDEME SEÇENEKLERİNİN İSKELETİ — TELEFON: native `CheckoutSkeleton`ın (`apps/mobile/src/screens/checkout/checkout-skeleton.tsx`)
  web ikizi. Seçenekler sunucudan gelirken ÜÇ bölümün yerini tutar — teslimat adresi · teslimat yolu · ödeme yolu; her
  bölüm üstbaşlık + iki seçenek satırı ("en az makul": teslimatta iki yol, ödemede en az iki yöntem — fazlasını çizmek
  cevap gelince satır kaybettirirdi). Satırın KABUĞU gerçek (`OptionRow`un dolgusu, köşesi, boştaki çerçevesi); çubuklar
  gerçek satır kutuları (başlık `control`, alt satır `body-sm`). Tutar özeti burada DEĞİL: ekran onu beklerken de çiziyor.

  Rota iskeleti (`loading.tsx`) ile ekranın kendi bekleme karesi AYNI parçayı çizer — sepetin iskeletiyle aynı karar:
  sunucudan istemciye, istemciden içeriğe geçişte bölümler kaymaz.
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
