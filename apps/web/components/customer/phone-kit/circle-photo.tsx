import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';

/*
  DAİRE FOTOĞRAF — native kitin `CirclePhoto`sunun web ikizi (14.09): fotoğraf varsa fotoğraf, yoksa
  baş harf. Görsel varken çizim `FramedImage`in (CDN kesiti ve odak tek yerde, `sizes` dairenin gerçek
  çapından); görsel yokken daire kendi zeminini ve baş harfini çizer — `FramedImage`in yer tutucusu
  operasyonun gri zeminindedir, vitrinin kum tonunda değil.
*/

interface CirclePhotoProps {
  image: CatalogImage | null | undefined;
  initial: string;
  /** Çap (px) — tarayıcı kesitin basamağını bu ölçüyle seçer. */
  size: number;
  /** Baş harfin kademesi ve rengi — dairenin bağlamına göre (ürün, fırsat, bant). */
  initialClassName?: string;
  /** Görselsiz dairenin zemini — bant dairesi bandın tonunun bir tık koyusudur (`bg-scrim-soft`). */
  emptyClassName?: string;
  className?: string;
}

export function CirclePhoto({
  image,
  initial,
  size,
  initialClassName = 'text-h1-sm text-muted',
  emptyClassName = 'bg-sand-300',
  className,
}: CirclePhotoProps) {
  const box = { width: size, height: size };
  if (image && image.url !== null) {
    return (
      <span style={box} className={['block flex-none', className].filter(Boolean).join(' ')}>
        <FramedImage
          src={image.url}
          crop={image.crop}
          frames={image.frames}
          sizes={`${size}px`}
          ratio={1}
          circle
          alt=""
          className="h-full w-full"
        />
      </span>
    );
  }
  return (
    <span
      style={box}
      aria-hidden
      className={['grid flex-none place-items-center rounded-full font-serif font-semibold', emptyClassName, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={initialClassName}>{initial}</span>
    </span>
  );
}
