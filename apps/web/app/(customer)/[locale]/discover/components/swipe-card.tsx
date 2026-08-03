'use client';

import { useRef, useState } from 'react';
import { RATIO_SOURCE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import type { DiscoverCard } from '@/lib/feedback/discover';

/**
 * Keşif kartı — kaydırmanın kendisi (tasarım: `Musteri - Kesif.dc.html`).
 *
 * **Kart eğilerek parmağı takip eder, eşik altında yerine döner** (etkileşim sözleşmesi). Eğim
 * geri bildirimin kendisi: müşteri bıraktığında ne olacağını, bırakmadan önce görür. Sabit bir kart
 * "kaydırılabilir" olduğunu ancak alt satırdaki yazıyla söyleyebilirdi.
 *
 * **Pointer olayları kullanılıyor, touch/mouse ayrı ayrı değil:** aynı jest hem parmakla hem fareyle
 * çalışsın diye (tasarım web'de de kaydırmayı çiziyor, üstelik klavye ayrıca var). `setPointerCapture`
 * şart — parmak kartın dışına taşınca olaylar kesilirse kart yolun ortasında asılı kalır.
 *
 * **Görsel oranı `RATIO_SOURCE` (3:2)** — tasarımın `aspect-ratio:3/2` değeri ve kaynak görsellerin
 * doğal oranı; ayrı bir sayı yazmak aynı oranı ikinci kez tanımlamak olurdu.
 */
interface SwipeCardProps {
  card: DiscoverCard;
  /** Eşiği geçen kaydırma — yön karara döner. */
  onVote: (vote: 'like' | 'dislike') => void;
  /** Oy gönderilirken jest kapalı: iki kart birden geçmesin. */
  busy: boolean;
  compact: boolean;
}

/**
 * Karar eşiği (px). Küçük olsaydı kartı okumak için hafifçe iten müşteri oy vermiş olurdu; büyük
 * olsaydı jest zahmete dönerdi. 96 px, en dar telefonda bile kart genişliğinin dörtte birinden az.
 */
const THRESHOLD = 96;

export function SwipeCard({ card, onVote, busy, compact }: SwipeCardProps) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);

  function end() {
    if (startX.current === null) return;
    startX.current = null;
    if (Math.abs(dx) >= THRESHOLD) onVote(dx > 0 ? 'like' : 'dislike');
    // Karar verilse de verilmese de kart yerine döner: karar verildiyse zaten yeni kart gelecek,
    // verilmediyse tasarımın istediği "yerine döner" davranışı bu.
    setDx(0);
  }

  return (
    <div
      // Dikey kaydırma serbest kalmalı (`touch-pan-y`): kart yatay jesti alır, sayfa dikeyi.
      className="relative touch-pan-y select-none"
      onPointerDown={(e) => {
        if (busy) return;
        startX.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (startX.current === null) return;
        setDx(e.clientX - startX.current);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* Arkadaki ikinci kart — destenin devam ettiğini söyleyen tek işaret (tasarım). Sayı
          göstermiyoruz; "kaç kart kaldı" bilgisi başlıktaki sayaçta zaten var. */}
      {/* Gölge kademeleri Tailwind'in kendi ölçeğinden (`md`/`lg`): yüzeyde gölge TOKEN'ı yok ve
          tasarımın rgba değerlerini ham yazmak envanterin renk kuralını deler. İki kademe farkı,
          çizimin istediği "öndeki kart daha yüksekte" etkisini veriyor. */}
      <div className="absolute inset-x-2 top-2.5 bottom-[-8px] rounded-[24px] bg-card shadow-md" aria-hidden />
      <article
        className="relative flex flex-col overflow-hidden rounded-[24px] bg-card shadow-lg"
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 18}deg)`,
          // Sürüklerken geçiş YOK (parmağı anında takip etmeli), bırakınca yerine yumuşak döner.
          transition: startX.current === null ? 'transform 200ms ease-out' : undefined,
        }}
      >
        <FramedImage src={card.image.url} alt={card.name} ratio={RATIO_SOURCE} crop={card.image.crop} className="!rounded-none" />
        <div className={`flex flex-col gap-1.5 ${compact ? 'px-5 pt-4.5 pb-5.5' : 'px-5.5 py-4.5'}`}>
          <h2 className={`font-serif ${compact ? 'text-card-title' : 'text-h2-sm'} text-ink`}>{card.name}</h2>
          {card.description && (
            <p className="font-sans text-body-sm leading-relaxed text-body">{card.description}</p>
          )}
        </div>
      </article>
    </div>
  );
}
