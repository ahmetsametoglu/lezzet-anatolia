'use client';

import { useRef, useState } from 'react';
import { FramedImage } from '@/components/media/framed-image';
import { RATIO_SOURCE, RATIO_SQUARE } from '@lezzet/types';
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
 * Masaüstü şeridi ana görselin İÇİNDE, sol altta durur (tasarım 20.09) ve beş slotludur; sığmayan
 * görseller son kutuda "+N" olarak toplanır. O kutu bir SAYAÇ DEĞİL, DÜĞMEdir: basınca kalan
 * görseller açılır. Sayaç olarak bırakılmıştı ve altı görselli üründe üç görsel hiçbir şekilde
 * açılamıyordu — "+3" yazan ama içini gösteremeyen bir kutu, olmayan bir vaat.
 */
interface GalleryProps {
  images: StorefrontImage[];
  alt: string;
  /** Mobil kahraman düzeni: kaydırmalı şerit + nokta göstergesi; oran karedir (aşağıdaki künye). */
  compact?: boolean;
  /**
   * Görsel SAYFAYLA BÜTÜNLEŞİK: köşe yuvarlatması yok, kenardan kenara (kullanıcı kararı 20.08 —
   * "resim orada bir kart gibi değil"). Başlıksız detay düzeninin parçası; yalnız kompakt dalda
   * anlamlı çünkü masaüstünde görsel sütunun içinde kart olarak durmaya devam ediyor.
   */
  flush?: boolean;
}

export function Gallery({ images, alt, compact = false, flush = false }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const frame = flush ? '!rounded-none' : '!rounded-card';
  // Mobil kahraman KARE (kullanıcı kararı 20.08, dokuzuncu tur): native ürün ekranının kahramanı
  // tam genişlik × 400 dp — telefon eninde ≈1:1. 3:2 dar ekranda kısa bir bant kalıyordu. 1:1 zaten
  // tanımlı bir çerçeve (`IMAGE_ROLES` sepet karesi) ve operatörün kırpma editörü onu canlı
  // önizliyor — odak/zoom aynı künyeden uygulanır. Masaüstü sütun içinde 3:2 kartta kalır.
  const ratio = compact ? RATIO_SQUARE : RATIO_SOURCE;
  if (images.length === 0) return <FramedImage src={null} alt={alt} ratio={ratio} className={frame} />;

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

  const active = images[activeIndex] ?? images[0]!;
  // Şerit ana görselin İÇİNDE (tasarım, 20.09): görselin altındaki satır sol sütunu ~134 px uzatıyor
  // ve iki sütunun boyunu ayırıyordu. Beş slot sığar; tam sığıyorsa sayaç kutusuna gerek yok
  // ("+0" diye bir şey olmaz), sığmıyorsa son slot düğmeye ayrılır ve bir eksik görsel gösterilir.
  const slots = 5;
  const fits = images.length <= slots;
  const thumbs = expanded || fits ? images : images.slice(0, slots - 1);
  const hidden = images.length - thumbs.length;

  return (
    // Sol sütun 750 px (1360 içerik − 48×2 ped − 470 raf − 44 boşluk); şerit karesi 64 px.
    <div className="relative overflow-hidden rounded-card">
      <FramedImage src={active.url} alt={alt} ratio={RATIO_SOURCE} crop={active.crop} frames={active.frames} sizes="750px" className="!rounded-card" />
      {images.length > 1 && (
        <>
          {/* Karartma yalnız şeridin arkasında: açık zeminli bir fotoğrafta beyaz çerçeveli küçük
              görseller yok oluyordu. Tıklamayı yutmaması için işaretsiz. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-30 bg-gradient-to-b from-transparent to-ink-deep/45" />
          <div className="absolute bottom-3.5 left-3.5 flex items-center gap-2">
            {thumbs.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`${alt} ${i + 1}`}
                aria-pressed={i === activeIndex}
                className={[
                  'w-16 flex-none cursor-pointer overflow-hidden rounded-[8px] border-2 shadow-badge transition-colors',
                  i === activeIndex ? 'border-card ring-2 ring-olive' : 'border-card/50 hover:border-card',
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
                className="w-16 flex-none cursor-pointer rounded-[8px] border-2 border-card/50 bg-ink-deep/78 font-sans text-note font-bold text-cream backdrop-blur-[3px] transition-colors hover:border-card"
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
