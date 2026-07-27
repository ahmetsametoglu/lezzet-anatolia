'use client';

import { useState } from 'react';
import { FramedImage } from '@/components/media/framed-image';
import type { StorefrontImage } from '@/lib/storefront/storefront-types';

/**
 * Ürün galerisi — ana görsel + küçük görsel şeridi. Küçüğe dokunmak ana görseli değiştirir.
 *
 * Tek görselli üründe şerit HİÇ gösterilmez: tek seçenekli bir seçici, seçenek olmadığını gizler.
 * Kırpma künyesi her görselde kendi odağını taşır (`FramedImage`) — kapak için verilen odak, ek
 * görselin odağı yerine geçmez.
 */
interface GalleryProps {
  images: StorefrontImage[];
  alt: string;
  /** Mobilde şerit daha dar; ana görselin oranı iki biçimde de aynı kalır (tasarım 3/2). */
  compact?: boolean;
}

const RATIO = 3 / 2;

/** Şeritte en çok kaç küçük görsel — fazlası "+N" kutusunda toplanır (tasarım dörtlü ızgara). */
const THUMB_LIMIT = 3;

export function Gallery({ images, alt, compact = false }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  if (images.length === 0) return <FramedImage src={null} alt={alt} ratio={RATIO} className="!rounded-card" />;

  const active = images[activeIndex] ?? images[0]!;
  const thumbs = images.slice(0, THUMB_LIMIT);
  const overflow = images.length - thumbs.length;

  return (
    <div className="flex flex-col gap-3">
      <FramedImage src={active.url} alt={alt} ratio={RATIO} crop={active.crop} className="!rounded-card" />
      {images.length > 1 && (
        <div className={['grid gap-2.5', compact ? 'grid-cols-3' : 'grid-cols-4'].join(' ')}>
          {thumbs.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`${alt} ${i + 1}`}
              aria-pressed={i === activeIndex}
              className={[
                'cursor-pointer overflow-hidden rounded-soft transition-colors',
                i === activeIndex ? 'border-2 border-olive' : 'border-2 border-transparent hover:border-sand-400',
              ].join(' ')}
            >
              <FramedImage src={img.url} alt="" ratio={RATIO} crop={img.crop} />
            </button>
          ))}
          {overflow > 0 && (
            <span className="grid place-items-center rounded-soft bg-sand-100 font-sans text-body-sm font-bold text-muted">+{overflow}</span>
          )}
        </div>
      )}
    </div>
  );
}
