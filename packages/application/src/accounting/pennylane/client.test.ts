import { describe, expect, it } from 'vitest';
import { pennylanePort, type PennylaneConfig } from './client';
import { PennylaneError } from './errors';

interface Reply {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
  throws?: string;
}

const SANDBOX_ME = { company: { id: 270612, name: 'Sandbox', reg_no: 'sandbox-270612' } };
const LIVE_ME = { company: { id: 9001, name: 'QUALITE SAS', reg_no: '912345678' } };
const EMPTY_PAGE = { items: [], has_more: false, next_cursor: null };
/** `/me` ile 24 okuma pencereyi doldurur; saat ilerlemediği için 26. istek tam pencere kadar bekler. */
const WINDOW_WAIT = 5_000;

/**
 * Yola göre cevap veren sahte `fetch` ve sahte saat: istekler, sorgularıyla kaydedilir, beklemeler süreleriyle; test ağa çıkmaz,
 * gerçek saatte beklemez. Bir yolun cevap listesi bitince son cevap tekrar eder.
 */
function fakePennylane(routes: Record<string, Reply[]>, mode: PennylaneConfig['mode'] = 'sandbox') {
  const calls: Array<{ path: string; query: Record<string, string>; method: string; body: unknown }> = [];
  const sleeps: number[] = [];
  const served = new Map<string, number>();
  let now = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname.replace('/api/external/v2', '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body instanceof FormData ? 'form' : undefined;
    calls.push({ path, query: Object.fromEntries(parsed.searchParams), method: init?.method ?? 'GET', body });
    const replies = routes[path] ?? [{ status: 404, json: { error: 'not_found' } }];
    const index = served.get(path) ?? 0;
    served.set(path, index + 1);
    const reply = replies[Math.min(index, replies.length - 1)]!;
    if (reply.throws) throw new Error(reply.throws);
    // 204 gövde taşımaz; Response gövdeli 204'ü reddeder.
    const answer = reply.status === 204 ? null : JSON.stringify(reply.json ?? {});
    return new Response(answer, { status: reply.status ?? 200, headers: reply.headers });
  }) as unknown as typeof fetch;
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  };
  return { port: pennylanePort({ token: 't', mode, fetchImpl, clock }), calls, sleeps };
}

const transaction = (over: Record<string, unknown> = {}) => ({
  id: 31309718454272,
  label: 'VIR FOURNISSEUR',
  date: '2026-10-02',
  amount: '-500.0',
  currency: 'EUR',
  archived_at: null,
  updated_at: '2026-10-02T14:41:26.328677Z',
  bank_account: { id: 17111818240 },
  ...over,
});

describe('kip ve şirket', () => {
  it('kip ile anahtarın şirketi uyuşmazsa hiçbir okuma gitmez; uyuşunca şirket bir kez denetlenir', async () => {
    const yanlis = fakePennylane({ '/me': [{ json: LIVE_ME }], '/bank_accounts': [{ json: EMPTY_PAGE }] }, 'sandbox');
    await expect(yanlis.port.listBankAccounts()).rejects.toMatchObject({ code: 'company_mismatch' });
    expect(yanlis.calls.map((call) => call.path)).toEqual(['/me']);

    const ters = fakePennylane({ '/me': [{ json: SANDBOX_ME }] }, 'live');
    await expect(ters.port.company()).rejects.toMatchObject({ code: 'company_mismatch' });

    const dogru = fakePennylane({ '/me': [{ json: SANDBOX_ME }], '/bank_accounts': [{ json: EMPTY_PAGE }] }, 'sandbox');
    await dogru.port.listBankAccounts();
    await dogru.port.listBankAccounts();
    expect(dogru.calls.map((call) => call.path)).toEqual(['/me', '/bank_accounts', '/bank_accounts']);
  });
});

