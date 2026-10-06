import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RevolutApiOrder } from '@lezzet/types';
import { revolutClient, revolutFeeOf, revolutGateway, revolutSessionCreator, snapshotOf } from './revolut';

/** Revolut uyarlamasının kararları; sağlayıcı sahte `fetch` ile taklit edilir, ağa çıkılmaz. */

type Call = { method: string; url: string; body: unknown; headers: Record<string, string> };

function fakeRevolut(orders: Record<string, RevolutApiOrder>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init.method), url, body, headers: init.headers as Record<string, string> });
    const id = url.split('/api/orders/')[1]?.split('/')[0];
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
    if (init.method === 'GET' && id && orders[id]) return reply(200, orders[id]);
    if (init.method === 'POST' && url.endsWith('/refund'))
      return reply(201, { id: 'iade-1', type: 'refund', state: 'processing', amount: body.amount, currency: 'EUR', created_at: 'x' });
    if (init.method === 'POST' && url.endsWith('/api/orders'))
      return reply(201, {
        id: 'yeni',
        token: 'jeton-yeni',
        type: 'payment',
        state: 'pending',
        amount: body.amount,
        currency: 'EUR',
        created_at: 'x',
      });
    return reply(404, { message: 'yok' });
  }) as typeof fetch;
  return { client: revolutClient({ secretKey: 'sk_test', mode: 'sandbox', fetchImpl }), calls };
}

const order = (patch: Partial<RevolutApiOrder>): RevolutApiOrder => ({
  id: 'rv-1',
  token: 'jeton-1',
  type: 'payment',
  state: 'pending',
  amount: 1250,
  currency: 'EUR',
  created_at: '2026-10-06T00:00:00Z',
  ...patch,
});

describe('snapshotOf', () => {
  it('tanımadığı durumda karar vermez; sağlayıcının yeni bir durumu ödenmiş siparişi iptal ettirmemeli', () => {
    expect(snapshotOf(order({ state: 'yeni_bir_durum' }))).toBeNull();
  });

  it('alınan tutar yalnız tamamlanmış siparişte vardır; sipariş künyeden okunur', () => {
    expect(snapshotOf(order({ state: 'completed', outstanding_amount: 0, metadata: { order_id: 'o-1' } }))).toEqual({
      id: 'rv-1',
      status: 'completed',
      amountReceivedCents: 1250,
      orderId: 'o-1',
      paymentToken: 'jeton-1',
    });
    expect(snapshotOf(order({ state: 'authorised' }))?.amountReceivedCents).toBe(0);
  });
});

describe('revolutSessionCreator', () => {
  it('ödeme kesin tutarla ve sipariş künyesiyle açılır, ayırmayla aynı anda düşer; jeton döner', async () => {
    const { client, calls } = fakeRevolut({});
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const result = await revolutSessionCreator(client)!({
      amountCents: 1500,
      orderId: 'o-1',
      customerId: 'm-1',
      description: 'Sipariş',
      reservationExpiresAt: expiresAt,
      locale: 'fr',
      breakdown: null,
    });
    expect(result).toEqual({ id: 'yeni', paymentToken: 'jeton-yeni' });
    expect(calls[0]?.body).toMatchObject({ amount: 1500, currency: 'EUR', metadata: { order_id: 'o-1' }, expire_pending_after: 'PT30M' });
  });
});

