import { describe, expect, it } from 'vitest';
import { availableInBatch, availableQty, decideLatePayment, decideReservation, suggestFefoPicks } from './reservation';

const SIMDI = new Date('2026-07-27T12:00:00Z');
const gecmis = new Date(SIMDI.getTime() - 60_000).toISOString();
const gelecek = new Date(SIMDI.getTime() + 600_000).toISOString();

describe('kullanılabilir stok = fiili − aktif rezervasyon', () => {
  it('aktif rezervasyonlar düşülür', () => {
    expect(availableQty(10, [{ qty: 3 }, { qty: 2 }], SIMDI)).toBe(5);
  });

  it('süresi dolmuş rezervasyon sayılmaz (cron geri bırakmadan önce bile)', () => {
    expect(availableQty(10, [{ qty: 4, expiresAt: gecmis }], SIMDI)).toBe(10);
    expect(availableQty(10, [{ qty: 4, expiresAt: gelecek }], SIMDI)).toBe(6);
  });

  it('eksiye düşmez', () => {
    expect(availableQty(2, [{ qty: 5 }], SIMDI)).toBe(0);
  });
});

describe('batch-pinned (near-expiry teklif)', () => {
  it('partinin kullanılabiliri yalnız O partiye çıpalı rezervasyonları düşer', () => {
    const rez = [{ qty: 2, stockId: 'b1' }, { qty: 5, stockId: 'b2' }, { qty: 3 }];
    expect(availableInBatch('b1', 6, rez, SIMDI)).toBe(4);
  });

  it('teklif için ayrılan stok normal hazırlığa görünmez', () => {
    const rez = [{ qty: 4, stockId: 'b1' }];
    const { picks, shortfall } = suggestFefoPicks(6, [{ stockId: 'b1', physicalQty: 6, expiryDate: '2026-08-01' }], rez, SIMDI);
    expect(picks).toEqual([{ stockId: 'b1', qty: 2 }]);
    expect(shortfall).toBe(4);
  });
});

describe('rezervasyon kararı', () => {
  it('yeterli stokta ayrılır; TTL verilirse son geçerlilik hesaplanır', () => {
    const r = decideReservation({ requestedQty: 2, physicalQty: 5, reservations: [], ttlMinutes: 30, now: SIMDI });
    expect(r).toEqual({ ok: true, qty: 2, expiresAt: '2026-07-27T12:30:00.000Z', stockId: null });
  });

  it('kapıda/vadeli ödemede TTL yok', () => {
    const r = decideReservation({ requestedQty: 1, physicalQty: 5, reservations: [], now: SIMDI });
    expect(r).toMatchObject({ ok: true, expiresAt: null });
  });

  it('yetmezse REDDEDİLİR — kısmi ayırma yapılmaz', () => {
    const r = decideReservation({ requestedQty: 5, physicalQty: 5, reservations: [{ qty: 3 }], now: SIMDI });
    expect(r).toEqual({ ok: false, reason: 'insufficient_stock', available: 2 });
  });

  it('teklif satırı partiye çıpalanır', () => {
    const r = decideReservation({ requestedQty: 2, physicalQty: 4, reservations: [], pinToStockId: 'b1', now: SIMDI });
    expect(r).toMatchObject({ ok: true, stockId: 'b1' });
  });
});

describe('geç ödeme emniyet kuralı', () => {
  it('rezervasyon duruyorsa sipariş normal devam eder', () => {
    expect(decideLatePayment({ reservationStillActive: true, requestedQty: 2, physicalQty: 0, reservations: [] })).toEqual({
      action: 'proceed',
    });
  });

  it('rezervasyon düştü ama stok var → yeniden ayır', () => {
    expect(
      decideLatePayment({ reservationStillActive: false, requestedQty: 2, physicalQty: 5, reservations: [], now: SIMDI }),
    ).toEqual({ action: 'reserve_again', qty: 2 });
  });

  it('rezervasyon düştü ve stok da yok → otomatik iade (elle karar gerekmez)', () => {
    expect(
      decideLatePayment({ reservationStillActive: false, requestedQty: 2, physicalQty: 1, reservations: [], now: SIMDI }),
    ).toEqual({ action: 'refund', reason: 'stock_gone' });
  });
});

describe('FEFO önerisi', () => {
  const partiler = [
    { stockId: 'yeni', physicalQty: 10, expiryDate: '2026-12-01' },
    { stockId: 'eski', physicalQty: 3, expiryDate: '2026-08-05' },
    { stockId: 'orta', physicalQty: 4, expiryDate: '2026-09-10' },
  ];

  it('önce süresi dolan çıkar, gerekirse birden çok partiden', () => {
    const { picks, shortfall } = suggestFefoPicks(6, partiler, [], SIMDI);
    expect(picks).toEqual([{ stockId: 'eski', qty: 3 }, { stockId: 'orta', qty: 3 }]);
    expect(shortfall).toBe(0);
  });

  it('satılamaz parti (DLC geçmiş) hiç önerilmez', () => {
    const { picks } = suggestFefoPicks(2, [{ stockId: 'bozuk', physicalQty: 9, expiryDate: '2026-07-01', sellable: false }, ...partiler], [], SIMDI);
    expect(picks[0]?.stockId).toBe('eski');
  });

  it('stok yetmezse eksik miktar bildirilir (hazırlıkta kısmi karşılama)', () => {
    const { picks, shortfall } = suggestFefoPicks(20, partiler, [], SIMDI);
    expect(picks.reduce((s, p) => s + p.qty, 0)).toBe(17);
    expect(shortfall).toBe(3);
  });
});
