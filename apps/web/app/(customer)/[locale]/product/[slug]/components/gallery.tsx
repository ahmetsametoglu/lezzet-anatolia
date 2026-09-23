'use client';

import { useState } from 'react';
import { FramedImage } from '@/components/media/framed-image';
import { Icon } from '@/components/customer/ui/icons';
import { RATIO_SOURCE } from '@lezzet/types';
import type { StorefrontImage } from '@lezzet/application';
import { useGalleryAutoplay } from './use-gallery-autoplay.hook';

/**
 * Ürün galerisi (masaüstü): ana görsel ve içindeki küçük görsel şeridi; tek görselli üründe şerit hiç çizilmez. Sığmayan görseller
 * son kutuda "+N" olarak toplanır ve o kutu düğmedir, basınca kalanlar açılır.
 */
interface GalleryProps {
  images: StorefrontImage[];
  alt: string;
  /** Ana görselin iki yanındaki geçiş düğmelerinin erişilebilir adı. */
  labels: { previous: string; next: string };
}

export function Gallery({ images, alt, labels }: GalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const autoplay = useGalleryAutoplay(images.length);
  if (images.length === 0) return <FramedImage src={null} alt={alt} ratio={RATIO_SOURCE} className="!rounded-card" />;

  const current = autoplay.index;
  const active = images[current] ?? images[0]!;
  // Tam sığıyorsa sayaç kutusu yok; sığmıyorsa son slot düğmeye ayrılır ve bir eksik görsel gösterilir.
  const slots = 5;
  const fits = images.length <= slots;
  const thumbs = expanded || fits ? images : images.slice(0, slots - 1);
  const hidden = images.length - thumbs.length;
  // Otomatik geçiş şeritte görünmeyen bir görsele de gelir; o an seçili görünen "+N" kutusudur.
  const activeHidden = current >= thumbs.length;

  return (
    // Sol sütun 750 px (1360 içerik − 48×2 ped − 470 raf − 44 boşluk); şerit karesi 64 px.
    <div
      className="group relative overflow-hidden rounded-card"
      onMouseEnter={() => autoplay.setHeld(true)}
      onMouseLeave={() => autoplay.setHeld(false)}
      onFocus={() => autoplay.setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) autoplay.setHeld(false);
      }}
    >
      {/* Anahtar görsele bağlı: her geçişte kare yeniden doğar ve solarak gelir. */}
      <FramedImage
        key={current}
        src={active.url}
        alt={alt}
        ratio={RATIO_SOURCE}
        crop={active.crop}
        frames={active.frames}
        sizes="750px"
        className="!rounded-card animate-fade-in motion-reduce:animate-none"
      />
      {images.length > 1 && (
        <>
          <GalleryArrow side="left" label={labels.previous} onClick={() => autoplay.go(current - 1)} />
          <GalleryArrow side="right" label={labels.next} onClick={() => autoplay.go(current + 1)} />
          {/* Karartma yalnız şeridin arkasında: açık zeminli bir fotoğrafta beyaz çerçeveli küçük
              görseller yok oluyordu. Tıklamayı yutmaması için işaretsiz. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-30 bg-gradient-to-b from-transparent to-ink-deep/45" />
          <div className="absolute bottom-3.5 left-3.5 flex items-center gap-2">
            {thumbs.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => autoplay.go(i)}
                aria-label={`${alt} ${i + 1}`}
                aria-pressed={i === current}
                className={[
                  'w-16 flex-none cursor-pointer overflow-hidden rounded-[8px] border-2 shadow-badge transition-colors',
                  i === current ? 'border-card ring-2 ring-olive' : 'border-card/50 hover:border-card',
                ].join(' ')}
              >
                <FramedImage src={img.url} alt="" ratio={RATIO_SOURCE} crop={img.crop} frames={img.frames} sizes="64px" className="!rounded-none" />
              </button>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`${alt} +${hidden}`}
                className={[
                  'w-16 flex-none cursor-pointer rounded-[8px] border-2 bg-ink-deep/78 font-sans text-note font-bold text-cream backdrop-blur-[3px] transition-colors',
                  activeHidden ? 'border-card ring-2 ring-olive' : 'border-card/50 hover:border-card',
                ].join(' ')}
                style={{ aspectRatio: RATIO_SOURCE }}
              >
                +{hidden}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface GalleryArrowProps {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}

/**
 * Ana görselin kenarındaki geçiş düğmesi; fare görselin üstüne gelince belirir, klavye odağında da görünür kalır. Görsel
 * üstünde yüzen öteki öğelerin dili: kart rengi zemin ve rozet gölgesi.
 */
function GalleryArrow({ side, label, onClick }: GalleryArrowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        'absolute top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-card/90 text-ink shadow-badge backdrop-blur-[3px]',
        'opacity-0 transition-opacity group-hover:opacity-100 hover:bg-card focus-visible:opacity-100',
        side === 'left' ? 'left-3.5' : 'right-3.5',
      ].join(' ')}
    >
      <Icon name={side === 'left' ? 'arrowLeft' : 'arrowRight'} size={18} strokeWidth={2.2} />
    </button>
  );
}
