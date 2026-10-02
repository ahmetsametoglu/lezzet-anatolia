import { describe, expect, it } from 'vitest';
import { hiboutikRegister } from './client';
import { isHiboutikError } from './errors';

interface Call {
  path: string;
  method: string;
  body: unknown;
}

/** Sıradaki cevabı veren ve çağrıları kaydeden sahte `fetch`; test ağa çıkmaz. */
function fakeHiboutik(responses: Array<{ status?: number; json?: unknown; throws?: string }>) {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      path: String(url).replace(/^https:\/\/[^/]+\/api/, ''),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    if (next.throws) throw new Error(next.throws);
    return new Response(JSON.stringify(next.json ?? {}), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { register: hiboutikRegister({ account: 'demo', user: 'u', apiKey: 'k', fetchImpl }), calls };
}

const sale = (over: Record<string, unknown> = {}) => [
  {
    sale_id: 7,
    store_id: 1,
    sale_ext_ref: 'LA-26-7K4M2P-1',
    unique_sale_id: '2026-10-1-7',
    completed_at: '2026-10-01 14:09:50',
    total: '36.90',
    balance: '0.00',
    url_receipt: 'https://myrecei.pt/fr/1/7/x',
    line_items: [{ line_item_id: 11, product_id: 3, quantity: 3, product_price: '9.67', vat: '0.05500' }],
    payment_details: [
      { payment_detail_id: 21, payment_type: 'ESP', payment_amount: '-20.00' },
      { payment_detail_id: 22, payment_type: 'CHE', payment_amount: '5.00' },
    ],
    ...over,
  },
];

describe('tutar ve oran gönderimi', () => {
  it('cent ondalık dizeye artıksız gider, eksi birim fiyat ve eksi ödeme işaretini korur', async () => {
    const { register, calls } = fakeHiboutik([
      { json: { id_sale_product_detail: 1 } },
      { json: { id_sale_product_detail: 2 } },
      { json: { payment_detail_id: 3 } },
    ]);
    await register.addLine({ saleId: 7, productId: 3, quantity: 3, unitPriceCents: 967, vatRate: null });
    await register.addLine({ saleId: 7, productId: 3, quantity: 1, unitPriceCents: -1000, vatRate: null });
    await register.addPayment({ saleId: 7, method: 'cash', amountCents: -2030 });

    expect(calls.map((call) => call.body)).toEqual([
      expect.objectContaining({ product_price: '9.67', quantity: 3 }),
      expect.objectContaining({ product_price: '-10.00', quantity: 1 }),
      expect.objectContaining({ payment_type: 'ESP', payment_amount: '-20.30' }),
    ]);
  });

  it('kalemin ayrı KDV oranı kesir olarak yazılır; yüzde ya da vergi kimliği reddedilirdi', async () => {
    const { register, calls } = fakeHiboutik([{ json: { id_sale_product_detail: 4 } }, { json: { message: 'ok' } }]);
    await register.addLine({ saleId: 7, productId: 3, quantity: 1, unitPriceCents: 490, vatRate: 5.5 });

    expect(calls[1]).toEqual({ path: '/sale_line_item/4', method: 'PUT', body: { line_item_attribute: 'vat', new_value: '0.055' } });
  });
});

describe('satış okuması', () => {
  it('kapanmış satış: tutar cent, oran yüzde, ödeme kodu bizim yöntemimize çevrilir, tanınmayan kod `null` kalır', async () => {
    const { register } = fakeHiboutik([{ json: sale() }]);

    expect(await register.readSale(7)).toEqual({
      saleId: 7,
      extRef: 'LA-26-7K4M2P-1',
      closed: true,
      uniqueSaleId: '2026-10-1-7',
      receiptUrl: 'https://myrecei.pt/fr/1/7/x',
      lines: [{ lineId: 11, productId: 3, quantity: 3, unitPriceCents: 967, vatRate: 5.5 }],
      payments: [
        { paymentId: 21, method: 'cash', amountCents: -2000 },
        { paymentId: 22, method: null, amountCents: 500 },
      ],
      cashFlows: [],
    });
  });

  it('açık satış kapalı sayılmaz — yarım yazım ancak açık satışta yeniden kurulabilir', async () => {
    const { register } = fakeHiboutik([{ json: sale({ completed_at: '0000-00-00 00:00:00', unique_sale_id: '' }) }]);

    expect(await register.readSale(7)).toMatchObject({ closed: false, uniqueSaleId: null });
  });

  it('taze açılan satış okunur: bölünmemiş satışta ödeme satırı ve bakiye alanı hiç gelmez', async () => {
    const fresh = {
      sale_id: 2,
      store_id: 1,
      sale_ext_ref: '',
      unique_sale_id: '',
      completed_at: '0000-00-00 00:00:00',
      total: '0.00',
      payment: 'CB',
      url_receipt: 'https://myrecei.pt/fr/1/2/x',
      line_items: [],
    };
    const { register } = fakeHiboutik([{ json: [fresh] }]);

    expect(await register.readSale(2)).toEqual({
      saleId: 2,
      extRef: '',
      closed: false,
      uniqueSaleId: null,
      receiptUrl: 'https://myrecei.pt/fr/1/2/x',
      lines: [],
      payments: [],
      cashFlows: [],
    });
  });

  it('kapanmış güne yazılan ödeme nakit akışı numarasıyla döner; satış okuması onu ödeme satırlarından ayrı taşır', async () => {
    const flow = {
      cash_flow_id: 1,
      date_time: '2026-10-01 22:29:21',
      payment_amount: '1.00',
      payment_type: 'ESP',
      currency_code: 'EUR',
      comments: '',
      store_id: 1,
      datez: 20261001,
    };
    const { register } = fakeHiboutik([{ json: { cash_flow_id: 1 } }, { json: sale({ cash_flow: [flow] }) }]);

    expect(await register.addPayment({ saleId: 7, method: 'cash', amountCents: 100 })).toEqual({ kind: 'cash_flow', id: 1 });
    expect((await register.readSale(7))?.cashFlows).toEqual([{ cashFlowId: 1, method: 'cash', amountCents: 100 }]);
  });

  it('olmayan satış `null` döner, hata fırlatmaz', async () => {
    const { register } = fakeHiboutik([{ status: 404, json: { error: 'invalid_data', code: 6 } }]);

    expect(await register.readSale(99)).toBeNull();
  });
});

describe('yazan istek', () => {
  it('ağ hatasında tekrarlanmaz — satış iki kez açılmaz', async () => {
    const { register, calls } = fakeHiboutik([{ throws: 'socket hang up' }, { json: { sale_id: 2 } }]);

    const failure = await register.createSale(1).catch((err: unknown) => err);

    expect(isHiboutikError(failure) && failure.code).toBe('network');
    expect(calls).toHaveLength(1);
  });

  it('kasada açılmamış ödeme türü adıyla söylenir; 404 "kayıt yok" diye okunmaz', async () => {
    const { register } = fakeHiboutik([
      {
        status: 404,
        json: {
          error: 'not_found',
          error_description: 'Resource not found',
          code: 5,
          details: { sale_id: 'Please provide a valid payment' },
        },
      },
    ]);

    await expect(register.addPayment({ saleId: 2, method: 'bank_transfer', amountCents: 100 })).rejects.toThrow(
      `Hiboutik'te "VIR" ödeme türü tanımlı değil`,
    );
  });
});
