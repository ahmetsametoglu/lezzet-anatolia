import type { ReactNode } from 'react';

/**
 * Operasyon çipi — Komponent Envanteri O3 (filtre & arama). Filtre/etiket öğesi (kategori süzgeci,
 * alerjen, koleksiyon).
 * `active` dolu olive; pasif çerçeveli olive; `tone='amber'` dikkat çipi; `dashed` ekleme çipi ("+ …").
 * Rozetten (Badge) farkı: çip tıklanabilir/seçilebilir bir kontrol, rozet salt gösterimdir.
 */
type ChipTone = 'olive' | 'amber';

interface ChipProps {
  active?: boolean;
  dashed?: boolean;
  tone?: ChipTone;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const TONE: Record<ChipTone, { active: string; idle: string }> = {
  olive: {
    active: 'bg-ops-olive text-ops-card border-ops-olive',
    idle: 'text-ops-olive border-ops-olive-line hover:bg-ops-olive-bg',
  },
  amber: {
    active: 'bg-ops-amber text-ops-card border-ops-amber',
    idle: 'text-ops-amber bg-ops-amber-bg border-ops-amber-line',
  },
};

export function Chip({ active = false, dashed = false, tone = 'olive', onClick, className, children }: ChipProps) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-ops-chip border px-3 py-[5px] font-ops-display text-[12px] font-semibold transition-colors',
        onClick ? 'cursor-pointer' : 'cursor-default',
        dashed ? 'border-dashed border-ops-gray-500 font-ops-body font-medium text-ops-body' : active ? t.active : t.idle,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
