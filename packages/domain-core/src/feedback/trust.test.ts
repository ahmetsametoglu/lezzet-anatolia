import { describe, expect, it } from 'vitest';
import type { TrustReason } from '@lezzet/types';
import { TRUST_WEIGHTS, trustEntryOf } from './trust';

// Olaydan defter satırı kararı: ağırlık sıfırken satır doğarsa ya da tahsil süresi dolmadan ceza yazılırsa kırmızıya döner.
const agirlik = Object.fromEntries(Object.entries(TRUST_WEIGHTS).map(([reason, def]) => [reason, def.fallback])) as Record<
  TrustReason,
  number
>;
const simdi = new Date('2026-09-28T12:00:00Z');
const olay = (reason: TrustReason, occurredAt = '2026-09-20T12:00:00Z') => ({
  reason,
  customerId: '11111111-1111-4111-8111-111111111111',
  refId: '22222222-2222-4222-8222-222222222222',
  occurredAt,
});

describe('trustEntryOf', () => {
  it('olayın ağırlığını ayardan alır', () => {
    expect(trustEntryOf(olay('delivery_unreachable'), { ...agirlik, delivery_unreachable: -7 }, { graceDays: 2, now: simdi })?.points).toBe(-7);
  });

  it('sıfır ağırlıklı olay deftere girmez', () => {
    expect(trustEntryOf(olay('order_returned'), agirlik, { graceDays: 2, now: simdi })).toBeNull();
  });

  it('tahsil süresi dolmadan ceza yazılmaz; dolunca olay anı sürenin dolduğu andır', () => {
    expect(trustEntryOf(olay('payment_uncollected', '2026-09-27T12:00:00Z'), agirlik, { graceDays: 2, now: simdi })).toBeNull();
    expect(trustEntryOf(olay('payment_uncollected', '2026-09-25T12:00:00Z'), agirlik, { graceDays: 2, now: simdi })?.occurredAt).toBe(
      '2026-09-27T12:00:00.000Z',
    );
  });
});
