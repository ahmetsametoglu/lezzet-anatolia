import type { ReactNode } from 'react';
import type { OpsTone } from './tone';

// Balonun kutusu burada çizilmez, sınıfı verilir (`bubbleClass`): Talepler'in gövdesi çeviri anahtarını kutunun dışında taşır ve
// kutuyu sahiplenen bir komponent o ekranı çatallamaya zorlardı.

type MessageSide = 'in' | 'out';

/** `neutral` gelen mesajdır, müşterinin cümlesi bir durum söylemez; öteki tonlar giden mesajın kimliğini taşır (olive personel, violet makine). */
const SKIN: Record<OpsTone, string> = {
  neutral: 'border-ops-line bg-ops-white',
  olive: 'border-ops-olive-line bg-ops-olive-bg',
  amber: 'border-ops-amber-line bg-ops-amber-bg',
  red: 'border-ops-red-line bg-ops-red-bg',
  blue: 'border-ops-blue-line bg-ops-blue-bg',
  slate: 'border-ops-slate-line bg-ops-slate-bg',
  violet: 'border-ops-violet-line bg-ops-violet-bg',
};

export function bubbleClass(tone: OpsTone = 'neutral', extra?: string): string {
  return [
    'max-w-[78%] whitespace-pre-wrap rounded-ops-card border px-3 py-2 font-ops-body text-ops-sm leading-relaxed text-ops-strong',
    SKIN[tone],
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Künyenin yeri ortak, balonun üstü: altına koymak iki ekranda iki ayrı okuma ritmi üretirdi. */
export function MessageRow({ side, meta, children }: { side: MessageSide; meta: ReactNode; children: ReactNode }) {
  const mine = side === 'out';
  return (
    <div className={['flex flex-col gap-1', mine ? 'items-end' : 'items-start'].join(' ')}>
      {meta ? <span className="flex items-center gap-1.5 px-1">{meta}</span> : null}
      {children}
    </div>
  );
}

/**
 * Kısa sohbet alta yaslanır, çünkü okunacak yer yazma kutusunun üstüdür. `justify-end` değil iç kabukta `mt-auto`: taşan
 * içerikte `justify-end` kutunun tepesini kırpar ve eski mesajlara ulaşılamazdı.
 */
export function MessageThread({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex min-h-0 flex-1 flex-col overflow-y-auto', className].filter(Boolean).join(' ')}>
      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{children}</span>;
}
