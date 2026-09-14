import { focusRingClass } from './button';
import { chipToneClass } from './filter-controls';

/**
 * Seçim çipi — DURUM tutan düğme (v1 adres penceresi, 13.09): ülke (Fransa | Almanya) ve "Bu adres
 * ne?" (Ev · İş · Diğer). `FilterChip`in kardeşi, rengi onunla aynı tablodan (`chipToneClass`); fark
 * biçimde: süzgeç çipi bir BAĞLANTI (seçim URL'de yaşar), bu bir DÜĞME (seçim formun durumunda) ve
 * seçiliğini `aria-pressed` ile söyler.
 *
 * İki ölçü v1'den: `segment` satırı eşit paylaşan seçenek (ülke — 13,5px, 10px ped) · `choice` yan
 * yana kısa seçenekler (Ev · İş · Diğer — 13px, 9/18 ped).
 */
type ChoiceChipSize = 'segment' | 'choice';

const SIZE: Record<ChoiceChipSize, string> = {
  segment: 'flex-1 py-2.5 text-center text-control',
  choice: 'px-4.5 py-2.25 text-note font-bold',
};

interface ChoiceChipProps {
  label: string;
  active: boolean;
  onSelect: () => void;
  size?: ChoiceChipSize;
}

export function ChoiceChip({ label, active, onSelect, size = 'choice' }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={['cursor-pointer rounded-pill border-[1.5px] font-sans whitespace-nowrap transition-colors', focusRingClass, SIZE[size], chipToneClass('neutral', active)].join(' ')}
    >
      {label}
    </button>
  );
}
