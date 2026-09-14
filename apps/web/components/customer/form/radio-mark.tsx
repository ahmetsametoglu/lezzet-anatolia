/**
 * Seçim halkası — kayıtlı adres kartlarının solundaki yuvarlak (v1: 17px halka, seçiliyken 8px
 * zeytin nokta). Masaüstü yer panelinin kartı ile mobil çekmecenin satırı aynı işareti taşır;
 * iki kopya olsaydı biri renk ya da ölçü değiştirdiğinde ötekisi eski kalırdı.
 *
 * Yalnız GÖRSEL: seçim durumunu ekran okuyucuya kartın kendisi söyler (`aria-pressed`).
 */
interface RadioMarkProps {
  selected: boolean;
}

export function RadioMark({ selected }: RadioMarkProps) {
  return (
    <span
      aria-hidden
      className={['mt-0.5 grid size-[17px] flex-none place-items-center rounded-full border-2 bg-card', selected ? 'border-olive' : 'border-sand-400'].join(' ')}
    >
      <span className={['size-2 rounded-full', selected ? 'bg-olive' : 'bg-transparent'].join(' ')} />
    </span>
  );
}
