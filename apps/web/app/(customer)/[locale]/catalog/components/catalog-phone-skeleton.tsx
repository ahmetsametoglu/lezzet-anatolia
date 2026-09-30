import { LoadingRegion } from '@/components/loading-region';

/*
  Katalog ızgarasının telefon iskeleti, native `CatalogSkeleton`ın ikizi: kare kartlar ve ızgara boşlukları gerçek listeyle aynı.
  Ekranı doldurup taşan satırı kırpar ki liste gelince ekran zıplamasın; "Yükleniyor…" yalnız ekran okuyucuya gider.
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
