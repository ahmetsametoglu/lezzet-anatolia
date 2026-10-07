import { describe, expect, it } from 'vitest';
import type { RegisterDayCheck } from '@lezzet/types';
import { registerCheckFact, type RegisterCheckRun } from './dashboard-read';

const TODAY = '2026-10-07';
const STRASBOURG = '11111111-1111-4111-8111-111111111111';
const KEHL = '22222222-2222-4222-8222-222222222222';
const SCOPE = { today: TODAY, warehouseIds: undefined, href: '/operations/settings?tab=setup' };

const check = (stores: RegisterDayCheck['stores']): RegisterDayCheck => ({ date: TODAY, stores });
const cardShort: RegisterDayCheck['stores'][number]['differences'][number] = {
  kind: 'payment',
  method: 'card',
  oursCents: 600,
  registerCents: 0,
};
const run = (patch: Partial<RegisterCheckRun>): RegisterCheckRun => ({
  date: TODAY,
  time: '14:40',
  failed: false,
  check: check([{ warehouseId: STRASBOURG, differences: [cardShort], waiting: 0 }]),
  ...patch,
});

describe('kasa farkı satırı', () => {
  it('dünkü karşılaştırmanın farkı bugün satır açmaz', () => {
    expect(registerCheckFact(run({ date: '2026-10-06' }), SCOPE)).toBeNull();
    expect(registerCheckFact(run({}), SCOPE)).toMatchObject({ count: 1, title: 'Kasa farkı', group: 'today' });
  });

  it('seçili depo dışındaki mağazanın farkı sayılmaz', () => {
    const both = run({
      check: check([
        { warehouseId: STRASBOURG, differences: [cardShort], waiting: 0 },
        { warehouseId: KEHL, differences: [cardShort, { kind: 'unknown_sale', saleId: 12 }], waiting: 0 },
      ]),
    });

    expect(registerCheckFact(both, { ...SCOPE, warehouseIds: [STRASBOURG] })).toMatchObject({ count: 1 });
    expect(registerCheckFact(both, { ...SCOPE, warehouseIds: [KEHL] })).toMatchObject({ count: 2 });
    expect(registerCheckFact(both, SCOPE)).toMatchObject({ count: 3 });
  });

  it('son deneme düştüyse farkın bilinmediğini söyler, önceki sonucu göstermez', () => {
    const fact = registerCheckFact(run({ failed: true }), SCOPE);

    expect(fact).toMatchObject({ count: 1, title: 'Kasa karşılaştırılamadı', stamp: 'son deneme 14:40' });
  });
});
