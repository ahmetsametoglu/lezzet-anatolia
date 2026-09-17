import type { ComponentProps } from 'react';
import type { CustomerPointsRules } from '@lezzet/application';
import type { IconName } from '@lezzet/design-tokens/icons';
import { formatCompactEuro } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import pointsEarnMessages from '@lezzet/i18n/customer/points-earn';
import type { MePointsEarnWayKey } from '@lezzet/types';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';

type EarnAction = Pick<ComponentProps<typeof TextAction>, 'href' | 'onClick'>;
export type PhoneEarnActions = Partial<Record<MePointsEarnWayKey, EarnAction>>;

/**
 * Puan kazanma yolları, native kazanma listesinin ikizi. Tanınmayan yol çizilmez, çünkü sunucu yeni bir yolu sözlükten önce
 * gönderebilir; puanın para karşılığı yolun yanında yazılır ki ödül somut okunsun.
 */
interface PhonePointsEarnListProps {
  locale: Locale;
  rules: CustomerPointsRules;
  visitClaimedToday: boolean;
  actions: PhoneEarnActions;
  /** Çevrim oranı ve dipnotlar; kartın içinde değil yalnız ayrıntı çekmecesinde çizilir. */
  showRules?: boolean;
}

/** Davet ödülleri terracotta, müşterinin kendi yaptıkları zeytin; ikon yolun ne olduğunu söyler. */
const ICONS: Record<MePointsEarnWayKey, { name: IconName; invited: boolean }> = {
  referral: { name: 'share', invited: true },
  neighbor: { name: 'home', invited: true },
  review: { name: 'orders', invited: false },
  visit: { name: 'refresh', invited: false },
  feedback_purchase: { name: 'star', invited: false },
  feedback_candidate: { name: 'search', invited: false },
};

export function PhonePointsEarnList({ locale, rules, visitClaimedToday, actions, showRules = false }: PhonePointsEarnListProps) {
  const copy = pointsEarnMessages[locale];
  const known = (key: string): key is MePointsEarnWayKey => key in copy.ways;
  const threshold = String(rules.redeem.minimumPoints);
  const value = formatCompactEuro(rules.redeem.valueCents, locale);

  return (
    <div className="flex flex-col gap-3.5">
      {showRules && (
        <p className="font-sans text-body font-bold text-terracotta">
          {copy.rate.replace('{points}', threshold).replace('{value}', value)}
        </p>
      )}

      {rules.earnWays
        .filter((way) => known(way.key))
        .map((way) => {
          const wayCopy = copy.ways[way.key];
          const action = actions[way.key];
          const claimed = way.key === 'visit' && visitClaimedToday;
          const icon = ICONS[way.key];
          return (
            <div key={way.key} className="flex items-start gap-2.5">
              <MobileIcon
                name={icon.name}
                size={17}
                className={['mt-0.5 flex-none', icon.invited ? 'text-terracotta' : 'text-olive-dark'].join(' ')}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-sans text-body font-bold text-ink">{wayCopy.title}</span>
                  {claimed && <MobileIcon name="check-wide" size={17} className="flex-none text-olive-dark" />}
                </div>
                <div className="my-0.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-badge bg-sand-150 px-2.5 py-1 font-sans text-body font-bold text-olive-dark">
                    {`+${way.points} (${formatCompactEuro(way.points * rules.centValue, locale)})`}
                  </span>
                  <span className="font-sans text-body-sm leading-[1.6] text-muted">
                    {claimed && 'claimedToday' in wayCopy
                      ? wayCopy.claimedToday
                      : wayCopy.cadence.replace('{max}', String(rules.neighborMaxUses))}
                  </span>
                </div>
                <p className="font-sans text-body-sm leading-[1.6] text-body">{wayCopy.body}</p>
                {action !== undefined && 'cta' in wayCopy && (
                  <span className="self-start">
                    <TextAction label={wayCopy.cta} {...action} />
                  </span>
                )}
              </div>
            </div>
          );
        })}

      {showRules && (
        <div className="flex flex-col gap-2">
          <p className="font-sans text-body-sm leading-[1.6] text-muted">
            {copy.footnote.replace('{threshold}', threshold).replace('{value}', value)}
          </p>
          {/* Davet puanı davet edilenin parası alınınca yazılır; söylenmezse müşteri "paylaştım, puan gelmedi" diye okur. */}
          <p className="font-sans text-body-sm leading-[1.6] text-muted">{copy.paidNote}</p>
        </div>
      )}
    </div>
  );
}