describe('hareket okuması', () => {
  it('işaretli ondalık tutar cent ve yöne çevrilir; arşivlenen hareket işaretlenir', async () => {
    const { port } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/transactions': [
        {
          json: {
            items: [
              transaction(),
              transaction({ id: 2, amount: '250.0' }),
              transaction({ id: 3, amount: '-39.99', archived_at: '2026-10-03T08:00:00Z' }),
            ],
            has_more: false,
            next_cursor: 'son',
          },
        },
      ],
    });
    const page = await port.listTransactions({ bankAccountId: 17111818240, fromDate: '2026-10-01', cursor: null });

    expect(page.items.map(({ id, direction, amountCents, archived }) => ({ id, direction, amountCents, archived }))).toEqual([
      { id: 31309718454272, direction: 'out', amountCents: 50_000, archived: false },
      { id: 2, direction: 'in', amountCents: 25_000, archived: false },
      { id: 3, direction: 'out', amountCents: 3999, archived: true },
    ]);
    // `has_more` yoksa imleç sonraki sayfayı istetmez.
    expect(page.nextCursor).toBeNull();
  });

  it('süzgeç `filter` adıyla ve her sayfada yeniden gider; imleç sonraki sayfayı ister', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/transactions': [{ json: { items: [transaction()], has_more: true, next_cursor: 'c2' } }, { json: EMPTY_PAGE }],
    });
    const first = await port.listTransactions({ bankAccountId: 17111818240, fromDate: '2026-10-01', cursor: null });
    await port.listTransactions({ bankAccountId: 17111818240, fromDate: '2026-10-01', cursor: first.nextCursor });

    const pages = calls.filter((call) => call.path === '/transactions').map((call) => call.query);
    expect(first.nextCursor).toBe('c2');
    expect(pages[1]).toMatchObject({ cursor: 'c2' });
    for (const page of pages) {
      expect(JSON.parse(page.filter ?? 'null')).toEqual([
        { field: 'bank_account_id', operator: 'eq', value: '17111818240' },
        { field: 'date', operator: 'gteq', value: '2026-10-01' },
      ]);
    }
  });

  it('değişiklik akışında ilk sayfa andan, sonraki imleçten istenir; ikisi birlikte gitmez', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/changelogs/transactions': [
        { json: { items: [{ id: 5, operation: 'update', processed_at: '2026-10-02T14:41:27Z' }], has_more: true, next_cursor: 'k2' } },
        { json: EMPTY_PAGE },
      ],
    });
    const first = await port.transactionChanges({ since: '2026-10-02T14:00:00Z', cursor: null });
    await port.transactionChanges({ since: null, cursor: 'k2' });

    expect(first).toEqual({ items: [{ id: 5, operation: 'update', processedAt: '2026-10-02T14:41:27Z' }], nextCursor: 'k2' });
    const [ilk, sonraki] = calls.filter((call) => call.path === '/changelogs/transactions').map((call) => call.query);
    expect(ilk).toMatchObject({ start_date: '2026-10-02T14:00:00Z' });
    expect(ilk).not.toHaveProperty('cursor');
    expect(sonraki).toMatchObject({ cursor: 'k2' });
    expect(sonraki).not.toHaveProperty('start_date');
  });

  it('olmayan hareket `null`; geçersiz anahtar tekrar edilmeden `credentials` olarak düşer', async () => {
    const { port } = fakePennylane({ '/me': [{ json: SANDBOX_ME }] });
    expect(await port.getTransaction(42)).toBeNull();

    const yetkisiz = fakePennylane({ '/me': [{ status: 401, json: { error: 'unauthorized', message: 'invalid token' } }] });
    await expect(yetkisiz.port.company()).rejects.toBeInstanceOf(PennylaneError);
    await expect(yetkisiz.port.company()).rejects.toMatchObject({ code: 'credentials' });
    expect(yetkisiz.calls).toHaveLength(2);
  });
});

describe('istek sınırı ve tekrar', () => {
  it("429'da `retry-after` kadar beklenip tekrar istenir; sunucu arızasında okuma artan aralıkla tekrarlanır", async () => {
    const { port, sleeps } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/bank_accounts': [{ status: 429, headers: { 'retry-after': '2' } }, { status: 503 }, { json: EMPTY_PAGE }],
    });
    expect(await port.listBankAccounts()).toEqual([]);
    expect(sleeps).toEqual([2000, 1000]);
  });

  it('beş saniyede 25 istekten fazlası gitmez: 26. istek pencerenin en eskisi düşene kadar bekler', async () => {
    const { port, sleeps } = fakePennylane({ '/me': [{ json: SANDBOX_ME }], '/transactions/1': [{ json: transaction({ id: 1 }) }] });
    for (let i = 0; i < 24; i += 1) await port.getTransaction(1);
    expect(sleeps).toEqual([]);
    await port.getTransaction(1);
    expect(sleeps).toEqual([WINDOW_WAIT]);
  });
});

