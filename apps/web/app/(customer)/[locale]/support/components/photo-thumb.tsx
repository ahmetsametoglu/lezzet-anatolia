'use client';

import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';

/**
 * Talebe eklenen fotoğrafın küçük resmi, native `TicketPhotoThumb`un ikizi: yeni talep çekmecesinde büyük, yazma kutusunda küçük.
 * Yüklenmişse köşesinde kaldırma düğmesi, yoldaysa bekleme halkası durur; iki yer aynı parçayı kullanır ki görünüm ayrışmasın.
 */
interface PhotoThumbProps {
  size: 'lg' | 'sm';
  /** Tarayıcının yerel önizleme adresi; yoldaki yüklemede yok. */
  preview: string | null;
  /** Resmin adı ya da yükleniyorsa "yükleniyor" cümlesi. */
  label: string;
  removeLabel: string;
  /** Yüklenmiş fotoğrafın kaldırılması; verilmezse fotoğraf yoldadır. */
  onRemove?: () => void;
}

const BOX = { lg: 'size-30', sm: 'size-16' } as const;

export function PhotoThumb({ size, preview, label, removeLabel, onRemove }: PhotoThumbProps) {
  if (onRemove === undefined || preview === null) {
    return (
      <div className={`grid ${BOX[size]} place-items-center rounded-control bg-sand-250`}>
        <LoadingState label={label} labelHidden={size === 'sm'} />
      </div>
    );
  }

  return (
    <div className={`relative ${BOX[size]}`}>
      {/* Önizleme tarayıcının yerel adresi; `next/image` onu işleyemez. */}
      <img src={preview} alt={label} className={`${BOX[size]} rounded-control bg-sand-250 object-cover`} />
      {/* Görünen daire küçük, dokunma alanı 44 px: resmi örtmeden parmakla vurulabilir; koyu, çünkü açık fotoğrafta beyaz kaybolur. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="group absolute -top-1.25 -right-1.25 grid size-11 cursor-pointer place-items-center"
      >
        <span className="grid size-6.5 place-items-center rounded-full bg-ink/60 text-card transition-colors group-hover:bg-ink/80">
          <MobileIcon name="close" size={12} />
        </span>
      </button>
    </div>
  );
}
