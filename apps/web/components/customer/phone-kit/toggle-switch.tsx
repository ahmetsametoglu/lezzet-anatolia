/*
  AÇMA/KAPAMA ANAHTARI — native `ToggleSwitch`in (`apps/mobile/src/screens/customer-kit/toggle-switch.tsx`)
  web telefon ikizi (14.09): 50×30 yol (açık zeytin, kapalı `sand-500`), 24'lük kart beyazı topuz, topuzun
  yükseklik gölgesi (`shadow-soft`), topuz kenardan (30 − 24) / 2 = 3 içeride.

  Durum ekran okuyucuya `role="switch"` + `aria-checked` ile gider; native kit bu rolü henüz tanımıyor
  (orada `selected`), web'de doğrudan var.
*/

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  /** Neyin açılıp kapandığı — çeviri çağıranda çözülür. */
  label: string;
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={[
        'flex h-7.5 w-12.5 flex-none cursor-pointer items-center rounded-full px-0.75 transition-colors active:scale-[0.97]',
        checked ? 'justify-end bg-olive' : 'justify-start bg-sand-500',
      ].join(' ')}
    >
      <span className="size-6 rounded-full bg-card shadow-soft" />
    </button>
  );
}
