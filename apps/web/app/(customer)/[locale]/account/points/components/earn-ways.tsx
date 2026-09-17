import type { CustomerPointsRules } from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { Messages } from '../points-types';

/** Kazanma yolları ayardan gelir; ekrana gömülü sayı motorun uyguladığından bir gün ayrışırdı. */
interface EarnWaysProps {
  t: Messages;
  locale: Locale;
  rules: CustomerPointsRules;
}

export function EarnWays({ t, locale, rules }: EarnWaysProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-card-title-sm text-ink">{t.earnTitle}</h2>
      <div className="flex flex-col divide-y divide-sand-100 rounded-card border border-sand-200 bg-card px-4">
        {rules.earnWays.map((way) => (
          <div key={way.key} className="flex items-baseline justify-between gap-3 py-3">
            <span className="min-w-0 font-sans text-body-sm text-body">{t.earnWay[way.key]}</span>
            <span className="flex-none font-sans text-body-sm font-bold text-olive-dark">
              {t.earnPoints.replace('{points}', String(way.points))}
            </span>
          </div>
        ))}
      </div>
      <p className="font-sans text-note text-muted">
        {t.earnNote
          .replace('{points}', String(rules.redeem.minimumPoints))
          .replace('{amount}', formatPrice(rules.redeem.valueCents, locale))}
      </p>
    </section>
  );
}
