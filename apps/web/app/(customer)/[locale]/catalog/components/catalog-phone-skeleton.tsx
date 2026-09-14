import { LoadingRegion } from '@/components/loading-region';

/*
  KATALOG İSKELETİ — native `CatalogSkeleton`ın (`apps/mobile/src/screens/catalog/catalog-skeleton.tsx`) web
  telefon ikizi: kare kartlar (köşe `card`, zemin `sand-300` — native iskeletin varsayılan tonu), ızgara
  boşlukları gerçek listeyle aynı (satır 20 · sütun 14 · yan 22 · üst 20).

  · "Yükleniyor…" yalnız ekran okuyucuda (native 09.08: nabız zaten "bekleniyor" diyor, ekranda ikinci kez
    yazmak gürültü); sesi iki yüzeyin tek sarmalayıcısı verir (`LoadingRegion`).
  · Ekranı doldurur: kap ekran boyunda ve taşan son satırı kırpar — liste gelince ekran zıplamaz (native 09.08).
  · Web'de ilk yük sunucuda çözülür; iskelet YALNIZ süzgeç ve arama geçişinde çizilir (native'de her süzgeç
    değişimi bir ilk yüktür, web'de bir sayfa geçişi).
*/

interface CatalogPhoneSkeletonProps {
  /** "Yükleniyor…" — ekranda değil, ekran okuyucuda. */
  label: string;
}

export function CatalogPhoneSkeleton({ label }: CatalogPhoneSkeletonProps) {
  return (
    <LoadingRegion label={label} className="grid h-dvh grid-cols-2 content-start gap-x-3.5 gap-y-5 overflow-hidden px-5.5 pt-5">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} aria-hidden className="block aspect-square animate-pulse rounded-card bg-sand-300" />
      ))}
    </LoadingRegion>
  );
}