describe('alış faturası yazımı', () => {
  const draft = {
    supplierId: 1549933174784,
    date: '2026-10-02',
    deadline: '2026-11-01',
    invoiceNumber: null,
    externalReference: 'doc:4f1c',
    lines: [
      { grossCents: 10_550, vatCents: 550, vatCode: 'FR_55' },
      { grossCents: 6_000, vatCents: 1_000, vatCode: 'FR_200' },
    ],
  };

  it('test kipinde canlı şirkete hiçbir yazım gitmez', async () => {
    const { port, calls } = fakePennylane({ '/me': [{ json: LIVE_ME }], '/suppliers': [{ status: 201, json: {} }] }, 'sandbox');
    await expect(
      port.createSupplier({ name: 'Fournisseur', externalReference: 'sup:1', vatNumber: null, dueDays: null }),
    ).rejects.toMatchObject({
      code: 'company_mismatch',
    });
    expect(calls.map((call) => call.path)).toEqual(['/me']);
  });

  it('içe aktarma toplamları satırlardan türetir, tutarı euro dizesiyle ve oran koduyla gönderir; numarasız fiş numara alanı taşımaz', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/import': [{ status: 201, json: { id: 31309740199936, external_reference: 'doc:4f1c', invoice_number: null } }],
    });
    expect(await port.importInvoice({ draft, fileId: 93977575424 })).toEqual({
      status: 'imported',
      invoice: { id: 31309740199936, externalReference: 'doc:4f1c', invoiceNumber: null, openCents: null },
    });
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      body: {
        file_attachment_id: 93977575424,
        supplier_id: 1549933174784,
        date: '2026-10-02',
        deadline: '2026-11-01',
        currency: 'EUR',
        currency_amount_before_tax: '150.00',
        currency_tax: '15.50',
        currency_amount: '165.50',
        invoice_lines: [
          { label: '', currency_amount: '105.50', currency_tax: '5.50', vat_rate: 'FR_55' },
          { label: '', currency_amount: '60.00', currency_tax: '10.00', vat_rate: 'FR_200' },
        ],
        external_reference: 'doc:4f1c',
      },
    });
    expect(calls.at(-1)?.body).not.toHaveProperty('invoice_number');
  });

  it("aynı içerikli dosyanın 409'u var olan faturanın kimliğini döner; öteki ret hata kalır ve Pennylane'in sebebini taşır", async () => {
    const { port } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/import': [
        { status: 409, json: { status: 409, error: 'A document with ID 31309740199936 already exists with such attachment.' } },
        { status: 422, json: { status: 422, error: 'The sum of invoice lines "currency_amount" (100.0) does not match with the total' } },
      ],
    });
    expect(await port.importInvoice({ draft, fileId: 1 })).toEqual({ status: 'duplicate_file', existingId: 31309740199936 });
    await expect(port.importInvoice({ draft, fileId: 2 })).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('The sum of invoice lines'),
    });
  });

  it('satırları değişen faturada eski satırlar kimlikle silinir; yeni satırlar ve toplamlar aynı istekte gider', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/7/invoice_lines': [{ json: { items: [{ id: 41 }, { id: 42 }], has_more: false, next_cursor: null } }],
      '/supplier_invoices/7': [{ json: {} }],
    });
    await port.updateInvoice(7, { lines: [{ grossCents: 36_000, vatCents: 6_000, vatCode: 'FR_200' }] });
    expect(calls.at(-1)).toEqual({
      path: '/supplier_invoices/7',
      query: {},
      method: 'PUT',
      body: {
        currency_amount_before_tax: '300.00',
        currency_tax: '60.00',
        currency_amount: '360.00',
        invoice_lines: {
          delete: [{ id: 41 }, { id: 42 }],
          create: [{ label: '', currency_amount: '360.00', currency_tax: '60.00', vat_rate: 'FR_200' }],
        },
      },
    });
  });

  it('yazım sunucu hatasında tekrarlanmaz: karşıya ulaşmış yazımın tekrarı ikinci kayıt doğururdu', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/suppliers': [
        { status: 502, json: {} },
        { status: 201, json: { id: 1, name: 'Fournisseur', external_reference: 'sup:1' } },
      ],
    });
    await expect(
      port.createSupplier({ name: 'Fournisseur', externalReference: 'sup:1', vatNumber: null, dueDays: 30 }),
    ).rejects.toMatchObject({
      code: 'provider',
    });
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

