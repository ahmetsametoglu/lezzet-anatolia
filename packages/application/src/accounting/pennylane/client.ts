import { toCents } from '@lezzet/helper';
import {
  PennylaneModeEnum,
  PennylaneApiBankAccountPageSchema,
  PennylaneApiChangePageSchema,
  PennylaneApiFileAttachmentSchema,
  PennylaneApiInvoiceLinePageSchema,
  PennylaneApiInvoicePageSchema,
  PennylaneApiInvoiceSchema,
  PennylaneApiMeSchema,
  PennylaneApiSupplierPageSchema,
  PennylaneApiSupplierSchema,
  PennylaneApiTransactionPageSchema,
  PennylaneApiTransactionSchema,
  type PennylaneApiTransaction,
  type PennylaneBankAccount,
  type PennylaneCompany,
  type PennylaneInvoice,
  type PennylaneInvoiceLine,
  type PennylaneMode,
  type PennylaneSupplier,
  type PennylaneTransaction,
} from '@lezzet/types';
import type { PennylanePort } from './port';
import { PennylaneError, classify } from './errors';

/**
 * Pennylane REST istemcisi (Company API v2) ve portun uyarlaması; resmî SDK yok. Kip ile anahtarın şirketi uyuşmadan hiçbir istek
 * gitmez, çünkü test kipinde canlı şirketin hareketi test veritabanına, canlı kipte test şirketinin uydurma hareketi deftere karışırdı.
 */

export interface PennylaneConfig {
  token: string;
  mode: PennylaneMode;
  /** Test için enjekte edilir — sahte sağlayıcı ağa çıkmaz. */
  fetchImpl?: typeof fetch;
  /** Test için enjekte edilir — istek sınırının beklemesi gerçek saatte geçmesin. */
  clock?: { now(): number; sleep(ms: number): Promise<void> };
}

const BASE = 'https://app.pennylane.com/api/external/v2';
/** Pennylane anahtar başına 5 saniyede 25 istek kabul eder; fazlası 429 döner. */
const WINDOW_MS = 5_000;
const WINDOW_LIMIT = 25;
const TIMEOUT_MS = 20_000;
const GET_ATTEMPTS = 3;
const RATE_LIMIT_ATTEMPTS = 4;
const PAGE_LIMIT = 100;
const CHANGE_PAGE_LIMIT = 1000;
/** Fatura araması dış referans ya da tedarikçi ve numarayla yapılır; sonuç bir iki kayıttır. */
const INVOICE_PAGE_LIMIT = 20;

const realClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

/** Anahtar ya da kip yoksa port yoktur: Pennylane'e bağlanamayan eşitleme "okudum" diyemesin. */
export function pennylaneFromEnv(): PennylanePort | null {
  const token = process.env.PENNYLANE_API_TOKEN;
  const mode = PennylaneModeEnum.safeParse(process.env.PENNYLANE_MODE);
  if (!token || !mode.success) return null;
  return pennylanePort({ token, mode: mode.data });
}

