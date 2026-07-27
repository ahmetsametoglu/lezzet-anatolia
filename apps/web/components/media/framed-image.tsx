import type { CSSProperties, ReactNode } from 'react';
import { CROP_CENTER, type ImageCrop } from '@lezzet/types';

/**
 * Çerçeveli görsel — TEK KAYNAK render primitifi (hem müşteri hem operasyon). Görseli verilen orana
 * `aspect-ratio` ile kurulmuş kutuya `object-fit: cover` + ODAK + ZOOM ile oturtur; kırpılmış kopya
 * saklanmaz, tüm çerçeveler aynı kaynaktan bu bileşenle türer (Komponent Envanteri §0B).
 *
 * Kırpma matematiği: `object-position` odağı temel `cover` içinde konumlar; `transform: scale(zoom)` +
 * `transform-origin = odak` odağa yaklaşır. İkisi birlikte dikey/kare bir kaynaktan bile istenen yatay
 * bölgeyi verir — sunucuda görsel işleme gerekmez.
 */
interface FramedImageProps {
  src: string | null;
  alt: string;
  /** Çerçeve oranı (genişlik ÷ yükseklik). `circle` verilirse 1'e zorlanır. */
  ratio: number;
  /** Kırpma künyesi; verilmezse merkez + zoom yok. */
  crop?: ImageCrop;
  /** Tam yuvarlak maske (mobil kategori şeridi) — kırpma yine kare. */
  circle?: boolean;
  /** Görsel yokken gösterilecek içerik (baş harf, ikon…). Verilmezse boş zemin. */
  placeholder?: ReactNode;
  className?: string;
}

function framedImageStyle(crop: ImageCrop = CROP_CENTER): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${crop.x}% ${crop.y}%`,
    transform: crop.zoom > 100 ? `scale(${crop.zoom / 100})` : undefined,
    transformOrigin: `${crop.x}% ${crop.y}%`,
  };
}

export function FramedImage({ src, alt, ratio, crop, circle = false, placeholder, className }: FramedImageProps) {
  return (
    <div
      style={{ aspectRatio: circle ? 1 : ratio }}
      className={[
        'relative grid place-items-center overflow-hidden bg-ops-gray-100 text-ops-gray-700',
        circle ? 'rounded-full' : 'rounded-[10px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? <img src={src} alt={alt} style={framedImageStyle(crop)} /> : placeholder}
    </div>
  );
}