describe('eşleşme', () => {
  it('faturanın açık kalanı işaretsiz okunur: Pennylane alış faturasında kalanı eksi verir, okunamayan kalan sıfır sayılmaz', async () => {
    const { port } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/1': [
        { json: { id: 1, external_reference: 'doc:a', invoice_number: 'F-1', remaining_amount_with_tax: '-360.0' } },
      ],
      '/supplier_invoices/2': [{ json: { id: 2, external_reference: 'doc:b', invoice_number: 'F-2', remaining_amount_with_tax: '0.0' } }],
      '/supplier_invoices/3': [{ json: { id: 3, external_reference: 'doc:c', invoice_number: 'F-3' } }],
    });
    expect((await port.getInvoice(1))?.openCents).toBe(36_000);
    expect((await port.getInvoice(2))?.openCents).toBe(0);
    expect((await port.getInvoice(3))?.openCents).toBeNull();
  });

  it('eşleşmeyi çözmek faturanın yolunda silme isteğidir; eşleme hareketin kimliğini gönderir', async () => {
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/7/matched_transactions': [{ status: 204, json: {} }],
      '/supplier_invoices/7/matched_transactions/9': [{ status: 204, json: {} }],
      '/transactions/9/matched_invoices': [
        {
          json: {
            items: [
              { id: 7, type: 'supplier' },
              { id: 8, type: 'customer' },
            ],
            has_more: false,
            next_cursor: null,
          },
        },
      ],
    });
    await port.matchTransaction({ invoiceId: 7, transactionId: 9 });
    await port.unmatchTransaction({ invoiceId: 7, transactionId: 9 });
    expect(calls.slice(-2).map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'POST', path: '/supplier_invoices/7/matched_transactions', body: { transaction_id: 9 } },
      { method: 'DELETE', path: '/supplier_invoices/7/matched_transactions/9', body: undefined },
    ]);
    expect(await port.transactionMatches(9)).toEqual([
      { invoiceId: 7, kind: 'supplier' },
      { invoiceId: 8, kind: 'customer' },
    ]);
  });
});

describe('analitik kategori', () => {
  it('faturanın kategorileri sayfa sayfa okunur ve ağırlık sayıya çevrilir; yazımda ağırlık dize gider, kategori grubuyla açılır', async () => {
    const category = (id: number, groupId: number, weight: string) => ({ id, label: `K${id}`, category_group: { id: groupId }, weight });
    const { port, calls } = fakePennylane({
      '/me': [{ json: SANDBOX_ME }],
      '/supplier_invoices/7/categories': [
        { json: { items: [category(21, 5, '1.0')], has_more: true, next_cursor: 'c2' } },
        { json: { items: [category(55, 9, '0.5')], has_more: false, next_cursor: null } },
      ],
      '/categories': [{ status: 201, json: { id: 31, label: 'Lezzet', category_group: { id: 5 } } }],
    });
    expect(await port.invoiceCategories(7)).toEqual([
      { id: 21, groupId: 5, weight: 1 },
      { id: 55, groupId: 9, weight: 0.5 },
    ]);
    expect(calls.filter((call) => call.path === '/supplier_invoices/7/categories').map((call) => call.query['cursor'] ?? null)).toEqual([
      null,
      'c2',
    ]);

    await port.setInvoiceCategories(7, [
      { id: 55, weight: 0.5 },
      { id: 21, weight: 1 },
    ]);
    expect(calls.at(-1)).toMatchObject({
      method: 'PUT',
      path: '/supplier_invoices/7/categories',
      body: [
        { id: 55, weight: '0.5' },
        { id: 21, weight: '1' },
      ],
    });
    expect(await port.createCategory({ label: 'Lezzet', groupId: 5 })).toEqual({ id: 31, label: 'Lezzet', groupId: 5 });
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/categories', body: { label: 'Lezzet', category_group_id: 5 } });
  });
});
