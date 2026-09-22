import type { OrderMilestone, OrderTimelineStep } from '@lezzet/types';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';

/*
  Sipariş zaman çizgisi, native sipariş detayının çizgisiyle aynı: adımları motor verir (`orderTimeline`), ekran durumdan çıkarım
  yapmaz ve iptal ile iade çizgide yer tutmaz. Saat yalnız kaydı olan adımda yazılır ve ray çizgisinin rengini sonraki adım belirler,
  çünkü yaşanmamış yol yaşanmış gibi boyanmamalı.
*/

/** Durağın ikonu — küme motorun `OrderMilestone`u (kapalı, derlemede zorlar). */
const STEP_ICON = {
  received: 'check-wide',
  prepared: 'box',
  on_the_way: 'truck',
  // Gel-al: "yolda" yerine "teslime hazır" — mal depoda müşteriyi bekliyor.
  ready_for_pickup: 'pin',
  delivered: 'home',
} as const satisfies Record<OrderMilestone, string>;

interface PhoneOrderTimelineProps {
  steps: readonly OrderTimelineStep[];
  /** Durak adları — çeviri çağıranda çözülür. */
  labels: Record<OrderMilestone, string>;
  /** "Şu an" durağının notu; `delivered` hiç `current` olmadığı için kümede yok. */
  notes: Record<Exclude<OrderMilestone, 'delivered'>, string>;
  /** Damgayı okunur metne çeviren biçimlendirici — dil kararı çağıranın. */
  formatAt: (iso: string) => string;
}

export function PhoneOrderTimeline({ steps, labels, notes, formatAt }: PhoneOrderTimelineProps) {
  return (
    <ol className="flex flex-col rounded-card bg-sand-250 px-4 pt-4 pb-1">
      {steps.map((step, index) => {
        const reached = step.state !== 'pending';
        const current = step.state === 'current';
        const note = current && step.milestone !== 'delivered' ? notes[step.milestone] : undefined;
        const icon = STEP_ICON[step.milestone];
        const iconClass = reached ? 'text-card' : 'text-muted';
        return (
          <li key={step.milestone} className="flex gap-3">
            <div className="flex flex-none flex-col items-center">
              <span
                className={[
                  'grid size-8.5 place-items-center rounded-full',
                  current ? 'bg-terracotta' : reached ? 'bg-olive' : 'bg-sand-300',
                ].join(' ')}
              >
                <MobileIcon name={icon} size={17} className={iconClass} />
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={['my-0.5 min-h-4 w-[2.5px] flex-1 rounded-full', steps[index + 1]?.state === 'pending' ? 'bg-sand-400' : 'bg-olive'].join(' ')}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-3.5">
              <span className={['font-sans text-control', reached ? 'text-ink' : 'text-sand-600'].join(' ')}>{labels[step.milestone]}</span>
              {reached && step.at !== null && <span className="font-sans text-micro text-muted">{formatAt(step.at)}</span>}
              {note !== undefined && <span className="font-sans text-body-sm leading-[1.6] font-semibold text-terracotta">{note}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
