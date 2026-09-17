import { RATIO_SQUARE } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { Icon } from '@/components/customer/ui/icons';
import type { DiscoverCard } from '@/lib/feedback/discover';
import type { DiscoverVote } from '../discover-types';

interface DesktopCandidateStripProps {
  title: string;
  cards: DiscoverCard[];
  current: number;
  decisions: DiscoverVote[];
}

/**
 * Bu turun adayları — sıradaki çerçeveli, kararı verilenler soluk ve köşesinde ✓/×, gelecekler yarı soluk. Soluklaştırma
 * yalnız fotoğrafa ve ada uygulanır; karar rozeti tam renkte kalır, yoksa rozet de silikleşiyordu.
 */
export function DesktopCandidateStrip({ title, cards, current, decisions }: DesktopCandidateStripProps) {
  return (
    <div className="flex flex-col gap-2.75 border-t border-olive-line pt-4.5">
      <span className="font-sans text-eyebrow-sm font-bold text-muted uppercase">{title}</span>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cards.map((c, i) => {
          const decision = decisions[i];
          const isCurrent = i === current;
          const fade = isCurrent ? '' : i < current ? 'opacity-55' : 'opacity-75';
          return (
            <div key={c.productId} className="flex w-[132px] flex-none flex-col gap-1.75">
              <div
                className={[
                  'relative overflow-hidden rounded-soft bg-sand-250',
                  isCurrent ? 'border-[2.5px] border-olive' : 'border border-olive-line',
                ].join(' ')}
              >
                <FramedImage
                  src={c.image.url}
                  alt=""
                  ratio={RATIO_SQUARE}
                  crop={c.image.crop}
                  frames={c.image.frames}
                  sizes="132px"
                  className={`w-full !rounded-none ${fade}`}
                />
                {decision && (
                  <span
                    className={[
                      'absolute top-1.5 left-1.5 grid size-5.5 place-items-center rounded-full text-white',
                      decision === 'like' ? 'bg-olive' : 'bg-muted',
                    ].join(' ')}
                  >
                    <Icon name={decision === 'like' ? 'check' : 'close'} size={12} />
                  </span>
                )}
              </div>
              <span
                className={[
                  'truncate font-sans text-caps-label tracking-normal font-semibold',
                  isCurrent ? 'text-ink' : 'text-body',
                  fade,
                ].join(' ')}
              >
                {c.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