describe('revolutSessionCreator · ödeme sayfası', () => {
  afterEach(() => vi.unstubAllEnvs());
  const params = (breakdown: Parameters<NonNullable<ReturnType<typeof revolutSessionCreator>>>[0]['breakdown']) => ({
    amountCents: 1800,
    orderId: 'o-1',
    customerId: 'm-1',
    description: 'Lezzet Anatolie',
    reservationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    locale: 'fr' as const,
    breakdown,
  });
  const breakdown = {
    lines: [
      {
        kind: 'product' as const,
        name: 'Börek',
        quantity: 2,
        unitPriceCents: 600,
        totalCents: 1200,
        imageUrl: 'https://cdn.example/b.webp',
        vatRate: 5.5,
        taxes: [{ name: 'TVA 5,5 %', amountCents: 63 }],
      },
      {
        kind: 'product' as const,
        name: 'Simit',
        quantity: 1,
        unitPriceCents: 300,
        totalCents: 300,
        imageUrl: null,
        vatRate: 5.5,
        taxes: [{ name: 'TVA 5,5 %', amountCents: 16 }],
      },
      {
        kind: 'shipping' as const,
        name: 'Livraison',
        quantity: 1,
        unitPriceCents: 500,
        totalCents: 500,
        imageUrl: null,
        vatRate: null,
        taxes: [{ name: 'TVA 5,5 %', amountCents: 26 }],
      },
    ],
    discount: { name: 'Remise gros panier', amountCents: 200 },
  };

  it('döküm tahsil edilen tutarla aynı toplamı verir, sepet indirimi en büyük satıra adıyla düşülür ve sipariş sayfasına dönülür', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://test.example.com');
    const { client, calls } = fakeRevolut({});
    await revolutSessionCreator(client, { hostedPage: true })!(params(breakdown));
    const body = calls[0]!.body as { line_items: { total_amount: number; discounts?: unknown[] }[]; redirect_url: string };
    expect(body.line_items.reduce((sum, line) => sum + line.total_amount, 0)).toBe(1800);
    // İndirim düşülen satırın KDV'si indirimli tutardan: 1000 cent içindeki %5,5 = 52.
    expect(body.line_items[0]).toMatchObject({
      total_amount: 1000,
      discounts: [{ name: 'Remise gros panier', amount: 200 }],
      taxes: [{ name: 'TVA 5,5 %', amount: 52 }],
    });
    expect(body.redirect_url).toBe('https://test.example.com/fr/commande/o-1');
  });

  it('yerel adreste dönüş adresi, kart formunda döküm gönderilmez', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    const yerel = fakeRevolut({});
    await revolutSessionCreator(yerel.client, { hostedPage: true })!(params(breakdown));
    expect(yerel.calls[0]!.body).not.toHaveProperty('redirect_url');
    const native = fakeRevolut({});
    await revolutSessionCreator(native.client)!(params(breakdown));
    expect(native.calls[0]!.body).not.toHaveProperty('line_items');
  });
});

describe('revolutGateway.refund', () => {
  it('yalnız iade edilmemiş kalanı ve siparişten türeyen anahtarla iade eder; kalan yoksa istek gitmez', async () => {
    const { client, calls } = fakeRevolut({
      kismi: order({ id: 'kismi', state: 'completed', refunded_amount: 500 }),
      tam: order({ id: 'tam', state: 'completed', refunded_amount: 1250 }),
    });
    const gateway = revolutGateway(client)!;
    await gateway.refund('kismi');
    await gateway.refund('tam');
    const refunds = calls.filter((call) => call.url.endsWith('/refund'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.body).toMatchObject({ amount: 750, currency: 'EUR' });
    expect(refunds[0]?.headers['Idempotency-Key']).toBe('full:kismi');
  });
});

describe('revolutFeeOf', () => {
  it('komisyon ödemenin ücret satırlarının toplamıdır; ücreti yazılmamış ödeme bilinmiyor sayılır', () => {
    const paid = order({
      payments: [
        {
          id: 'p-1',
          state: 'captured',
          amount: 1250,
          currency: 'EUR',
          fees: [
            { type: 'acquiring', amount: 36, currency: 'EUR' },
            { type: 'fx', amount: 4, currency: 'EUR' },
          ],
        },
      ],
    });
    expect(revolutFeeOf(paid)).toEqual({ feeCents: 40, paymentId: 'p-1' });
    expect(revolutFeeOf(order({ payments: [{ id: 'p-2', state: 'captured', amount: 1250, currency: 'EUR', fees: [] }] }))).toBeNull();
  });
});
