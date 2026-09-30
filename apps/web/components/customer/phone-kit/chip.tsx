/*
  Native `Chip`in web telefon ikizi: seçili zeytin dolgu, seçilmemiş mürekkep çerçeve. Düğmedir, bağlantı değil; seçililik ekran
  okuyucuya `aria-pressed` ile gider ve gezinme yüzeyi olduğu için titremez.
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
      data-haptic="off"
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
