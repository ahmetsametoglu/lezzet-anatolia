/**
 * Segment seçici — Komponent Envanteri O8 (girdi kontrolleri). İki+ seçenekli, tek seçim; aktif olive
 * dolu, pasif çerçeveli. KDV, tarih tipi gibi kısa kapalı listeler için (Select açılır listeden farklı,
 * seçenekler hep görünür). Salt sunum — seçili durum çağıranda.
 */
interface SegmentProps<T extends string> {
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}

export function Segment<T extends string>({ value, options, onChange, className }: SegmentProps<T>) {
  return (
    <div className={['flex gap-1.5', className].filter(Boolean).join(' ')}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={[
              'flex-1 cursor-pointer rounded-ops-btn py-[11px] text-center font-ops-display text-[12.5px] font-semibold transition-colors',
              on ? 'bg-ops-olive text-white' : 'border border-ops-line-strong text-ops-strong hover:border-ops-olive',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
