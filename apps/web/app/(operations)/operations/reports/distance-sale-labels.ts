import type { DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import type { OssSummary } from '@lezzet/domain-core';
import { dayMonth, dayMonthLong, money } from '@/components/operation/ui/format';
import { locative } from '@/components/operation/ui/suffix';
import type { OpsTone } from '@/components/operation/ui/tone';

// Eşik kartının cümleleri: durumdan metne geçiş tek yerde, karar motordadır (`distanceSaleDecision`).

const DESTINATION_VAT = "Almanya'daki tüketiciye Alman KDV'si";

/** Başlığın rozeti; uyarı yoksa rozet yoktur, çünkü her ay duran bir rozet bir şey söylemez. */
export function thresholdBadge(
  status: DistanceSaleThresholdStatus,
  warningPercents: readonly [number, number],
): { text: string; tone: OpsTone } | null {
  switch (status.warning) {
    case 'exceeded':
      if (status.sincePreviousYear) return { text: 'Geçen yıl aşıldı', tone: 'blue' };
      return { text: status.crossingOrder ? `Eşik aşıldı · ${dayMonth(status.crossingOrder.day)}` : 'Eşik aşıldı', tone: 'blue' };
    case 'second':
      return { text: `İkinci uyarı · %${warningPercents[1]}`, tone: 'amber' };
    case 'first':
      return { text: `İlk uyarı · %${warningPercents[0]}`, tone: 'amber' };
    default:
      return null;
  }
}

/** Kartın alt kutusu: aşıldıysa ne zamandan beri ve ne kadar süreceği, yaklaşıldıysa aşılınca ne değişeceği. */
export function thresholdNote(status: DistanceSaleThresholdStatus): { text: string; tone: 'blue' | 'amber' } | null {
  if (status.warning === 'none') return null;
  if (status.warning !== 'exceeded') {
    return {
      text: "Eşik aşılınca Almanya'daki tüketiciye satış, aşan siparişten başlayarak Alman KDV'siyle yazılır; beyan OSS'den verilir.",
      tone: 'amber',
    };
  }
  if (status.sincePreviousYear) {
    return {
      text: `${status.year - 1} toplamı eşiği aştı: ${status.year} boyunca ${DESTINATION_VAT} yazılır, beyan OSS'den.`,
      tone: 'blue',
    };
  }
  const crossing = status.crossingOrder;
  if (!crossing) return { text: `Bu yılın toplamı eşiği aştı: ${DESTINATION_VAT} yazılır, beyan OSS'den.`, tone: 'blue' };
  const day = dayMonthLong(crossing.day);
  const order = crossing.referenceNo ? `${crossing.referenceNo} siparişiyle` : 'Eşiği aşan siparişle';
  return {
    text: `${order} ${day}${locative(day)} aşıldı: o siparişten beri ${DESTINATION_VAT} yazılıyor, beyan OSS'den. ${status.year + 1} boyunca da sürer — önceki yılda aşılmış olur.`,
    tone: 'blue',
  };
}

/** OSS özetinin dipnotu: eşikten önce satıcının KDV'siyle yazılan uzaktan satış OSS'ye girmez ve bu sessiz kalmamalı. */
export function ossFootnote(oss: OssSummary): string | null {
  const origin =
    oss.originTotal.netCents > 0
      ? `Eşik aşılmadan önceki Almanya tüketici satışı (bu çeyrekte ${money(oss.originTotal.netCents)}) Fransız KDV'siyle yazıldı; Fransız beyanına girer, OSS'ye girmez.`
      : null;
  const empty = oss.lines.length === 0 ? "Bu çeyrekte OSS'ye giren satış yok." : null;
  return [origin, empty].filter(Boolean).join(' ') || null;
}
