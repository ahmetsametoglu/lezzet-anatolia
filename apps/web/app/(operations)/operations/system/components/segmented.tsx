'use client';

/**
 * Segment seçici — birkaç değerden biri (18.5). Trend penceresi (10 dk / 1 saat / 24 saat / 7 gün) ve
 * hata görünümü (Liste / İnceleme) aynı kontrolü kullanıyor.
 *
 * Çipten (O3) farkı: çip bir SÜZGEÇTİR ve birden çoğu aynı anda açık olabilir; bu kontrol tek bir
 * değeri seçer ve seçilmemiş hâli yoktur. İkisini aynı bileşende toplamak, "hepsini kapat"ın anlamlı
 * olduğu yerle olmadığı yeri karıştırırdı.
 */
interface SegmentedProps<T extends string> {
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ items, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[8px] border border-ops-gray-300 bg-ops-gray-100 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          aria-pressed={it.value === value}
          className={[
            'cursor-pointer rounded-[6px] px-3 py-[7px] font-ops-display text-ops-xs font-semibold transition-colors',
            it.value === value ? 'bg-ops-card text-ops-ink' : 'text-ops-body hover:text-ops-ink',
          ].join(' ')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
