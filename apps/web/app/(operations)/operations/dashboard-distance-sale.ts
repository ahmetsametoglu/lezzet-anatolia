import type { DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import { dayMonth, money } from '@/components/operation/ui/format';
import type { QueueFact } from './dashboard-read';

/**
 * AB'ye uzaktan satış eşiğinin Pano satırı, yalnız uyarı varken: yaklaşma muhasebe beyana hazırlansın diye, aşılma o günden beri
 * varış ülkesinin KDV'sinin yazıldığını söylemek için. Ayrıntı Raporlar › Muhasebe export'taki eşik kartındadır.
 */
export function distanceSaleFact(status: DistanceSaleThresholdStatus, href: string): QueueFact | null {
  if (status.warning === 'none') return null;
  const base = { key: 'distance-sale-threshold', count: 1, link: { label: 'Muhasebe →', href } } as const;

  if (status.warning === 'exceeded') {
    const crossing = status.crossingOrder;
    return {
      ...base,
      group: 'week',
      tone: 'blue',
      title: status.sincePreviousYear ? 'Uzaktan satış eşiği geçen yıl aşıldı' : 'Uzaktan satış eşiği aşıldı',
      stamp: crossing ? dayMonth(crossing.day) : null,
      detail: status.sincePreviousYear
        ? `${status.year} boyunca Almanya'daki tüketiciye Alman KDV'si yazılır; beyan OSS'den.`
        : `${crossing?.referenceNo ? `${crossing.referenceNo} siparişinden` : 'Eşiği aşan siparişten'} beri Almanya'daki tüketiciye Alman KDV'si yazılıyor; beyan OSS'den.`,
    };
  }

  return {
    ...base,
    // İkinci uyarı aşılmaya çok yakın demektir ve muhasebe aynı gün haber almalı; ilki haftanın işidir.
    group: status.warning === 'second' ? 'today' : 'week',
    tone: 'amber',
    title: 'Uzaktan satış eşiğine yaklaşıldı',
    stamp: status.thresholdCents > 0 ? `%${Math.floor((status.yearTotalCents * 100) / status.thresholdCents)}` : null,
    detail: `${status.year}: ${money(status.yearTotalCents)} / ${money(status.thresholdCents)}, KDV hariç. Eşik aşılınca Almanya'daki tüketiciye Alman KDV'si yazılır.`,
  };
}
