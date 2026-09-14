import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';

/*
  DİKDÖRTGEN FOTOĞRAF YÜZEYİ — native kitin iç ilkeli `PhotoSurface`ın (`apps/mobile/src/screens/customer-kit/
  photo-surface.tsx`) web telefon ikizi (14.09): "fotoğraf varsa fotoğraf, yoksa kum zeminde terracotta baş harf" ve
  isteğe bağlı alt skrim tek nüsha burada. İki çağıranı var: `PhotoTile` (basılabilir tam kart — tarif ve vitrin
  paket kartı) ve paket listesi kartının fotoğraf bölgesi. Orada basılabilir olan fotoğraf + altındaki gövdenin
  TAMAMI; iç içe iki bağ doğmasın diye tile kullanılmaz (native'in aynı kararı).

  · Konum, ölçü ve solma ÇAĞIRANDAN (`className`): yüzey kendi boyunu bilmez. Kendi taşıdığı tek görünüm kararı
    KIRPMA — fotoğraf kabın köşesinden taşamaz; görselin kendi köşesi yok (`!rounded-none`), köşeyi kap verir.
  · Skrim tasarımın `photo-bottom` geçişi: şeffaf %40 → `scrim-heavy` (örtü ailesinin token'ları). Yazısı olmayan
    fotoğrafta çizilmez — gereksiz karartma fotoğrafı kirletir.
*/

interface PhotoSurfaceProps {
  image: CatalogImage;
  /** Fotoğraf yokken çizilen baş harf. */
  initial: string;
  /** Kutunun oranı (genişlik ÷ yükseklik) — CDN çerçevesi bununla seçilir. */
  ratio: number;
  /** Kutunun ekranda kapladığı genişlik — tarayıcı basamağı bununla seçer. */
  sizes: string;
  /** Alt kenarı karartan geçiş — üstünde yazı duracaksa. */
  scrim?: boolean;
  /** Konum + ölçü + solma. Skrim bu kutuya yerleşir, yani kutu konumlu olmalı (`absolute`). */
  className: string;
}

export function PhotoSurface({ image, initial, ratio, sizes, scrim = false, className }: PhotoSurfaceProps) {
  return (
    <span className={['block overflow-hidden bg-sand-300', className].join(' ')}>
      {image.url === null ? (
        <span className="grid h-full place-items-center font-serif text-h1-sm text-terracotta">{initial}</span>
      ) : (
        <FramedImage
          src={image.url}
          crop={image.crop}
          frames={image.frames}
          sizes={sizes}
          ratio={ratio}
          alt=""
          className="h-full w-full !rounded-none"
        />
      )}
      {scrim && <span className="absolute inset-0 bg-linear-to-b from-ink-deep/0 from-40% to-scrim-heavy" />}
    </span>
  );
}
