import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

/**
 * Operasyon rozeti — Komponent Envanteri O6 (durum/kanal). Ton sözlüğü ortaktır (OpsTone); renk anlam
 * taşır: olive=yolunda, amber=dikkat/karar, kırmızı=hata/gecikme, mavi=onay/aday, gri=kapalı/nötr.
 * Türetilmiş bilgidir — yalnız gösterir, buradan değiştirilmez. `dot` durum noktası ekler.
 */
const TONE: Record<OpsTone, { cls: string; outline: string; dot: string }> = {
  neutral: { cls: 'text-ops-body bg-ops-line-soft', outline: 'text-ops-body border-ops-line-strong', dot: 'bg-ops-faint' },
  olive: { cls: 'text-ops-olive-dark bg-ops-olive-bg', outline: 'text-ops-olive border-ops-olive-line', dot: 'bg-ops-olive' },
  amber: { cls: 'text-ops-amber bg-ops-amber-bg', outline: 'text-ops-amber border-ops-amber-line', dot: 'bg-ops-amber-dot' },
  red: { cls: 'text-ops-red bg-ops-red-bg', outline: 'text-ops-red border-ops-red-line', dot: 'bg-ops-red-dot' },
  blue: { cls: 'text-ops-blue bg-ops-blue-bg', outline: 'text-ops-blue border-ops-blue-line', dot: 'bg-ops-blue' },
  slate: { cls: 'text-ops-slate bg-ops-slate-bg', outline: 'text-ops-slate border-ops-slate-line', dot: 'bg-ops-slate' },
  violet: { cls: 'text-ops-violet bg-ops-violet-bg', outline: 'text-ops-violet border-ops-violet-line', dot: 'bg-ops-violet-dot' },
};

interface BadgeProps {
  tone?: OpsTone;
  dot?: boolean;
  /**
   * Çerçeveli hâl — beyaz zemin + tonun çizgi rengi. RENKLİ BİR KUTUNUN İÇİNDE gerekli: dolgulu rozet
   * kendi zeminini kaybediyor (olive kutunun içindeki olive rozet görünmez oluyor). Tasarımın vade/limit
   * kutusundaki durum çipi bu hâlde çizilmiş; kutu dışında dolgulu hâl kullanılır.
   */
  outline?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, outline = false, className, children }: BadgeProps) {
  const t = TONE[tone];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-[7px] px-[9px] py-[3px] font-ops-display text-ops-micro font-semibold',
        outline ? `border bg-ops-white ${t.outline}` : t.cls,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> : null}
      {children}
    </span>
  );
}
