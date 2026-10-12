import { describe, expect, it } from 'vitest';
import type { DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import { distanceSaleFact } from './dashboard-distance-sale';

const href = '/operations/reports?tab=export';
const status = (over: Partial<DistanceSaleThresholdStatus>): DistanceSaleThresholdStatus => ({
  year: 2026,
  thresholdCents: 1_000_000,
  yearTotalCents: 500_000,
  previousYearTotalCents: 0,
  warning: 'none',
  destinationTaxation: false,
  sincePreviousYear: false,
  crossingOrder: null,
  ...over,
});

// Uyarısız eşik Panoda dursaydı her gün aynı satır tekrarlanır ve uyarı olmaktan çıkardı; ikinci uyarı aynı gün görülmezse eşik habersiz aşılır.
describe('uzaktan satış eşiği satırı', () => {
  it('uyarı yokken satır yoktur', () => {
    expect(distanceSaleFact(status({}), href)).toBeNull();
  });

  it('ikinci uyarı bugünün işidir, ilki haftanın', () => {
    expect(distanceSaleFact(status({ warning: 'first', yearTotalCents: 820_000 }), href)).toMatchObject({ group: 'week', stamp: '%82' });
    expect(distanceSaleFact(status({ warning: 'second', yearTotalCents: 960_000 }), href)).toMatchObject({ group: 'today', stamp: '%96' });
  });

  it('bu yıl aşıldıysa satır aşan siparişi ve gününü yazar', () => {
    const fact = distanceSaleFact(
      status({
        warning: 'exceeded',
        destinationTaxation: true,
        yearTotalCents: 1_145_000,
        crossingOrder: { id: 'o1', referenceNo: 'LA-26-QX7P2M', day: '2026-11-14' },
      }),
      href,
    );
    expect(fact).toMatchObject({ title: 'Uzaktan satış eşiği aşıldı', stamp: '14 Kas', link: { href } });
    expect(fact?.detail).toContain('LA-26-QX7P2M');
  });
});
