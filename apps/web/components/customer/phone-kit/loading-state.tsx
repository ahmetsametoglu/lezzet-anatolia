/*
  Native kitin `LoadingState`inin web telefon ikizi: kum izli halka ve zeytin üst yay, yanında etiket; ekran okuyucuya `role="status"`
  ile etiket konuşur. Native'in üç boyundan yalnız küçüğü çizilir, ötekiler ilk çağıranlarıyla gelir.
*/

interface LoadingStateProps {
  /** "Yükleniyor…" — çeviri çağıranda çözülür. */
  label: string;
  /** Etiket yalnız ekran okuyucuya; halkanın yanına yazının sığmadığı küçük kutularda. */
  labelHidden?: boolean;
}

export function LoadingState({ label, labelHidden = false }: LoadingStateProps) {
  return (
    <span role="status" className="flex items-center justify-center gap-2">
      <span aria-hidden className="size-4.5 animate-spin rounded-full border-[3px] border-sand-300 border-t-olive [animation-duration:800ms]" />
      <span className={labelHidden ? 'sr-only' : 'font-sans text-helper font-semibold text-muted'}>{label}</span>
    </span>
  );
}
