import type { PennylaneTransaction } from '@lezzet/types';
import { describe, expect, it } from 'vitest';
import { bankFeedQuiet, planBankFeed, type BankFeedMirror } from './bank-feed';

const LIVE = '2026-10-01';
const tx = (over: Partial<PennylaneTransaction> = {}): PennylaneTransaction => ({
  id: 31309718454272,
  bankAccountId: 17111818240,
  date: '2026-10-02',
  label: 'VIR FOURNISSEUR',
  direction: 'out',
  amountCents: 50_000,
  currency: 'EUR',
  archived: false,
  updatedAt: '2026-10-02T14:41:26Z',
  ...over,
});
const mirror = (explained: boolean | null, over: Partial<BankFeedMirror> = {}): BankFeedMirror => ({
  valueDate: '2026-10-02',
  direction: 'out',
  amountCents: 50_000,
  label: 'VIR FOURNISSEUR',
  removed: false,
  movement: explained === null ? null : { explained },
  ...over,
});
const plan = (transaction: PennylaneTransaction | null, current: BankFeedMirror | null) =>
  planBankFeed({ transaction, mirror: current, liveFrom: LIVE });

describe('Pennylane hareketinin banka satırına etkisi', () => {
  it('yeni hareket canlıya geçiş gününden itibaren yazılır; önceki gün ve sıfır tutar yazılmaz', () => {
    expect(plan(tx(), null)).toEqual({ kind: 'insert' });
    expect(plan(tx({ date: '2026-10-01' }), null)).toEqual({ kind: 'insert' });
    expect(plan(tx({ date: '2026-09-30' }), null)).toEqual({ kind: 'skip', reason: 'before_live' });
    expect(plan(tx({ amountCents: 0 }), null)).toEqual({ kind: 'skip', reason: 'zero_amount' });
  });

  it("izahsız satır Pennylane'in hâline çekilir, açıklaması da; sıfıra inen satır silinir", () => {
    expect(plan(tx({ amountCents: 49_000 }), mirror(false))).toEqual({ kind: 'update' });
    expect(plan(tx({ date: '2026-10-03' }), mirror(false))).toEqual({ kind: 'update' });
    expect(plan(tx({ direction: 'in' }), mirror(false))).toEqual({ kind: 'update' });
    expect(plan(tx({ label: 'VIR FOURNISSEUR SARL' }), mirror(false))).toEqual({ kind: 'update' });
    expect(plan(tx(), mirror(false))).toEqual({ kind: 'skip', reason: 'unchanged' });
    expect(plan(tx({ amountCents: 0 }), mirror(false))).toEqual({ kind: 'remove' });
  });

  it('izahlı satıra dokunulmaz: parası değişirse uyarılır, yalnız açıklaması değişirse ayna tazelenir', () => {
    expect(plan(tx({ amountCents: 49_000 }), mirror(true))).toEqual({ kind: 'alert', change: 'changed' });
    expect(plan(tx({ date: '2026-09-28' }), mirror(true))).toEqual({ kind: 'alert', change: 'changed' });
    expect(plan(tx({ label: 'VIR FOURNISSEUR SARL' }), mirror(true))).toEqual({ kind: 'mirror' });
    expect(plan(tx(), mirror(true))).toEqual({ kind: 'skip', reason: 'unchanged' });
  });

  it("Pennylane'de silinen ya da arşivlenen izahsız satır silinir, izahlı satır kalır ve uyarılır", () => {
    expect(plan(null, mirror(false))).toEqual({ kind: 'remove' });
    expect(plan(tx({ archived: true }), mirror(false))).toEqual({ kind: 'remove' });
    expect(plan(null, mirror(true))).toEqual({ kind: 'alert', change: 'removed' });
    // Satırı olmayan aynada yalnız ayna; zaten silinmiş ya da hiç bilinmeyen hareket için iş yok.
    expect(plan(null, mirror(null))).toEqual({ kind: 'mirror' });
    expect(plan(null, mirror(false, { removed: true }))).toEqual({ kind: 'skip', reason: 'unchanged' });
    expect(plan(null, null)).toEqual({ kind: 'skip', reason: 'unchanged' });
  });

  it("Pennylane'de geri gelen hareketin silinmiş satırı yeniden yazılır; uyarıyla kalan izahlı satır yalnız aynada geri döner", () => {
    expect(plan(tx(), mirror(null, { removed: true }))).toEqual({ kind: 'insert' });
    expect(plan(tx(), mirror(true, { removed: true }))).toEqual({ kind: 'mirror' });
  });
});

describe('hareket gelmiyor uyarısı', () => {
  const quiet = (lastDate: string | null, today: string, watchedFrom = '2026-10-01') =>
    bankFeedQuiet({ lastDate, watchedFrom, today, quietDays: 4 });

  it('son hareketten eşik kadar gün geçmesi olağandır, fazlası sessizliktir', () => {
    expect(quiet('2026-10-02', '2026-10-06')).toBe(false);
    expect(quiet('2026-10-02', '2026-10-07')).toBe(true);
  });

  it('hiç hareket gelmediyse sayaç izlemenin başladığı günden, sonradan eşlenen hesapta eşleme gününden başlar', () => {
    expect(quiet(null, '2026-10-05')).toBe(false);
    expect(quiet(null, '2026-10-06')).toBe(true);
    // Eşlemeden önce kalan eski hareket yeni eşlenen hesabı sessiz göstermez.
    expect(quiet('2026-09-20', '2026-10-12', '2026-10-10')).toBe(false);
  });
});
