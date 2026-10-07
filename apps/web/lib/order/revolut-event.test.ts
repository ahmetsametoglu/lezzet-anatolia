import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { revolutClient } from '@lezzet/application';
import { toPaymentEvent, verifyRevolutSignature } from './revolut-event';

/** Revolut bildiriminin kapısı: imzası tutmayan gövde işlenmez, iade ödeme sanılmaz ve ödeme bizim siparişe künyeden bağlanır. */

const secret = 'wsk_test';
const sign = (body: string, ts: string) => `v1=${createHmac('sha256', secret).update(`v1.${ts}.${body}`).digest('hex')}`;

describe('verifyRevolutSignature', () => {
  const body = '{"event":"ORDER_COMPLETED","order_id":"o-1"}';
  const now = 1_790_000_000_000;
  const ts = String(now);

  it('ham gövdenin imzası tutar; gövdede tek karakter değişirse tutmaz', () => {
    expect(verifyRevolutSignature({ rawBody: body, timestamp: ts, signatureHeader: sign(body, ts), secret, now })).toBe(true);
    expect(
      verifyRevolutSignature({ rawBody: body.replace('o-1', 'o-2'), timestamp: ts, signatureHeader: sign(body, ts), secret, now }),
    ).toBe(false);
  });

  it('anahtar dönerken gelen imzalardan biri tutarsa yeter', () => {
    const header = `v1=${'0'.repeat(64)},${sign(body, ts)}`;
    expect(verifyRevolutSignature({ rawBody: body, timestamp: ts, signatureHeader: header, secret, now })).toBe(true);
  });

  it('beş dakikadan eski istek yeniden oynatma sayılır ve reddedilir', () => {
    const old = String(now - 6 * 60_000);
    expect(verifyRevolutSignature({ rawBody: body, timestamp: old, signatureHeader: sign(body, old), secret, now })).toBe(false);
  });
});

function fakeClient(orders: Record<string, unknown>) {
  const fetchImpl = (async (url: string) => {
    const id = url.split('/api/orders/')[1];
    return id && orders[id] ? new Response(JSON.stringify(orders[id]), { status: 200 }) : new Response('{}', { status: 404 });
  }) as typeof fetch;
  return revolutClient({ secretKey: 'sk_test', mode: 'sandbox', fetchImpl });
}

const base = { currency: 'EUR', created_at: '2026-10-06T00:00:00Z' };

describe('toPaymentEvent', () => {
  it('tamamlanan ödeme siparişi künyedeki bizim siparişe, tutara ve komisyona çevrilir', async () => {
    const client = fakeClient({
      'rv-1': {
        ...base,
        id: 'rv-1',
        type: 'payment',
        state: 'completed',
        amount: 1250,
        outstanding_amount: 0,
        metadata: { order_id: 'o-1' },
        payments: [
          { id: 'p-1', state: 'captured', amount: 1250, currency: 'EUR', fees: [{ type: 'acquiring', amount: 36, currency: 'EUR' }] },
        ],
      },
    });
    await expect(toPaymentEvent(client, { event: 'ORDER_COMPLETED', order_id: 'rv-1' })).resolves.toEqual({
      key: 'ORDER_COMPLETED:rv-1',
      kind: 'payment_completed',
      orderId: 'o-1',
      paymentRef: 'rv-1',
      amountCents: 1250,
      fee: { feeCents: 36, paymentId: 'p-1' },
    });
  });

  it('tamamlanan iade ödeme sanılmaz; iade ettiği ödemenin iade toplamıyla mutabakata gider', async () => {
    const client = fakeClient({
      'iade-1': { ...base, id: 'iade-1', type: 'refund', state: 'completed', amount: 300, related_order_id: 'rv-1' },
      'rv-1': {
        ...base,
        id: 'rv-1',
        type: 'payment',
        state: 'completed',
        amount: 1250,
        refunded_amount: 800,
        metadata: { order_id: 'o-1' },
      },
    });
    await expect(toPaymentEvent(client, { event: 'ORDER_COMPLETED', order_id: 'iade-1' })).resolves.toEqual({
      key: 'ORDER_COMPLETED:iade-1',
      kind: 'refund_completed',
      paymentRef: 'rv-1',
      refundedTotalCents: 800,
    });
  });

  it('süresi dolan ödeme malı bırakır; düşen iade siparişi ise hiçbir şeyi bırakmaz', async () => {
    const client = fakeClient({
      'rv-2': { ...base, id: 'rv-2', type: 'payment', state: 'failed', amount: 990, metadata: { order_id: 'o-2' } },
      'iade-2': { ...base, id: 'iade-2', type: 'refund', state: 'failed', amount: 100 },
    });
    await expect(toPaymentEvent(client, { event: 'ORDER_FAILED', order_id: 'rv-2' })).resolves.toMatchObject({
      kind: 'payment_released',
      orderId: 'o-2',
    });
    await expect(toPaymentEvent(client, { event: 'ORDER_FAILED', order_id: 'iade-2' })).resolves.toMatchObject({ kind: 'ignored' });
  });

  it('düşen iade, iade ettiği ödemeyle eşlenir; sürmekte olan iadenin olayı hiçbir şey yaptırmaz', async () => {
    const client = fakeClient({
      'iade-3': { ...base, id: 'iade-3', type: 'refund', state: 'failed', amount: 300, related_order_id: 'rv-3' },
      'iade-4': { ...base, id: 'iade-4', type: 'refund', state: 'processing', amount: 300, related_order_id: 'rv-3' },
    });

    await expect(toPaymentEvent(client, { event: 'ORDER_PAYMENT_FAILED', order_id: 'iade-3' })).resolves.toEqual({
      key: 'ORDER_PAYMENT_FAILED:iade-3',
      kind: 'refund_failed',
      refundRef: 'iade-3',
      paymentRef: 'rv-3',
    });
    await expect(toPaymentEvent(client, { event: 'ORDER_PAYMENT_DECLINED', order_id: 'iade-4' })).resolves.toMatchObject({
      kind: 'ignored',
    });
  });
});
