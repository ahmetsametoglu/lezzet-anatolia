import { describe, expect, it } from 'vitest';
import { creditPosition, dueDayOf, isOpenCredit, isOverdue, openAmountCents, type CreditOrder } from './credit';

const NOW = new Date('2026-07-29T10:00:00Z');

/** 30 gün önce açılmış vadeli sipariş — testlerin ortak iskeleti. */
const order = (patch: Partial<CreditOrder> = {}): CreditOrder => ({
  onAccount: true,
  paymentStatus: 'pending',
  status: 'delivered',
  orderedTotalCents: 10_000,
  amountCollectedCents: 0,
  amountRefundedCents: 0,
  createdAt: '2026-06-29T10:00:00Z',
  ...patch,
});

describe('openAmountCents', () => {
  it('toplam − net tahsilat', () => {
    expect(openAmountCents({ orderedTotalCents: 10_000, amountCollectedCents: 3000, amountRefundedCents: 0 })).toBe(7000);
  });

  it('iade borcu GERİ GETİRİR — para geri gittiyse tahsilat da geri alınmıştır', () => {
    expect(openAmountCents({ orderedTotalCents: 10_000, amountCollectedCents: 10_000, amountRefundedCents: 4000 })).toBe(4000);
  });
});

describe('isOpenCredit', () => {
  it('peşin sipariş vade kapsamında değildir', () => {
    expect(isOpenCredit(order({ onAccount: false }))).toBe(false);
  });

  it('ödenmiş sipariş kapanmıştır', () => {
    expect(isOpenCredit(order({ paymentStatus: 'paid' }))).toBe(false);
  });

  it('iptal edilen sipariş borç doğurmaz', () => {
    expect(isOpenCredit(order({ status: 'cancelled' }))).toBe(false);
  });
});

describe('isOverdue', () => {
  it('vade günü geride kaldıysa gecikmiştir; vade günü boyunca gecikme yoktur', () => {
    // 29 Haziran + 30 gün = 29 Temmuz; Paris'te 29 Temmuz bitene dek (UTC 21:59:59) gecikme yok.
    expect(isOverdue(order(), 30, NOW)).toBe(false);
    expect(isOverdue(order(), 30, new Date('2026-07-29T21:59:59Z'))).toBe(false);
    expect(isOverdue(order(), 30, new Date('2026-07-29T22:00:00Z'))).toBe(true);
  });

  it('vade süresi uzunsa gecikme yoktur', () => {
    expect(isOverdue(order(), 60, NOW)).toBe(false);
  });

  it('ödenmiş sipariş gecikmez — vade günü geçse bile', () => {
    expect(isOverdue(order({ paymentStatus: 'paid' }), 1, NOW)).toBe(false);
  });

  it('vade günü siparişin Paris gününden sayılır; yaz saati geçişi günü kaydırmaz', () => {
    expect(dueDayOf('2026-06-29T10:00:00Z', 30)).toBe('2026-07-29');
    // Paris'te 5 Ekim 00:30 (UTC'de 4 Ekim); 30 gün sonrası kış saatinde de 4 Kasım'dır.
    expect(dueDayOf('2026-10-04T22:30:00Z', 30)).toBe('2026-11-04');
  });
});

describe('creditPosition', () => {
  it('yalnız açık vadeli siparişleri toplar', () => {
    const pos = creditPosition(
      [order({ orderedTotalCents: 10_000 }), order({ orderedTotalCents: 5000, paymentStatus: 'paid' }), order({ orderedTotalCents: 2000, onAccount: false })],
      30,
      NOW,
    );
    expect(pos.openBalanceCents).toBe(10000);
    expect(pos.hasOverdue).toBe(false);
  });

  it('bir tanesi bile gecikmişse fren devrededir', () => {
    const pos = creditPosition([order({ createdAt: '2026-01-01T00:00:00Z' }), order()], 30, NOW);
    expect(pos.hasOverdue).toBe(true);
  });

  it('bakiye eksiye düşmez — fazla tahsilat borç yaratmaz', () => {
    expect(creditPosition([order({ amountCollectedCents: 15_000 })], 30, NOW).openBalanceCents).toBe(0);
  });
});
