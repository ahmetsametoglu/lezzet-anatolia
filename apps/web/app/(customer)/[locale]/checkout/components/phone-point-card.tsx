import { distanceLabel, openingLines, pointAddress, pointText, type ServicePointEntry } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import { formatPrice } from '@/lib/storefront/format';

interface PhonePointCardProps {
  entry: ServicePointEntry;
  locale: Locale;
  /** Taşıyıcının renk sınıfı (`carrierToneOf`). */
  tone: string;
  selected: boolean;
  /** Açılış saatleri; haritanın alt kartında gösterilir. */
  showHours?: boolean;
  onClick?: () => void;
}

/**
 * Noktanın kartı: taşıyıcı, tür ve fiyat üstte; ad, adres ve uzaklık altında. Liste, haritanın alt kartı ve kargo bölümündeki seçim
 * aynı kartı çizer ki müşteri haritada seçtiğini bölümde aynı biçimde görsün.
 */
export function PhonePointCard({ entry: { point, option }, locale, tone, selected, showHours = false, onClick }: PhonePointCardProps) {
  const copy = checkoutMessages[locale];
  const hours = showHours ? openingLines(point.openingTimes, locale, copy.point.closed) : null;
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-sans text-helper font-semibold text-muted">
        <span className={`size-2.5 flex-none rounded-full ${tone}`} />
        {[option.carrierName, point.kind ? copy.point.kind[point.kind] : null].filter(Boolean).join(' · ')}
        <span className="ml-auto flex-none font-sans text-control text-ink">{formatPrice(option.priceCents, locale)}</span>
      </span>
      <span className="font-sans text-control text-ink">{pointText(point.name)}</span>
      <span className="font-sans text-helper leading-snug text-muted">
        {[
          pointAddress(point),
          point.distanceM === null ? null : copy.point.distance.replace('{distance}', distanceLabel(point.distanceM, locale)),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {showHours && (
        <span className="mt-1 font-sans text-helper leading-relaxed text-ink">{hours ? hours.join(' · ') : copy.point.hoursUnknown}</span>
      )}
    </>
  );
  const className = [
    'flex w-full flex-col gap-0.5 rounded-control border-[1.5px] px-3.5 py-3 text-left',
    selected ? 'border-ink bg-sand-150' : 'border-sand-400 bg-card',
  ].join(' ');
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} cursor-pointer transition-[scale,border-color] hover:border-ink active:scale-[0.98]`}
    >
      {body}
    </button>
  );
}
