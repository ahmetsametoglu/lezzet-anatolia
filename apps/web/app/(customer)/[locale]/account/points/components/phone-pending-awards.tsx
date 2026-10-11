import type { CustomerPointsRules, PendingNeighborAward } from '@lezzet/application';
import { pendingNeighborLines } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type pointsMessages from '@lezzet/i18n/customer/points-history';

interface PhonePendingAwardsProps {
  copy: LocalizedCopy<typeof pointsMessages>['pending'];
  awards: PendingNeighborAward[];
  rules: CustomerPointsRules;
}

/**
 * "Yolda olan puanlar", native puan geçmişindeki bloğun ikizi: ödemesi beklenen komşu siparişleri deftere karışmaz, çünkü henüz
 * yazılmadılar ve sanal bir satır tarih sırasını bozardı. Puan sayısı komşu kazanım yolundan okunur.
 */
export function PhonePendingAwards({ copy, awards, rules }: PhonePendingAwardsProps) {
  const lines = pendingNeighborLines(awards, rules.earnWays.find((way) => way.key === 'neighbor')?.points ?? null, copy.one);
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-card bg-sand-100 p-3.5">
      <span className="font-sans text-note font-semibold text-ink">{copy.title}</span>
      {lines.map((line, index) => (
        <span key={index} className="font-sans text-micro leading-normal text-ink">
          {line}
        </span>
      ))}
    </div>
  );
}
