/*
  ÇİP — native kitin `Chip`inin (`packages/mobile-kit/src/components/ui/chip.tsx`) web telefon ikizi (14.09).
  Seçim çifti tasarımda sabit: seçili = zeytin dolgu + kart beyazı metin + zeytin çerçeve; seçilmemiş =
  dolgusuz + mürekkep metin + mürekkep çerçeve. Köşe kontrol kademesi (16), yazı `control` (13,5/700).

  Düğmedir, bağlantı değil: seçim sayfayı bir geçişle yeniler ve bekleme hâlini çağıran çizer (katalogun
  iskeleti). Seçililik ekran okuyucuya `aria-pressed` ile gider — renk farkı ulaşmaz.
*/

interface ChipProps {
  /** Çip metni — çeviri çağıranda çözülür. */
  label: string;
  selected: boolean;
  onClick: () => void;
}

export function Chip({ label, selected, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'flex-none cursor-pointer rounded-control border px-4 py-2 font-sans text-control whitespace-nowrap transition-[opacity,scale] active:scale-[0.97]',
        selected ? 'border-olive bg-olive text-card' : 'border-ink text-ink hover:opacity-70',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
