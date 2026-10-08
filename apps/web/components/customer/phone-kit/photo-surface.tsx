import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';

/*
  Native `PhotoSurface`ın web telefon ikizi: fotoğraf yoksa kum zeminde baş harf, isteğe bağlı alt skrim; konum ve ölçü çağırandan, yüzey
  yalnız kırpar. Solma yalnız fotoğrafa uygulanır, skrim ve üstündeki yazı solmaz, yoksa yazı okunmaz olurdu.
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
  /** Paket bu adrese gelmiyorsa fotoğraf solar. */
  faded?: boolean;
  /** Konum ve ölçü. Skrim bu kutuya yerleşir, yani kutu konumlu olmalı (`absolute`). */
  className: string;
}

export function PhotoSurface({ image, initial, ratio, sizes, scrim = false, faded = false, className }: PhotoSurfaceProps) {
  return (
    <span className={['block overflow-hidden bg-sand-300', className].join(' ')}>
      {image.url === null ? (
        <span className={['grid h-full place-items-center font-serif text-h1-sm text-terracotta', faded ? 'opacity-45' : ''].join(' ')}>
          {initial}
        </span>
      ) : (
        <FramedImage
          src={image.url}
          crop={image.crop}
          frames={image.frames}
          sizes={sizes}
          ratio={ratio}
          alt=""
          className={['h-full w-full !rounded-none', faded ? 'opacity-45' : ''].join(' ')}
        />
      )}
      {scrim && <span className="absolute inset-0 bg-linear-to-b from-ink-deep/0 from-40% to-scrim-heavy" />}
    </span>
  );
}
