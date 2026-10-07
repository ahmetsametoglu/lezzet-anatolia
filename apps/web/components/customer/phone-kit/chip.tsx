/*
  Native `Chip`in web telefon ikizi: seçili zeytin dolgu, seçilmemiş mürekkep çerçeve. Düğmedir, bağlantı değil; seçililik ekran
  okuyucuya `aria-pressed` ile gider ve gezinme yüzeyi olduğu için titremez.
*/

interface ChipProps {
  /** Çip metni — çeviri çağıranda çözülür. */
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Satırı paylaşan seçenek (ülke gibi): çipler eşit pay alır ve native'in alan boyuna oturur. */
  grow?: boolean;
}

export function Chip({ label, selected, onClick, grow = false }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-haptic="off"
      aria-pressed={selected}
      className={[
        'cursor-pointer rounded-control border py-2 font-sans text-control whitespace-nowrap transition-[opacity,scale] active:scale-[0.97]',
        grow ? 'min-h-12.5 flex-1 px-2' : 'flex-none px-4',
        selected ? 'border-olive bg-olive text-card' : 'border-ink text-ink hover:opacity-70',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
