/*
  YÜKLENİYOR HALKASI — native kitin `LoadingState`inin (`packages/mobile-kit/src/components/ui/loading-state.tsx`)
  web telefon ikizi: kum izli halka + zeytin üst yay, 800 ms'de bir tur (native `spinDurationMs`), yanında
  etiket (`helper`, 600, soluk). Ekran okuyucuya `role="status"` — halkanın kendisi sessiz, etiket konuşur.

  Native'in üç boyundan yalnız küçüğü (18, liste sonu) çiziliyor; ötekiler ilk çağıranlarıyla gelir.
*/

interface LoadingStateProps {
  /** "Yükleniyor…" — çeviri çağıranda çözülür. */
  label: string;
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <span role="status" className="flex items-center justify-center gap-2">
      <span aria-hidden className="size-4.5 animate-spin rounded-full border-[3px] border-sand-300 border-t-olive [animation-duration:800ms]" />
      <span className="font-sans text-helper font-semibold text-muted">{label}</span>
    </span>
  );
}
