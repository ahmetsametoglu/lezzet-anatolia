import { describe, expect, it, vi } from 'vitest';
import { stripeGateway, type StripeLike } from './payment-gateway';

/** Sağlayıcı istemcisinin sahtesi — yalnız kullandığımız yüz (`StripeLike`); ağa çıkmaz. */
function fakeClient(intent: { id: string; status: string; amount_received: number; metadata?: Record<string, string> | null }) {
  return {
    paymentIntents: {
      retrieve: vi.fn(async () => intent),
      cancel: vi.fn(async () => ({})),
    },
    refunds: { create: vi.fn(async () => ({})) },
  } satisfies StripeLike;
}

describe('stripeGateway (07.18)', () => {
  it('anahtarsız ortamda port yoktur — "ödenmedi" diye cevap veren bir port uydurulmaz', () => {
    expect(stripeGateway(null)).toBeNull();
  });

  it('tutarı ALINAN paradan, siparişi ödemenin künyesinden okur', async () => {
    const gateway = stripeGateway(fakeClient({ id: 'pi_1', status: 'succeeded', amount_received: 14801, metadata: { order_id: 'o-1' } }));
    await expect(gateway?.read('pi_1')).resolves.toEqual({ id: 'pi_1', status: 'succeeded', amountReceivedCents: 14801, orderId: 'o-1' });
  });

  it('tanımadığı durumda karar vermez — sağlayıcının yeni bir durumu ödenmiş siparişi iptal ettirmemeli', async () => {
    const gateway = stripeGateway(fakeClient({ id: 'pi_2', status: 'requires_new_step', amount_received: 0 }));
    await expect(gateway?.read('pi_2')).resolves.toBeNull();
  });

  it('künyesiz ödemede sipariş bilinmiyor sayılır, uydurulmaz', async () => {
    const gateway = stripeGateway(fakeClient({ id: 'pi_3', status: 'processing', amount_received: 0, metadata: null }));
    await expect(gateway?.read('pi_3')).resolves.toMatchObject({ status: 'processing', orderId: null });
  });

  it('iptal ve iade aynı ödeme kimliğiyle sağlayıcıya gider', async () => {
    const client = fakeClient({ id: 'pi_4', status: 'requires_payment_method', amount_received: 0 });
    const gateway = stripeGateway(client);
    await gateway?.cancel('pi_4');
    await gateway?.refund('pi_4');
    expect(client.paymentIntents.cancel).toHaveBeenCalledWith('pi_4');
    expect(client.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_4' });
  });
});