/** Muhasebe portunun Pennylane uyarlaması; anahtarın şirketi ilk istekte bir kez okunur ve kiple karşılaştırılır. */
export function pennylanePort(config: PennylaneConfig): PennylanePort {
  const clock = config.clock ?? realClock;
  const sent: number[] = [];

  // Pencerenin son 25 isteği tutulur; doluysa en eskisi pencereden çıkana kadar beklenir.
  const pace = async () => {
    for (;;) {
      const now = clock.now();
      while (sent.length > 0 && now - sent[0]! >= WINDOW_MS) sent.shift();
      if (sent.length < WINDOW_LIMIT) {
        sent.push(now);
        return;
      }
      await clock.sleep(WINDOW_MS - (now - sent[0]!));
    }
  };

  // 429'da Pennylane'in söylediği kadar beklenir. Sunucu ve ağ arızasında yalnız okuma tekrarlanır; yazım tekrarı kuyruğundur, çünkü
  // karşıya ulaşmış bir yazım tekrarlanınca ikinci kayıt doğardı.
  const send = async (method: Method, path: string, payload: Payload): Promise<unknown> => {
    const retries = method === 'GET';
    let failures = 0;
    let limited = 0;
    for (;;) {
      await pace();
      try {
        const res = await once(config, method, path, payload);
        const body = await readBody(res);
        if (res.ok) return body;
        const error = new PennylaneError(classify(res.status, body));
        if (error.code === 'rate_limited' && ++limited < RATE_LIMIT_ATTEMPTS) {
          await clock.sleep(retryAfterMs(res));
          continue;
        }
        if (!retries || error.code !== 'provider' || ++failures >= GET_ATTEMPTS) throw error;
      } catch (err) {
        if (!retries || !(err instanceof PennylaneError) || err.code !== 'network' || ++failures >= GET_ATTEMPTS) throw err;
      }
      await clock.sleep(failures * 1000);
    }
  };
  const get = (path: string) => send('GET', path, null);

  let company: Promise<PennylaneCompany> | null = null;
  const verifiedCompany = (): Promise<PennylaneCompany> => {
    company ??= get('/me')
      .then((body) => parse(PennylaneApiMeSchema, body, 'şirket').company)
      .then(({ id, name, reg_no }) => {
        const sandbox = reg_no.startsWith('sandbox-');
        if (sandbox !== (config.mode === 'sandbox')) {
          throw new PennylaneError({
            code: 'company_mismatch',
            message: sandbox
              ? `Pennylane canlı kipte ama anahtar test şirketinin (${name}) — PENNYLANE_MODE ya da anahtar yanlış`
              : `Pennylane test kipinde ama anahtar canlı şirketin (${name}) — PENNYLANE_MODE ya da anahtar yanlış`,
          });
        }
        return { id, name, regNo: reg_no, mode: config.mode };
      })
      .catch((err: unknown) => {
        company = null;
        throw err;
      });
    return company;
  };
  const read = async (path: string): Promise<unknown> => {
    await verifiedCompany();
    return get(path);
  };
  const write = async (method: 'POST' | 'PUT', path: string, payload: Payload): Promise<unknown> => {
    await verifiedCompany();
    return send(method, path, payload);
  };
  const orNull = async <T>(load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load();
    } catch (err) {
      if (err instanceof PennylaneError && err.code === 'not_found') return null;
      throw err;
    }
  };

  return {
    company: verifiedCompany,
    async listBankAccounts() {
      const accounts: PennylaneBankAccount[] = [];
      let cursor: string | null = null;
      do {
        const body: unknown = await read(`/bank_accounts?${query({ limit: PAGE_LIMIT, cursor })}`);
        const page = parse(PennylaneApiBankAccountPageSchema, body, 'banka hesapları');
        accounts.push(...page.items);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return accounts;
    },
    async listTransactions({ bankAccountId, fromDate, cursor }) {
      // Süzgecin adı `filter`dır (`filters` sessizce yok sayılır) ve imleç süzgeci taşımaz: her sayfada yeniden gönderilir.
      const filter = JSON.stringify([
        { field: 'bank_account_id', operator: 'eq', value: String(bankAccountId) },
        { field: 'date', operator: 'gteq', value: fromDate },
      ]);
      const body = await read(`/transactions?${query({ filter, sort: 'id', limit: PAGE_LIMIT, cursor })}`);
      const page = parse(PennylaneApiTransactionPageSchema, body, 'hareketler');
      return { items: page.items.map(transactionOf), nextCursor: page.has_more ? page.next_cursor : null };
    },
    async getTransaction(id) {
      const body = await orNull(() => read(`/transactions/${id}`));
      return body === null ? null : transactionOf(parse(PennylaneApiTransactionSchema, body, 'hareket'));
    },
    async transactionChanges(input) {
      // `start_date` ile `cursor` birlikte 400 döner: ilk sayfa andan, sonrakiler imleçten.
      const params = input.cursor !== null ? { cursor: input.cursor } : { start_date: input.since };
      const body = await read(`/changelogs/transactions?${query({ ...params, limit: CHANGE_PAGE_LIMIT })}`);
      const page = parse(PennylaneApiChangePageSchema, body, 'hareket değişiklikleri');
      return {
        items: page.items.map((item) => ({ id: item.id, operation: item.operation, processedAt: item.processed_at })),
        nextCursor: page.has_more ? page.next_cursor : null,
      };
    },
    async findSupplier(externalReference) {
      const filter = JSON.stringify([{ field: 'external_reference', operator: 'eq', value: externalReference }]);
      const page = parse(PennylaneApiSupplierPageSchema, await read(`/suppliers?${query({ filter, limit: 2 })}`), 'tedarikçiler');
      return page.items[0] ? supplierOf(page.items[0]) : null;
    },
    async createSupplier(draft) {
      const body = await write('POST', '/suppliers', {
        json: {
          name: draft.name,
          external_reference: draft.externalReference,
          ...(draft.vatNumber ? { vat_number: draft.vatNumber } : {}),
          ...(draft.dueDays !== null ? { supplier_due_date_delay: draft.dueDays } : {}),
        },
      });
      return supplierOf(parse(PennylaneApiSupplierSchema, body, 'tedarikçi'));
    },
    async findInvoices(filter) {
      const conditions =
        'externalReference' in filter
          ? [{ field: 'external_reference', operator: 'eq', value: filter.externalReference }]
          : [
              { field: 'supplier_id', operator: 'eq', value: String(filter.supplierId) },
              { field: 'invoice_number', operator: 'eq', value: filter.invoiceNumber },
            ];
      const body = await read(`/supplier_invoices?${query({ filter: JSON.stringify(conditions), limit: INVOICE_PAGE_LIMIT })}`);
      return parse(PennylaneApiInvoicePageSchema, body, 'faturalar').items.map(invoiceOf);
    },
    async getInvoice(id) {
      const body = await orNull(() => read(`/supplier_invoices/${id}`));
      return body === null ? null : invoiceOf(parse(PennylaneApiInvoiceSchema, body, 'fatura'));
    },
    async uploadFile({ bytes, contentType, filename }) {
      const form = new FormData();
      form.append('file', new Blob([Uint8Array.from(bytes)], { type: contentType }), filename);
      return parse(PennylaneApiFileAttachmentSchema, await write('POST', '/file_attachments', { form }), 'dosya').id;
    },
    async importInvoice({ draft, fileId }) {
      try {
        const body = await write('POST', '/supplier_invoices/import', {
          json: {
            file_attachment_id: fileId,
            supplier_id: draft.supplierId,
            date: draft.date,
            deadline: draft.deadline,
            ...(draft.invoiceNumber ? { invoice_number: draft.invoiceNumber } : {}),
            currency: 'EUR',
            ...totalsOf(draft.lines),
            invoice_lines: draft.lines.map(lineOf),
            external_reference: draft.externalReference,
          },
        });
        return { status: 'imported', invoice: invoiceOf(parse(PennylaneApiInvoiceSchema, body, 'fatura')) };
      } catch (err) {
        const existingId = err instanceof PennylaneError && err.code === 'conflict' ? existingDocumentId(err.detail) : null;
        if (existingId === null) throw err;
        return { status: 'duplicate_file', existingId };
      }
    },
    async updateInvoice(id, patch) {
      const body: Record<string, unknown> = {};
      if (patch.supplierId !== undefined) body['supplier_id'] = patch.supplierId;
      if (patch.date !== undefined) body['date'] = patch.date;
      if (patch.deadline !== undefined) body['deadline'] = patch.deadline;
      if (patch.invoiceNumber !== undefined) body['invoice_number'] = patch.invoiceNumber;
      if (patch.lines) {
        const current: number[] = [];
        let cursor: string | null = null;
        do {
          const raw: unknown = await read(`/supplier_invoices/${id}/invoice_lines?${query({ limit: PAGE_LIMIT, cursor })}`);
          const page = parse(PennylaneApiInvoiceLinePageSchema, raw, 'fatura satırları');
          current.push(...page.items.map((line) => line.id));
          cursor = page.has_more ? page.next_cursor : null;
        } while (cursor);
        Object.assign(body, totalsOf(patch.lines), {
          invoice_lines: { delete: current.map((lineId) => ({ id: lineId })), create: patch.lines.map(lineOf) },
        });
      }
      await write('PUT', `/supplier_invoices/${id}`, { json: body });
    },
    async setPaymentStatus(id, status) {
      await write('PUT', `/supplier_invoices/${id}/payment_status`, { json: { payment_status: status } });
    },
  };
}

