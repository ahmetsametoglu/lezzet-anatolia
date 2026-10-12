import { describe, expect, it } from 'vitest';
import type { DistanceSaleThresholdDetail, DistanceSaleThresholdStatus } from '@lezzet/application/accounting/distance-sale-threshold';
import { ossFootnote, previousYearSource, thresholdBadge, thresholdDetail, thresholdNote } from './distance-sale-labels';

type Status = DistanceSaleThresholdStatus & DistanceSaleThresholdDetail;

/** Tutar ile simge arasındaki bölünmeyen boşluk düz boşluğa çevrilir ki beklenen metin okunur yazılsın. */
const plain = (text: string | undefined): string | undefined => text?.replace(/\u00a0/g, ' ');

const status = (over: Partial<Status>): Status => ({
  year: 2026,
  thresholdCents: 1_000_000,
  yearTotalCents: 1_145_000,
  previousYearTotalCents: 0,
  warning: 'exceeded',
  destinationTaxation: true,
  sincePreviousYear: false,
  crossingOrder: { id: 'o1', referenceNo: 'LA-26-QX7P2M', day: '2026-11-14' },
  yearSystemCents: 1_055_000,
  yearOpeningCents: 90_000,
  previousYearSystemCents: 0,
  previousYearOpeningCents: 0,
  notifiedOn: { first: '2026-10-21', second: '2026-11-06', exceeded: '2026-11-14' },
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

  it('uyarı seviyesinde rozet geçilen yüzdeyi, not kalan tutarı söyler', () => {
    const second = status({ warning: 'second', destinationTaxation: false, yearTotalCents: 961_000, crossingOrder: null });
    expect(thresholdBadge(second, [80, 95])).toEqual({ text: '%95 geçildi', tone: 'amber' });
    expect(plain(thresholdNote(second)?.text)).toMatch(/^Eşiğe 390 € kaldı\./);
  });

  it('künye toplamın iki kaynağını ve yalnız haber gitmiş seviyenin gününü yazar', () => {
    expect(plain(thresholdDetail(status({}), [80, 95]))).toBe(
      '2026: sistemdeki satış 10.550 € + açılış ayarı 900 € · KDV hariç, iade düşülmüş, iptal sayılmaz · bildirim: %80 → 21 Eki, %95 → 6 Kas (yönetim ve muhasebe)',
    );
    const quiet = status({ notifiedOn: { first: null, second: null, exceeded: null } });
    expect(thresholdDetail(quiet, [80, 95])).not.toContain('bildirim');
  });

  it('sistemden önceki yılın tutarı açılış ayarından gelir; sistem yılında açılış tutarı yoksa kaynak yazılmaz', () => {
    expect(previousYearSource(status({ year: 2026 }), 2026)).toBe('açılış ayarı');
    expect(previousYearSource(status({ year: 2027, previousYearOpeningCents: 0 }), 2026)).toBeNull();
    expect(previousYearSource(status({ year: 2027, previousYearOpeningCents: 90_000 }), 2026)).toBe('sistem + açılış ayarı');
  });

  it('eşik altında rozet yoktur, not bugün yazılan KDV’yi söyler', () => {
    const below = status({ warning: 'none', destinationTaxation: false, crossingOrder: null });
    expect(thresholdBadge(below, [80, 95])).toBeNull();
    expect(thresholdNote(below)).toEqual({ text: "Almanya'daki tüketiciye Fransız KDV'si yazılıyor.", tone: 'neutral' });
  });

  it('OSS dipnotu boş özetin sebebini ve eşikten önceki satışı sessiz bırakmaz', () => {
    const empty = { lines: [], originTotal: { netCents: 0, vatCents: 0 } };
    expect(ossFootnote(empty, { destinationTaxation: false, crossingOrder: null }, 4)).toMatch(/^OSS'ye giren satış yok — eşik aşılmadı\./);
    const origin = { lines: [], originTotal: { netCents: 324_000, vatCents: 17_820 } };
    expect(plain(ossFootnote(origin, status({}), 4) ?? undefined)).toBe(
      "14 Kasım'dan önceki Almanya tüketici satışı (4. çeyrekte 3.240,00 €) Fransız KDV'siyle yazıldı; Fransız beyanına girer, OSS'ye girmez. 4. çeyrekte OSS'ye giren satış yok.",
    );
  });
});
