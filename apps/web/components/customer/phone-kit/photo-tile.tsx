import type { ComponentProps, ReactNode } from 'react';
import type { CatalogImage } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';

/*
  FOTOĞRAF KARTI — native kitin `PhotoTile`ının web ikizi (14.09): büyük görsel + altında koyulaşan
  skrim + üstünde yazı. Tarif kartı (220×280) ve hazır paket kartı (tam genişlik × 172) aynı kurgu.

  Skrim tasarımın `photo-bottom` geçişi: şeffaf %40 → `scrim-heavy` — durakları örtü ailesinin
  token'larından (`ink-deep/0` · `scrim-heavy`), ham renk yazılmadı.

  SOLMA FOTOĞRAFA UYGULANIR, BİLGİYE DEĞİL (native 10.08): rozet ve künye solan grubun DIŞINDA durur;
  kart solduğunda sebebini söyleyen cümle ("bu adrese gönderemiyoruz") okunur kalmalı.
*/

interface PhotoTileProps {
  href: ComponentProps<typeof Link>['href'];
  /** Ekran okuyucu adı — kartın içindeki metin görsel katmanda duruyor. */
  label: string;
  image: CatalogImage;
  /** Fotoğraf yokken çizilen baş harf. */
  initial: string;
  /** Kutunun ölçüsü — ray kartı sabit genişlik (`w-[220px] h-[280px]`), liste kartı sütunu doldurur. */
  className: string;
  /** Kutunun oranı (genişlik ÷ yükseklik) — CDN çerçevesi bununla seçilir. */
  ratio: number;
  /** Kutunun ekranda kapladığı genişlik — tarayıcı basamağı bununla seçer. */
  sizes: string;
  /** Sol üst köşedeki rozet yuvası (tarifin süresi, "Tükendi"). */
  topBadge?: ReactNode;
  /** Fotoğrafı soldur — kart bugün bir satın alma değil bir bilgi. */
  dimmed?: boolean;
  children: ReactNode;
}

export function PhotoTile({ href, label, image, initial, className, ratio, sizes, topBadge, dimmed = false, children }: PhotoTileProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={[
        'relative block flex-none cursor-pointer overflow-hidden rounded-card transition-transform hover:opacity-95 active:scale-[0.98]',
        className,
      ].join(' ')}
    >
      <span className={['absolute inset-0 block', dimmed ? 'opacity-45' : ''].filter(Boolean).join(' ')}>
        {image.url !== null ? (
          <FramedImage
            src={image.url}
            crop={image.crop}
            frames={image.frames}
            sizes={sizes}
            ratio={ratio}
            alt=""
            className="h-full w-full"
          />
        ) : (
          <span className="grid h-full place-items-center bg-sand-300 font-serif text-h1-sm text-terracotta">{initial}</span>
        )}
        <span className="absolute inset-0 bg-linear-to-b from-ink-deep/0 from-40% to-scrim-heavy" />
      </span>
      {topBadge !== undefined && <span className="absolute top-2.5 left-2.5">{topBadge}</span>}
      <span className="absolute inset-x-3.5 bottom-3 block">{children}</span>
    </Link>
  );
}