function supplierOf(row: { id: number; name: string; external_reference: string | null }): PennylaneSupplier {
  return { id: row.id, name: row.name, externalReference: row.external_reference };
}

function invoiceOf(row: { id: number; external_reference: string | null; invoice_number: string | null }): PennylaneInvoice {
  return { id: row.id, externalReference: row.external_reference, invoiceNumber: row.invoice_number };
}

const euros = (cents: number) => (cents / 100).toFixed(2);

/** Toplamlar satırlardan: içe aktarma satır toplamı tutmayan faturayı reddeder, güncelleme hiç bakmaz. */
function totalsOf(lines: readonly PennylaneInvoiceLine[]) {
  const gross = lines.reduce((sum, line) => sum + line.grossCents, 0);
  const vat = lines.reduce((sum, line) => sum + line.vatCents, 0);
  return { currency_amount_before_tax: euros(gross - vat), currency_tax: euros(vat), currency_amount: euros(gross) };
}

/** Güncellemede yeni satır etiket ister; boş etiketi Pennylane kabul ediyor. */
function lineOf(line: PennylaneInvoiceLine) {
  return { label: '', currency_amount: euros(line.grossCents), currency_tax: euros(line.vatCents), vat_rate: line.vatCode };
}

/** 409 aynı içerikli dosyanın durduğu faturanın kimliğini metinde taşır ("A document with ID … already exists"). */
function existingDocumentId(detail: unknown): number | null {
  const match = /document with ID (\d+)/i.exec(JSON.stringify(detail ?? ''));
  return match ? Number(match[1]) : null;
}

