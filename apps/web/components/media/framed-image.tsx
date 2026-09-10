import type { CSSProperties, ReactNode } from 'react';
import { CROP_CENTER, frameKeyForRatio, type ImageCrop } from '@lezzet/types';
import type { ImageFrameSources } from '@lezzet/application';

/**
 * Çerçeveli görsel — TEK KAYNAK render primitifi (hem müşteri hem operasyon). Görseli verilen orana
 * `aspect-ratio` ile kurulmuş kutuya `object-fit: cover` + ODAK + ZOOM ile oturtur; kırpılmış kopya
 * saklanmaz, tüm çerçeveler aynı kaynaktan bu bileşenle türer (Komponent Envanteri §0B).
 *
 * Kırpma matematiği: `object-position` odağı temel `cover` içinde konumlar; `transform: scale(zoom)` +
 * `transform-origin = odak` odağa yaklaşır. İkisi birlikte dikey/kare bir kaynaktan bile istenen yatay
 * bölgeyi verir. CDN türevi varsa (05.37) aynı kadrajı Cloudflare keser ve kutuya yakın ölçüde gönderir;
 * CSS yolu o zaman yalnız yedektir.
 */
interface FramedImageBase {
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

/**
 * CDN türevleri ve `sizes` BİRLİKTE gelir; tip bunu zorlar, varsayılan yok.
 *
 * `frames` (05.37): çerçeveye en yakın adlı kesitin `src`/`srcSet`i çizilir — görsel ZATEN kadrajlı ve
 * ölçülü gelir, CSS odak/zoom uygulanmaz (uygulansaydı iki kez kesilirdi). `null` ise CSS yolu: aynı
 * kare, tam boy dosyadan.
 *
 * `sizes`: kutunun ekranda kaç CSS pikseli kapladığı — tarayıcı basamağı bununla ve piksel oranıyla
 * seçer. **Zorunlu, çünkü varsayılanı sessizce en pahalısıdır** (ölçüldü 10.09): `sizes` yokken tarayıcı
 * görselin ekranın tamamı kadar olduğunu varsayıyordu ve 56 px'lik malzeme küçük resmi de 301 px'lik
 * ürün kartı da masaüstünde 1600, telefonda 1200 px'lik basamağı alıyordu. Değer çağıranın
 * yerleşiminden gelir: sabit kutu px, akışkan ızgara vw.
 */
type FramedImageProps = FramedImageBase &
  ({ frames?: undefined; sizes?: undefined } | { frames: ImageFrameSources | null | undefined; sizes: string });

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

export function FramedImage({ src, alt, ratio, crop, frames, sizes, circle = false, placeholder, className }: FramedImageProps) {
  const kesit = frames?.[frameKeyForRatio(circle ? 1 : ratio)] ?? null;
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
      {kesit ? (
        <img src={kesit.src} srcSet={kesit.srcSet} sizes={sizes} alt={alt} style={framedImageStyle()} />
      ) : src ? (
        <img src={src} alt={alt} style={framedImageStyle(crop)} />
      ) : (
        placeholder
      )}
    </div>
  );
}
