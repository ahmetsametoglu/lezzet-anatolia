import { describe, expect, it } from 'vitest';
import { reconcileRegisterDay, type RegisterDaySide } from './reconcile';

const day = (over: Partial<RegisterDaySide> = {}): RegisterDaySide => ({
  vat: [{ vatRate: 5.5, grossCents: 2990 }],
  payments: [{ method: 'cash', amountCents: 2990 }],
  saleIds: [7],
  cashNetCents: 2990,
  ...over,
});

describe('kasa gün sonu mutabakatı', () => {
  it('iki taraf aynıysa fark yoktur', () => {
    expect(reconcileRegisterDay(day(), day())).toEqual([]);
  });

  it('kasada elle yapılmış satış ve bizde olup kasada görünmeyen satış fark sayılır', () => {
    expect(reconcileRegisterDay(day({ saleIds: [7, 8] }), day({ saleIds: [7, 9] }))).toEqual([
      { kind: 'unknown_sale', saleId: 9 },
      { kind: 'missing_sale', saleId: 8 },
    ]);
  });

  it('toplam tutsa da yöntemler ayrışırsa fark yöntem başına görünür', () => {
    const ours = day({
      payments: [
        { method: 'cash', amountCents: 2000 },
        { method: 'card', amountCents: 990 },
      ],
    });
    const register = day({ payments: [{ method: 'cash', amountCents: 2990 }] });

    expect(reconcileRegisterDay(ours, register)).toEqual([
      { kind: 'payment', method: 'cash', oursCents: 2000, registerCents: 2990 },
      { kind: 'payment', method: 'card', oursCents: 990, registerCents: 0 },
    ]);
  });

  it('bir tarafta olmayan oran o tarafta sıfırdır', () => {
    const register = day({
      vat: [
        { vatRate: 5.5, grossCents: 2500 },
        { vatRate: 20, grossCents: 490 },
      ],
    });

    expect(reconcileRegisterDay(day(), register)).toEqual([
      { kind: 'vat', vatRate: 5.5, oursCents: 2990, registerCents: 2500 },
      { kind: 'vat', vatRate: 20, oursCents: 0, registerCents: 490 },
    ]);
  });

  it('çekmecenin günlük nakdi ayrışırsa fark görünür', () => {
    expect(reconcileRegisterDay(day(), day({ cashNetCents: 2490 }))).toEqual([{ kind: 'cash', oursCents: 2990, registerCents: 2490 }]);
  });
});
