/**
 * Operasyon anahtarı (switch) — Komponent Envanteri O8 (girdi kontrolleri). Açık = olive dolu ray,
 * kapalı = gri ray. İki boyut: `md` (form/mobil satırı) ve `sm` (varyant tablosu içi). onChange
 * verilmezse salt-görünüm (durum göstergesi) davranır. Etiketli tıklanabilir satır için `ToggleField`.
 */
type ToggleSize = 'sm' | 'md';

const SIZE: Record<ToggleSize, { track: string; knob: string; on: string; off: string }> = {
  md: { track: 'h-[23px] w-10', knob: 'h-[19px] w-[19px]', on: 'left-[19px]', off: 'left-0.5' },
  sm: { track: 'h-5 w-[34px]', knob: 'h-4 w-4', on: 'left-4', off: 'left-0.5' },
};

interface ToggleProps {
  on: boolean;
  onChange?: (next: boolean) => void;
  size?: ToggleSize;
  label?: string;
}

export function Toggle({ on, onChange, size = 'md', label }: ToggleProps) {
  const s = SIZE[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange ? () => onChange(!on) : undefined}
      className={[
        'relative flex-none rounded-full transition-colors',
        s.track,
        on ? 'bg-ops-olive' : 'bg-[#cfd2c9]',
        // onChange'siz = dekoratif (ör. ToggleField içindeki iç anahtar): pointer olaylarını yutMA →
        // hover/tıklama dıştaki tıklanabilir karta geçer, el işareti kaybolmaz.
        onChange ? 'cursor-pointer' : 'pointer-events-none',
      ].join(' ')}
    >
      <span className={['absolute top-0.5 rounded-full bg-white transition-all', s.knob, on ? s.on : s.off].join(' ')} />
    </button>
  );
}

/**
 * Etiketli anahtar satırı — çerçeveli kutu; TÜM satıra (etiket dahil) tıklamak toggle'lar. Formlarda
 * ve mobil hızlı düzenlemede kullanılır. Bir üst kapsayıcı zaten tıklanabilirse (ör. mobil liste satırı
 * sheet açar) `stop` ile olay yayılımı durdurulur.
 */
interface ToggleFieldProps {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  size?: ToggleSize;
  /** Üst kapsayıcının tıklamasını engelle (yayılımı durdur). */
  stop?: boolean;
}

export function ToggleField({ label, on, onChange, size = 'md', stop = false }: ToggleFieldProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        if (stop) e.stopPropagation();
        onChange(!on);
      }}
      className="flex flex-1 cursor-pointer items-center justify-between rounded-[9px] border border-ops-line-strong px-[13px] py-1.5 text-left"
    >
      <span className="font-ops-body text-[12.5px] text-ops-ink">{label}</span>
      {/* İç anahtar salt görsel — tıklama dıştaki button'da işlenir (çift toggle olmasın). */}
      <Toggle on={on} size={size} label={label} />
    </button>
  );
}
