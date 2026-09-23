'use client';

import { useRef, useState } from 'react';
import { FramedImage } from '@/components/media/framed-image';
import { Icon } from '@/components/customer/ui/icons';
import { RATIO_SOURCE, RATIO_SQUARE } from '@lezzet/types';
import type { StorefrontImage } from '@lezzet/application';
import { useGalleryAutoplay } from './use-gallery-autoplay.hook';

/**
 * Ürün galerisi: masaüstünde ana görsel ve içindeki küçük görsel şeridi, telefonda yatay kaydırma ve nokta göstergesi; tek
 * görselli üründe şerit hiç çizilmez. Sığmayan görseller son kutuda "+N" olarak toplanır ve o kutu düğmedir, basınca kalanlar açılır.
 */
interface GalleryProps {
  images: StorefrontImage[];
  alt: string;
  /** Ana görselin iki yanındaki geçiş düğmelerinin erişilebilir adı. */
  labels: { previous: string; next: string };
  /** Telefon düzeni: kaydırmalı şerit ve nokta göstergesi, oran kare. */
  compact?: boolean;
  /** Görsel sayfayla bütünleşik, köşesiz ve kenardan kenara; yalnız telefon dalında anlamlı. */
  flush?: boolean;
}

export function Gallery({ images, alt, labels, compact = false, flush = false }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Otomatik geçiş yalnız masaüstü dalında; telefonda görseli parmak kaydırıyor.
  const autoplay = useGalleryAutoplay(compact ? 0 : images.length);
  const track = useRef<HTMLDivElement>(null);
  const frame = flush ? '!rounded-none' : '!rounded-card';
  // Telefonda kare, çünkü native ürün ekranının kahramanı telefon eninde ≈1:1 ve kırpma editörü o çerçeveyi önizliyor.
  const ratio = compact ? RATIO_SQUARE : RATIO_SOURCE;
  if (images.length === 0) return <FramedImage src={null} alt={alt} ratio={ratio} className={frame} />;

  if (compact) {
    /**
     * Etkin görsel kaydırma konumundan türer ki parmak ve noktalar tek gerçeğe baksın. Ölçü slaytların gerçek konumundan
     * okunur, çünkü aradaki boşluğu saymayan `scrollLeft / clientWidth` bölmesi birkaç slayt sonra bir tam kayar.
     */
    const onScroll = () => {
      const el = track.current;
      if (!el) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      const slides = Array.from(el.children) as HTMLElement[];
      let nearest = 0;
      let best = Infinity;
      slides.forEach((slide, i) => {
        const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
        if (distance < best) {
          best = distance;
          nearest = i;
        }
      });
      setActiveIndex(nearest);
    };
    return (
      <div className="relative">
        {/* Slaytlar arasında boşluk ŞART: bitişik olunca geçiş sırasında iki fotoğraf tek bir
            görüntü gibi birleşiyor, hangisinin nerede bittiği anlaşılmıyor. Boşluk, kaydırmanın
            iki ayrı görsel arasında olduğunu söyler. */}
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img, i) => (
            <div key={i} className="w-full flex-none snap-center">
              <FramedImage src={img.url} alt={i === 0 ? alt : ''} ratio={ratio} crop={img.crop} frames={img.frames} sizes="100vw" className={frame} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={['size-2 rounded-full', i === activeIndex ? 'bg-olive' : 'bg-card/80'].join(' ')} />
            ))}
          </div>
        )}
      </div>
    );
  }

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
