import { describe, expect, it } from 'vitest';
import { doorCardCandidates, matchDoorCardPayments, type DoorCardCollection, type InPersonPayment } from './door-card-match';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 12, 10, minute)).toISOString();
const payment = (ref: string, amountCents: number, minute: number): InPersonPayment => ({ ref, amountCents, at: at(minute) });
const collection = (movementId: string, amountCents: number, minute: number): DoorCardCollection => ({
  movementId,
  amountCents,
  at: at(minute),
});

describe('kapıda kart eşleştirmesi', () => {
  it('tutarı tutan ve pencere içindeki tek aday bağlanır; tutar ya da zaman tutmayan bağlanmaz', () => {
    const matches = matchDoorCardPayments(
      [payment('rv-1', 6000, 0), payment('rv-2', 2500, 0), payment('rv-3', 4000, 0)],
      [collection('m-1', 6000, 4), collection('m-2', 2600, 1), collection('m-3', 4000, 45)],
    );

    expect(matches).toEqual([{ ref: 'rv-1', movementId: 'm-1' }]);
  });

  it('aynı tutarlı iki ödeme ya da iki tahsilat birbirine aday olursa hiçbiri bağlanmaz — yanlış bağ başka siparişin komisyonu olurdu', () => {
    // İki ödeme, tek tahsilat: tahsilatın iki adayı var.
    expect(matchDoorCardPayments([payment('rv-1', 6000, 0), payment('rv-2', 6000, 5)], [collection('m-1', 6000, 3)])).toEqual([]);
    // Tek ödeme, iki tahsilat: ödemenin iki adayı var.
    expect(matchDoorCardPayments([payment('rv-1', 6000, 0)], [collection('m-1', 6000, 2), collection('m-2', 6000, 9)])).toEqual([]);
  });

  it('elle eşlemede aday yalnız tutarı tutan tahsilattır, pencere dışı da olsa; anı en yakın önce gelir, tutmayan ayrı listelenir', () => {
    const candidates = doorCardCandidates(
      [payment('rv-1', 6000, 30), payment('rv-2', 4000, 0)],
      [collection('m-far', 6000, 59 + 120), collection('m-near', 6000, 25), collection('m-odd', 6100, 30)],
    );

    expect(candidates).toEqual({
      byPayment: [
        { ref: 'rv-1', movementIds: ['m-near', 'm-far'] },
        { ref: 'rv-2', movementIds: [] },
      ],
      orphans: ['m-odd'],
    });
  });
});
