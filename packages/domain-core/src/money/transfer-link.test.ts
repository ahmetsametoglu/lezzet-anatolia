import { describe, expect, it } from 'vitest';
import { pairStatementsWithTransfers } from './transfer-link';

/** Kasadan bankaya 500 € yatırma: transfer gönderenin gözünden `out` yazılır, banka satırı `in` gelir. */
const deposit = (over: Partial<{ id: string; amountCents: number; valueDate: string; direction: 'in' | 'out' }> = {}) => ({
  id: 'yatirma',
  direction: 'out' as const,
  amountCents: 50_000,
  valueDate: '2026-10-05',
  ...over,
});
const statement = (over: Partial<{ id: string; amountCents: number; valueDate: string; direction: 'in' | 'out' }> = {}) => ({
  id: 'satir',
  direction: 'in' as const,
  amountCents: 50_000,
  valueDate: '2026-10-07',
  ...over,
});

describe('ekstre satırının transfere kendiliğinden bağlanması', () => {
  it('yönü, tutarı ve günü tutan tek satır tek transfere bağlanır', () => {
    expect(pairStatementsWithTransfers([statement()], [deposit()])).toEqual([{ rowId: 'satir', legId: 'yatirma' }]);
  });

  it('tutarı, yönü tutmayan ya da yedi günden uzak satır bağlanmaz', () => {
    expect(pairStatementsWithTransfers([statement({ amountCents: 49_900 })], [deposit()])).toEqual([]);
    expect(pairStatementsWithTransfers([statement({ direction: 'out' })], [deposit()])).toEqual([]);
    expect(pairStatementsWithTransfers([statement({ valueDate: '2026-10-13' })], [deposit()])).toEqual([]);
    expect(pairStatementsWithTransfers([statement({ valueDate: '2026-10-12' })], [deposit()])).toHaveLength(1);
  });

  it('aynı satıra iki transfer ya da aynı transfere iki satır uyarsa tahmin yapılmaz, hiçbiri bağlanmaz', () => {
    expect(pairStatementsWithTransfers([statement()], [deposit(), deposit({ id: 'ikinci', valueDate: '2026-10-06' })])).toEqual([]);
    expect(pairStatementsWithTransfers([statement(), statement({ id: 'ikinci-satir', valueDate: '2026-10-06' })], [deposit()])).toEqual([]);
  });

  it('birbirinden bağımsız iki yatırma kendi satırlarına bağlanır', () => {
    const pairs = pairStatementsWithTransfers(
      [statement(), statement({ id: 'satir-2', amountCents: 12_000 })],
      [deposit(), deposit({ id: 'yatirma-2', amountCents: 12_000 })],
    );
    expect(pairs).toEqual([
      { rowId: 'satir', legId: 'yatirma' },
      { rowId: 'satir-2', legId: 'yatirma-2' },
    ]);
  });
});