function transactionOf(row: PennylaneApiTransaction): PennylaneTransaction {
  const signed = toCents(Number(row.amount));
  return {
    id: row.id,
    bankAccountId: row.bank_account.id,
    date: row.date,
    label: row.label,
    direction: signed < 0 ? 'out' : 'in',
    amountCents: Math.abs(signed),
    currency: row.currency,
    archived: row.archived_at !== null,
    updatedAt: row.updated_at,
  };
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) search.set(key, String(value));
  return search.toString();
}

/** `retry-after` saniyedir; yoksa pencerenin yarısı beklenir. */
function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : WINDOW_MS / 2;
}

interface Parser<T> {
  safeParse(body: unknown): { success: true; data: T } | { success: false };
}

function parse<T>(schema: Parser<T>, body: unknown, what: string): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new PennylaneError({ code: 'parse', message: `Pennylane ${what} cevabı beklenen biçimde değil`, detail: body });
  return result.data;
}

type Method = 'GET' | 'POST' | 'PUT';
type Payload = { json: unknown } | { form: FormData } | null;

async function once(config: PennylaneConfig, method: Method, path: string, payload: Payload): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = { Authorization: `Bearer ${config.token}`, Accept: 'application/json' };
  if (payload && 'json' in payload) headers['Content-Type'] = 'application/json';
  try {
    return await (config.fetchImpl ?? fetch)(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers,
      ...(payload ? { body: 'json' in payload ? JSON.stringify(payload.json) : payload.form } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PennylaneError({
      code: 'network',
      message: /abort/i.test(message) ? `Pennylane isteği zaman aşımına uğradı (${TIMEOUT_MS} ms)` : `Pennylane'e ulaşılamadı: ${message}`,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}
