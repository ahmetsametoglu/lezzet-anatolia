'use client';

import { useRef, useState } from 'react';
import { RATIO_SQUARE, type CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';

/*
  FOTOĞRAF GALERİSİ — native `PhotoGallery`nin (`apps/mobile/src/components/ui/photo-gallery.tsx`) web telefon
  ikizi (14.09): ürün detayının kahramanı. Kutuyu çağıran verir (tam genişlik × 400); galeri onu doldurur,
  degrade · yüzen düğmeler · rozetler çağıranda kalır ve şeridin üstünde çizilir.

  · Üç hâl native'inki: hiç görsel yok → kum zeminde baş harf · tek görsel → düz görsel, şerit ve gösterge
    YOK (tek noktalı gösterge bilgi taşımaz) · çok görsel → yatay kaydırma (sayfa sınırına oturur,
    `scroll-snap`) + nokta göstergesi. Karolar arasında boşluk yok (native `pagingEnabled`).
  · Adressiz ve tekrarlanan görsel elenir: boş karo çizilmez, aynı fotoğraf iki karo olmaz.
  · Noktalar native'in dili (onboarding `ob.dots`): etkin 24 · sönük 8 · yükseklik 5; etkin terracotta,
    sönük fotoğraf üstü krem cam (`sand-50/90` — native `cream-glass-soft`). Sıra dekoratif, karo kendi
    sırasını söylüyor.
  · Kesit kare (`RATIO_SQUARE`): kutu telefon eninde ≈1:1 (390 × 400).
*/

type ShownPhoto = CatalogImage & { url: string };

interface PhotoGalleryProps {
  images: readonly CatalogImage[];
  /** İlk karonun metni — arama motoru ve ekran okuyucu için ürünün adı. */
  alt: string;
  /** Öteki karoların etiketi ("Ürün görseli {n} / {total}") — çağıranın sözlüğünden. */
  photoLabel: string;
  /** Görsel yokken kum zeminde çizilen baş harf. */
  initial: string;
}

export function PhotoGallery({ images, alt, photoLabel, initial }: PhotoGalleryProps) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const photos = images.filter(
    (image, index): image is ShownPhoto => image.url !== null && images.findIndex((other) => other.url === image.url) === index,
  );

  if (photos.length === 0) {
    return (
      <span aria-hidden className="grid size-full place-items-center bg-sand-300 font-serif text-h1-sm text-on-image-soft">
        {initial}
      </span>
    );
  }

  const labelOf = (index: number) =>
    index === 0 ? alt : photoLabel.replace('{n}', String(index + 1)).replace('{total}', String(photos.length));
  const frameOf = (photo: ShownPhoto, index: number) => (
    <FramedImage
      src={photo.url}
      alt={labelOf(index)}
      ratio={RATIO_SQUARE}
      crop={photo.crop}
      frames={photo.frames}
      sizes="100vw"
      className="h-full w-full !rounded-none"
    />
  );

  const single = photos[0];
  if (photos.length === 1 && single !== undefined) return frameOf(single, 0);

  // Etkin karo kaydırma KONUMUNDAN okunur — parmak ve noktalar tek gerçeğe bakar, ayrı bir sayaç kaymaz.
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== active) setActive(index);
  };

  return (
    <div className="relative size-full">
      <div
        ref={track}
        onScroll={onScroll}
        className="flex size-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, index) => (
          <div key={photo.url} className="h-full w-full flex-none snap-center">
            {frameOf(photo, index)}
          </div>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {photos.map((photo, index) => (
          <span key={photo.url} className={['h-1.25 rounded-full', index === active ? 'w-6 bg-terracotta' : 'w-2 bg-sand-50/90'].join(' ')} />
        ))}
      </div>
    </div>
  );
}
