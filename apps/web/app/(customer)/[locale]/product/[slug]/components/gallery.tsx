'use client';

import { useRef, useState } from 'react';
import { FramedImage } from '@/components/media/framed-image';
import type { StorefrontImage } from '@lezzet/application';

/**
 * Ürün galerisi — ana görsel + küçük görsel şeridi. Küçüğe dokunmak ana görseli değiştirir.
 *
 * Tek görselli üründe şerit HİÇ gösterilmez: tek seçenekli bir seçici, seçenek olmadığını gizler.
 * Kırpma künyesi her görselde kendi odağını taşır (`FramedImage`) — kapak için verilen odak, ek
 * görselin odağı yerine geçmez.
 *
 * İKİ AYRI ETKİLEŞİM (tasarımın kararı, `Galeri` etkileşim sözleşmesi):
 *   masaüstü → küçük görsel şeridi; birine tıklamak ana görseli değiştirir
 *   mobil    → yatay KAYDIRMA + nokta göstergesi; parmak zaten kaydırıyor, ayrıca küçük görsele
 *              basmak dokunmatikte hem küçük hedef hem gereksiz bir adım
 *
 * Masaüstü şeridi tek sıra ve dört sütundur; sığmayan görseller son kutuda "+N" olarak toplanır.
 * O kutu bir SAYAÇ DEĞİL, DÜĞMEdir: basınca kalan görseller açılır. Sayaç olarak bırakılmıştı ve
 * altı görselli üründe üç görsel hiçbir şekilde açılamıyordu — "+3" yazan ama içini gösteremeyen
 * bir kutu, olmayan bir vaat. Tasarım bu kutunun davranışını yazmıyor; sığdığı yerde kalan en sade
 * çözüm şeridi büyütmek (yeni bir katman/ışık kutusu açmak değil).
 */
interface GalleryProps {
  images: StorefrontImage[];
  alt: string;
  /** Mobilde şerit daha dar; ana görselin oranı iki biçimde de aynı kalır (tasarım 3/2). */
  compact?: boolean;
}

const RATIO = 3 / 2;

export function Gallery({ images, alt, compact = false }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  if (images.length === 0) return <FramedImage src={null} alt={alt} ratio={RATIO} className="!rounded-card" />;

  if (compact) {
    /**
     * Etkin görsel kaydırma KONUMUNDAN türer, ayrı bir state'ten değil: parmak ve noktalar tek
     * gerçeğe bakar, birbirinden kayamaz.
     *
     * Ölçü, slaytların GERÇEK konumundan okunur (`offsetLeft`), `scrollLeft / clientWidth`
     * bölmesinden değil: slaytlar arasında boşluk var, o bölme boşluğu saymadığı için birkaç
     * slayt sonra bir tam kayar. Merkeze en yakın slayt kazanır.
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
              <FramedImage src={img.url} alt={i === 0 ? alt : ''} ratio={RATIO} crop={img.crop} className="!rounded-card" />
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

  const active = images[activeIndex] ?? images[0]!;
  const columns = 4;
  // Tam sığıyorsa sayaç kutusuna gerek yok — dört görsel dört slota girer, "+0" diye bir şey olmaz.
  // Sığmıyorsa son slot düğmeye ayrılır, o yüzden bir eksik görsel gösterilir.
  const fits = images.length <= columns;
  const thumbs = expanded || fits ? images : images.slice(0, columns - 1);
  const hidden = images.length - thumbs.length;

  return (
    <div className="flex flex-col gap-3">
      <FramedImage src={active.url} alt={alt} ratio={RATIO} crop={active.crop} className="!rounded-card" />
      {images.length > 1 && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`${alt} +${hidden}`}
              className="cursor-pointer rounded-soft border-2 border-transparent bg-sand-100 font-sans text-body-sm font-bold text-muted transition-colors hover:border-sand-400 hover:text-ink"
              style={{ aspectRatio: RATIO }}
            >
              +{hidden}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
