import { describe, expect, it } from 'vitest';
import type { DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import { ossFootnote, thresholdBadge, thresholdNote } from './distance-sale-labels';

const status = (over: Partial<DistanceSaleThresholdStatus>): DistanceSaleThresholdStatus => ({
  year: 2026,
  thresholdCents: 1_000_000,
  yearTotalCents: 1_145_000,
  previousYearTotalCents: 0,
  warning: 'exceeded',
  destinationTaxation: true,
  sincePreviousYear: false,
  crossingOrder: { id: 'o1', referenceNo: 'LA-26-QX7P2M', day: '2026-11-14' },
  ...over,
});

// Geçen yıl aşılan eşikte aşan sipariş yoktur; kart bu yılın siparişini aramaya kalksaydı yanlış sipariş ya da "bilinmiyor" yazardı.
describe('eşik kartının cümleleri', () => {
  it('bu yıl aşıldıysa aşan sipariş ve gün yazılır, gelecek yıl da sürdüğü söylenir', () => {
    expect(thresholdBadge(status({}), [80, 95])).toEqual({ text: 'Eşik aşıldı · 14 Kas', tone: 'blue' });
    expect(thresholdNote(status({}))?.text).toMatch(/^LA-26-QX7P2M siparişiyle 14 Kasım'da aşıldı: .* 2027 boyunca da sürer/);
  });

  it('geçen yıl aşıldıysa yıl boyunca sürdüğü yazılır', () => {
    const since = status({ sincePreviousYear: true, crossingOrder: null, previousYearTotalCents: 1_200_000 });
    expect(thresholdBadge(since, [80, 95])?.text).toBe('Geçen yıl aşıldı');
    expect(thresholdNote(since)?.text).toBe(
      "2025 toplamı eşiği aştı: 2026 boyunca Almanya'daki tüketiciye Alman KDV'si yazılır, beyan OSS'den.",
    );
  });

  it('uyarı yokken rozet ve not yoktur; OSS dipnotu eşikten önceki satışı sessiz bırakmaz', () => {
    expect(thresholdBadge(status({ warning: 'none', destinationTaxation: false }), [80, 95])).toBeNull();
    expect(thresholdNote(status({ warning: 'none', destinationTaxation: false }))).toBeNull();
    expect(ossFootnote({ lines: [], originTotal: { netCents: 324_000, vatCents: 17_820 } })).toContain('3.240,00 €');
  });
});
