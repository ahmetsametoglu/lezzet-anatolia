import { toCents } from '@lezzet/helper';
import {
  PennylaneApiBankAccountPageSchema,
  PennylaneApiChangePageSchema,
  PennylaneApiMeSchema,
  PennylaneApiTransactionPageSchema,
  PennylaneApiTransactionSchema,
  type PennylaneApiTransaction,
  type PennylaneBankAccount,
  type PennylaneCompany,
  type PennylaneMode,
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

const realClock = { now: () => Date.now(), sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) };

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

  // Okuma tekrarlanabilir: 429'da Pennylane'in söylediği kadar, sunucu ve ağ arızasında artan aralıkla beklenir.
  const get = async (path: string): Promise<unknown> => {
    let failures = 0;
    let limited = 0;
    for (;;) {
      await pace();
      try {
        const res = await once(config, path);
        const body = await readBody(res);
        if (res.ok) return body;
        const error = new PennylaneError(classify(res.status, body));
        if (error.code === 'rate_limited' && ++limited < RATE_LIMIT_ATTEMPTS) {
          await clock.sleep(retryAfterMs(res));
          continue;
        }
        if (error.code !== 'provider' || ++failures >= GET_ATTEMPTS) throw error;
      } catch (err) {
        if (!(err instanceof PennylaneError) || err.code !== 'network' || ++failures >= GET_ATTEMPTS) throw err;
      }
      await clock.sleep(failures * 1000);
    }
  };

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
        return { id, name, regNo: reg_no };
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
      let body: unknown;
      try {
        body = await read(`/transactions/${id}`);
      } catch (err) {
        if (err instanceof PennylaneError && err.code === 'not_found') return null;
        throw err;
      }
      return transactionOf(parse(PennylaneApiTransactionSchema, body, 'hareket'));
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
  };
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

async function once(config: PennylaneConfig, path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await (config.fetchImpl ?? fetch)(`${BASE}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
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
