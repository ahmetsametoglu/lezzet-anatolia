import { fromCents, toCents } from '@lezzet/helper';
import {
  HiboutikCreatedLineSchema,
  HiboutikCreatedPaymentSchema,
  HiboutikCreatedProductSchema,
  HiboutikCreatedSaleSchema,
  HiboutikCreatedTillMoveSchema,
  HiboutikProductListSchema,
  HiboutikSaleIdListSchema,
  HiboutikSaleReadSchema,
  HiboutikTaxListSchema,
  HiboutikTillMoveListSchema,
  type HiboutikSale,
  type PaymentMethod,
  type RegisterSale,
} from '@lezzet/types';
import type { CashRegister } from '../port';
import { HiboutikError, classify } from './errors';

/**
 * Hiboutik REST istemcisi ve kasa portunun uyarlaması; resmî SDK yok. Yazan istek tekrarlanmaz ki satış ya da ödeme iki kez yazılmasın,
 * tekrar eşitleme kuyruğunun işidir.
 */

export interface HiboutikConfig {
  account: string;
  user: string;
  apiKey: string;
  /** Test için enjekte edilir — sahte sağlayıcı ağa çıkmaz. */
  fetchImpl?: typeof fetch;
}

/** Ödeme türü kodları kasada tanımlıdır; kasada açılmamış kodla yazılan ödeme reddedilir. */
const CODE_OF: Record<PaymentMethod, string> = { cash: 'ESP', card: 'CB', online: 'WEB', bank_transfer: 'VIR' };
const METHOD_OF = new Map<string, PaymentMethod>(Object.entries(CODE_OF).map(([method, code]) => [code, method as PaymentMethod]));

const TIMEOUT_MS = 15_000;
const GET_ATTEMPTS = 3;
const OPEN_SALE_COMPLETED_AT = '0000-00-00 00:00:00';

const amount = (cents: number): string => fromCents(cents).toFixed(2);
/** Kalem KDV'si kesir ister (`0.055`); yüzde ya da vergi kimliği reddedilir. */
const vatFraction = (ratePercent: number): string => String(Math.round(ratePercent * 1000) / 100_000);
const percentOf = (fraction: number): number => Math.round(fraction * 10_000) / 100;

/** Anahtar yoksa port yoktur: kasaya yazamayan eşitleme "yazdım" diyemesin. */
export function hiboutikFromEnv(): CashRegister | null {
  const { HIBOUTIK_ACCOUNT, HIBOUTIK_USER, HIBOUTIK_API_KEY } = process.env;
  if (!HIBOUTIK_ACCOUNT || !HIBOUTIK_USER || !HIBOUTIK_API_KEY) return null;
  return hiboutikRegister({ account: HIBOUTIK_ACCOUNT, user: HIBOUTIK_USER, apiKey: HIBOUTIK_API_KEY });
}

