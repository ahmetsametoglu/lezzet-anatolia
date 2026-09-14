import { Skeleton, SkeletonRegion } from '@/components/customer/ui/skeleton';

/*
  SEPET SATIRLARININ İSKELETİ — TELEFON: native `CartSkeleton`ın (`apps/mobile/src/screens/cart/cart-skeleton.tsx`) web
  ikizi ve `PhoneCartLine`ın kabuğu. Dolgu, ara ve hizalama gerçek satırınki; gri kalan fotoğraf dairesi (56), ad, alt
  satır ve tutar (çubuk boyları satırların gerçek satır kutusu) ve sağdaki sayaç + "kaldır". Paket satırının koyu
  zemini çizilmez: hangi satırın paket olduğu henüz bilinmiyor, yanlış tahmin renkli bir leke bırakırdı.

  Satır sayısı SABİT 3 — native sayıyı cihazdaki sepetten biliyor; web'de girişli müşterinin sepeti sunucuda ve ilk
  okuma bitmeden sayı yok. Rota iskeleti (`loading.tsx`) ile sepetin kendi bekleme karesi (`cart.mobile`) AYNI parçayı
  aynı yerde çizer: sunucudan istemciye, istemciden içeriğe geçişte satırlar kaymaz (talep 11.09: sepet iskeletinin
  titremesi — eski iskelet kart kutuları çiziyordu, gelen satır kutusuzdu).
*/
export function PhoneCartRowsSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-0.5 py-3">
            <Skeleton className="size-14 flex-none !rounded-full" />
            <div className="flex flex-1 flex-col gap-0.5">
              <Skeleton className="h-5.5 w-[68%]" />
              <Skeleton className="h-6 w-[44%]" />
              <Skeleton className="mt-0.5 h-5.5 w-[30%]" />
            </div>
            <div className="flex flex-none flex-col items-center gap-2.5">
              <Skeleton className="h-8.5 w-22.5 !rounded-control" />
              <Skeleton className="h-5 w-10" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
