import type { StaffCustomerOption } from '@lezzet/types';

import { staffOrderCopy } from '@/screens/staff-order/copy';
import { saleCreditOf } from './sale-credit';

/* Sepetteki vadeli seçeneğinin kararı: onay bekleyen şirkete ve limiti yetmeyen müşteriye vadeli açılmamalı, açılan vadelide kalan limit
   bu satış düşülerek yazılmalı. */

const customer = (patch: Partial<StaffCustomerOption> = {}): StaffCustomerOption => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Restaurant Oberjaegerhof',
  phone: null,
  email: null,
  type: 'company',
  channel: 'b2b',
  isDraft: false,
  siret: null,
  b2bPending: false,
  credit: { termDays: 30, limitCents: 150_000, remainingCents: 124_000, overdue: false },
  ...patch,
});

describe('yerinde satışta vadeli', () => {
  it('limit yetiyorsa açılır ve kalan limit bu satış düşülerek yazılır', () => {
    const credit = saleCreditOf(customer(), 8_400);
    expect(credit?.open).toBe(true);
    expect(credit?.text).toContain('1.156');
  });

  it('onay bekleyen şirkette ve limiti yetmeyen müşteride kapalıdır; sebep onayın beklendiğini söyler', () => {
    expect(saleCreditOf(customer({ channel: 'b2c', b2bPending: true, credit: null }), 8_400)).toEqual({
      open: false,
      text: staffOrderCopy.page.pay.pending,
    });
    expect(saleCreditOf(customer(), 130_000)?.open).toBe(false);
  });

  it('anonim satışta vadeli sorusu yoktur', () => {
    expect(saleCreditOf(null, 8_400)).toBeNull();
  });
});