/** Kasa portunun Hiboutik uyarlaması; vergi kimlikleri ilk ihtiyaçta bir kez okunur. */
export function hiboutikRegister(config: HiboutikConfig): CashRegister {
  let taxes: Promise<Map<number, number>> | null = null;
  const taxIdOf = async (vatRate: number): Promise<number> => {
    taxes ??= request(config, '/taxes', 'GET')
      .then((body) => parse(HiboutikTaxListSchema, body, 'vergi listesi'))
      .then((rows) => new Map(rows.filter((row) => row.tax_enabled !== 0).map((row) => [percentOf(Number(row.tax_value)), row.tax_id])))
      .catch((err: unknown) => {
        taxes = null;
        throw err;
      });
    const taxId = (await taxes).get(vatRate);
    if (taxId === undefined) throw new HiboutikError({ code: 'validation', message: `Kasada %${vatRate} KDV oranı tanımlı değil` });
    return taxId;
  };
  const setProduct = (productId: number, attribute: string, value: string) =>
    request(config, `/product/${productId}`, 'PUT', { product_attribute: attribute, new_value: value });
  const setSale = (saleId: number, attribute: string, value: string) =>
    request(config, `/sale/${saleId}`, 'PUT', { sale_attribute: attribute, new_value: value });

  return {
    async findProductByRef(refExt) {
      const body = await request(config, `/products/search?products_ref_ext=${encodeURIComponent(refExt)}`, 'GET');
      return parse(HiboutikProductListSchema, body, 'ürün araması')[0]?.product_id ?? null;
    },
    async createProduct(input) {
      const body = await request(config, '/products', 'POST', {
        product_model: input.name,
        product_price: amount(input.priceCents),
        product_vat: await taxIdOf(input.vatRate),
        product_stock_management: 0,
        products_ref_ext: input.refExt,
      });
      return parse(HiboutikCreatedProductSchema, body, 'ürün').product_id;
    },
    async updateProduct(productId, change) {
      if (change.name !== undefined) await setProduct(productId, 'product_model', change.name);
      if (change.priceCents !== undefined) await setProduct(productId, 'product_price', amount(change.priceCents));
      if (change.vatRate !== undefined) await setProduct(productId, 'product_vat', String(await taxIdOf(change.vatRate)));
    },
    async createSale(storeId) {
      const body = await request(config, '/sales', 'POST', { store_id: storeId, currency_code: 'EUR' });
      return parse(HiboutikCreatedSaleSchema, body, 'satış').sale_id;
    },
    async prepareSale(saleId, extRef) {
      await setSale(saleId, 'ext_ref', extRef);
      // `DIV`: tutarlar ödeme satırıyla açık yazılır, eksik ya da fazla ödeme satışın bakiyesinde görünür.
      await setSale(saleId, 'payment', 'DIV');
    },
    async addLine(input) {
      const body = await request(config, '/sales/add_product', 'POST', {
        sale_id: input.saleId,
        product_id: input.productId,
        quantity: input.quantity,
        product_price: amount(input.unitPriceCents),
        stock_withdrawal: '1',
      });
      const lineId = parse(HiboutikCreatedLineSchema, body, 'satış kalemi').id_sale_product_detail;
      if (input.vatRate !== null) {
        await request(config, `/sale_line_item/${lineId}`, 'PUT', { line_item_attribute: 'vat', new_value: vatFraction(input.vatRate) });
      }
      return lineId;
    },
    async deleteLine(lineId) {
      await request(config, `/sale_line_item/${lineId}`, 'DELETE');
    },
    async addPayment(input) {
      const body = await request(config, '/sales_payment_div', 'POST', {
        sale_id: input.saleId,
        payment_type: CODE_OF[input.method],
        payment_amount: amount(input.amountCents),
      });
      return parse(HiboutikCreatedPaymentSchema, body, 'ödeme satırı').payment_detail_id;
    },
    async deletePayment(paymentId) {
      await request(config, `/sales_payment_div/${paymentId}`, 'DELETE');
    },
    async closeSale(saleId) {
      await request(config, '/sales/close', 'POST', { sale_id: saleId });
    },
    async readSale(saleId) {
      let body: unknown;
      try {
        body = await request(config, `/sales/${saleId}`, 'GET');
      } catch (err) {
        if (err instanceof HiboutikError && err.code === 'not_found') return null;
        throw err;
      }
      return saleOf(parse(HiboutikSaleReadSchema, body, 'satış')[0]!);
    },
    async findSaleIdsByExtRef(extRef) {
      const body = await request(config, `/sales/search/ext_ref/${encodeURIComponent(extRef)}`, 'GET');
      return parse(HiboutikSaleIdListSchema, body, 'satış araması').map((row) => row.sale_id);
    },
    async moveCash(input) {
      const body = await request(config, input.direction === 'in' ? '/till/cash_in' : '/till/cash_out', 'POST', {
        store_id: input.storeId,
        amount: amount(input.amountCents),
        currency_code: 'EUR',
        comments: input.label,
      });
      return parse(HiboutikCreatedTillMoveSchema, body, 'kasa hareketi').till_id;
    },
    async listCashMoves(storeId, month) {
      const body = await request(config, `/till/${storeId}/${month.year}/${String(month.month).padStart(2, '0')}`, 'GET');
      return parse(HiboutikTillMoveListSchema, body, 'kasa hareketleri').map((row) => ({ tillId: row.till_id, label: row.comments ?? '' }));
    },
  };
}

function saleOf(row: HiboutikSale): RegisterSale {
  return {
    saleId: row.sale_id,
    extRef: row.sale_ext_ref ?? '',
    closed: row.completed_at !== OPEN_SALE_COMPLETED_AT,
    uniqueSaleId: row.unique_sale_id ? row.unique_sale_id : null,
    receiptUrl: row.url_receipt ? row.url_receipt : null,
    lines: row.line_items.map((line) => ({
      lineId: line.line_item_id,
      productId: line.product_id,
      quantity: line.quantity,
      unitPriceCents: toCents(Number(line.product_price)),
      vatRate: percentOf(Number(line.vat)),
    })),
    payments: row.payment_details.map((payment) => ({
      paymentId: payment.payment_detail_id,
      method: METHOD_OF.get(payment.payment_type) ?? null,
      amountCents: toCents(Number(payment.payment_amount)),
    })),
  };
}

interface Parser<T> {
  safeParse(body: unknown): { success: true; data: T } | { success: false };
}

function parse<T>(schema: Parser<T>, body: unknown, what: string): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HiboutikError({ code: 'parse', message: `Hiboutik ${what} cevabı beklenen biçimde değil`, detail: body });
  return result.data;
}

async function request(config: HiboutikConfig, path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<unknown> {
  const attempts = method === 'GET' ? GET_ATTEMPTS : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await once(config, path, method, body);
      const parsed = await readBody(res);
      if (res.ok) return parsed;
      const error = new HiboutikError(classify(res.status, parsed));
      if (error.code !== 'provider' || attempt >= attempts) throw error;
    } catch (err) {
      if (!(err instanceof HiboutikError) || err.code !== 'network' || attempt >= attempts) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
}

async function once(config: HiboutikConfig, path: string, method: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await (config.fetchImpl ?? fetch)(`https://${config.account}.hiboutik.com/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.user}:${config.apiKey}`).toString('base64')}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HiboutikError({
      code: 'network',
      message: /abort/i.test(message) ? `Hiboutik isteği zaman aşımına uğradı (${TIMEOUT_MS} ms)` : `Hiboutik'e ulaşılamadı: ${message}`,
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
