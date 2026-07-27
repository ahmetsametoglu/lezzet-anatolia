import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

/**
 * Operasyon rozeti — Komponent Envanteri O6 (durum/kanal). Ton sözlüğü ortaktır (OpsTone); renk anlam
 * taşır: olive=yolunda, amber=dikkat/karar, kırmızı=hata/gecikme, mavi=onay/aday, gri=kapalı/nötr.
 * Türetilmiş bilgidir — yalnız gösterir, buradan değiştirilmez. `dot` durum noktası ekler.
 */
const TONE: Record<OpsTone, { cls: string; dot: string }> = {
  neutral: { cls: 'text-ops-body bg-ops-line-soft', dot: 'bg-ops-faint' },
  olive: { cls: 'text-ops-olive-dark bg-ops-olive-bg', dot: 'bg-ops-olive' },
  amber: { cls: 'text-ops-amber bg-ops-amber-bg', dot: 'bg-ops-amber-dot' },
  red: { cls: 'text-ops-red bg-ops-red-bg', dot: 'bg-ops-red-dot' },
  blue: { cls: 'text-ops-blue bg-ops-blue-bg', dot: 'bg-ops-blue' },
};

interface BadgeProps {
  tone?: OpsTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  const t = TONE[tone];
  return (
    <span
      className={['inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-ops-display text-[10.5px] font-semibold', t.cls, className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> : null}
      {children}
    </span>
  );
}
