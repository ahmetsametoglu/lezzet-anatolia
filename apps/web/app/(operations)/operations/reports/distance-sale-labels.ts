import type { DistanceSaleThresholdDetail, DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import type { OssSummary } from '@lezzet/domain-core';
import { formatCompactEuro } from '@lezzet/helper';
import { dayMonth, dayMonthLong, money } from '@/components/operation/ui/format';
import { locative } from '@/components/operation/ui/suffix';
import type { OpsTone } from '@/components/operation/ui/tone';

// Eşik kartının cümleleri: durumdan metne geçiş tek yerde, karar motordadır (`distanceSaleDecision`).

const DESTINATION_VAT = "Almanya'daki tüketiciye Alman KDV'si";

/** Eşik kartının tutarı: eşik tam euro bir sınırdır ve kuruşsuz yazılır, kesirli toplam kuruşuyla kalır. */
export const thresholdAmount = (cents: number): string => formatCompactEuro(cents, 'tr');

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
      return { text: `%${warningPercents[1]} geçildi`, tone: 'amber' };
    case 'first':
      return { text: `%${warningPercents[0]} geçildi`, tone: 'amber' };
    default:
      return null;
  }
}

/**
 * Kartın alt kutusu: aşıldıysa ne zamandan beri ve ne kadar süreceği, yaklaşıldıysa kalan tutar ve aşılınca ne değişeceği, eşik altında
 * bugün hangi KDV'nin yazıldığı.
 */
export function thresholdNote(status: DistanceSaleThresholdStatus): { text: string; tone: 'blue' | 'amber' | 'neutral' } | null {
  if (status.warning === 'none') return { text: "Almanya'daki tüketiciye Fransız KDV'si yazılıyor.", tone: 'neutral' };
  if (status.warning !== 'exceeded') {
    const left = thresholdAmount(Math.max(0, status.thresholdCents - status.yearTotalCents));
    return {
      text: `Eşiğe ${left} kaldı. Eşiği aşan sipariş ve sonrakiler ${DESTINATION_VAT}yle yazılır; beyan OSS'den verilir.`,
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

/**
 * Kartın künye satırı: yılın toplamının iki kaynağı ve uyarıların bildirildiği günler. Aşılmanın bildirim günü yazılmaz, çünkü rozet aşan
 * siparişin gününü söyler.
 */
export function thresholdDetail(
  status: DistanceSaleThresholdStatus & DistanceSaleThresholdDetail,
  warningPercents: readonly [number, number],
): string {
  const system = thresholdAmount(status.yearSystemCents);
  const opening = thresholdAmount(status.yearOpeningCents);
  const sources = `${status.year}: sistemdeki satış ${system} + açılış ayarı ${opening}`;
  const levels = [
    { percent: warningPercents[0], day: status.notifiedOn.first },
    { percent: warningPercents[1], day: status.notifiedOn.second },
  ];
  const notified = levels.flatMap(({ percent, day }) => (day ? [`%${percent} → ${dayMonth(day)}`] : []));
  const notice = notified.length > 0 ? ` · bildirim: ${notified.join(', ')} (yönetim ve muhasebe)` : '';
  return `${sources} · KDV hariç, iade düşülmüş, iptal sayılmaz${notice}`;
}

/** Önceki yılın tutarının kaynağı: sistemden önceki yıl yalnız açılış ayarından gelir, sistem yılında açılış tutarı varsa ikisinden. */
export function previousYearSource(status: DistanceSaleThresholdStatus & DistanceSaleThresholdDetail, openingYear: number): string | null {
  if (status.year - 1 < openingYear) return 'açılış ayarı';
  return status.previousYearOpeningCents > 0 ? 'sistem + açılış ayarı' : null;
}

/**
 * OSS özetinin dipnotu: eşik aşılmadıysa özetin neden boş olduğu, aşıldıysa eşikten önce satıcının KDV'siyle yazılan satış; ikisi de sessiz
 * kalsaydı boş ya da eksik özet bir hata gibi okunurdu.
 */
export function ossFootnote(
  oss: OssSummary,
  status: Pick<DistanceSaleThresholdStatus, 'destinationTaxation' | 'crossingOrder'>,
  quarter: number,
): string | null {
  if (!status.destinationTaxation && oss.lines.length === 0) {
    return "OSS'ye giren satış yok — eşik aşılmadı. Almanya'daki tüketici satışı Fransız KDV'siyle yazılıyor ve Fransız beyanına giriyor.";
  }
  const crossing = status.crossingOrder ? dayMonthLong(status.crossingOrder.day) : null;
  const before = crossing ? `${crossing}${locative(crossing)}n önceki` : 'Eşik aşılmadan önceki';
  const origin =
    oss.originTotal.netCents > 0
      ? `${before} Almanya tüketici satışı (${quarter}. çeyrekte ${money(oss.originTotal.netCents)}) Fransız KDV'siyle yazıldı; Fransız beyanına girer, OSS'ye girmez.`
      : null;
  const empty = oss.lines.length === 0 ? `${quarter}. çeyrekte OSS'ye giren satış yok.` : null;
  return [origin, empty].filter(Boolean).join(' ') || null;
}
