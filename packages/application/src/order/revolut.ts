import {
  RevolutApiOrderSchema,
  RevolutApiPayoutSchema,
  RevolutModeEnum,
  RevolutOrderStateEnum,
  type RevolutApiOrder,
  type RevolutMode,
} from '@lezzet/types';
import type { CheckoutSessionCreator } from './checkout-session';
import type { PaymentGateway, PaymentSnapshot } from './payment-gateway';

/**
 * Revolut Merchant API istemcisi ve ödeme portlarının uyarlaması (`docs/feature/kasa-muhasebe.md` §6); resmî sunucu SDK'sı yok, REST
 * `fetch` ile konuşulur. Gizli anahtar yalnız sunucuda okunur; paket React Native ağacında da durduğu için Node'a özgü modül almaz.
 */

export interface RevolutConfig {
  secretKey: string;
  mode: RevolutMode;
  /** Test için enjekte edilir — sahte sağlayıcı ağa çıkmaz. */
  fetchImpl?: typeof fetch;
}

/** Kullandığımız API sürümü; sürüm başlığı zorunlu uçlarda başlıksız istek reddedilir. */
const API_VERSION = '2026-08-17';
const TIMEOUT_MS = 20_000;
const BASE: Record<RevolutMode, string> = {
  sandbox: 'https://sandbox-merchant.revolut.com',
  live: 'https://merchant.revolut.com',
};

export type RevolutErrorCode = 'credentials' | 'not_found' | 'validation' | 'provider' | 'network' | 'parse';

export class RevolutError extends Error {
  readonly code: RevolutErrorCode;
  readonly status: number | null;

  constructor(code: RevolutErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'RevolutError';
    this.code = code;
    this.status = status;
  }
}

export interface RevolutClient {
  readonly mode: RevolutMode;
  request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, opts?: { idempotencyKey?: string }): Promise<unknown>;
}

/** Anahtar ya da kip yoksa istemci yoktur: sağlayıcıya bağlanamayan akış "ödendi" ya da "ödenmedi" diyemesin. */
export function revolutConfigFromEnv(env: Record<string, string | undefined> = process.env): RevolutConfig | null {
  const mode = RevolutModeEnum.safeParse(env.REVOLUT_MODE);
  if (!env.REVOLUT_SECRET_KEY || !mode.success) return null;
  return { secretKey: env.REVOLUT_SECRET_KEY, mode: mode.data };
}

export function revolutClient(config: RevolutConfig): RevolutClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    mode: config.mode,
    async request(method, path, body, opts) {
      let res: Response;
      try {
        res = await fetchImpl(`${BASE[config.mode]}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${config.secretKey}`,
            'Revolut-Api-Version': API_VERSION,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(opts?.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new RevolutError('network', `Revolut'a ulaşılamadı: ${error instanceof Error ? error.message : String(error)}`);
      }
      const text = await res.text();
      const parsed: unknown = text ? safeJson(text) : null;
      if (res.ok) return parsed;
      const said = typeof parsed === 'object' && parsed !== null && 'message' in parsed ? String(parsed.message) : text.slice(0, 200);
      if (res.status === 401 || res.status === 403)
        throw new RevolutError('credentials', `Revolut anahtarı reddedildi (${res.status})`, res.status);
      if (res.status === 404) throw new RevolutError('not_found', `Revolut kaydı bulunamadı (404): ${said}`, res.status);
      if (res.status >= 500) throw new RevolutError('provider', `Revolut sunucu hatası (${res.status})`, res.status);
      throw new RevolutError('validation', `Revolut isteği reddetti (${res.status}): ${said}`, res.status);
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function readRevolutOrder(client: RevolutClient, orderRef: string): Promise<RevolutApiOrder> {
  const parsed = RevolutApiOrderSchema.safeParse(await client.request('GET', `/api/orders/${encodeURIComponent(orderRef)}`));
  if (!parsed.success) throw new RevolutError('parse', `Revolut siparişi beklenen biçimde değil: ${parsed.error.message}`);
  return parsed.data;
}

/** Ödenmeyen siparişin sağlayıcıda düşeceği süre; sağlayıcı süreyi birkaç dakika gecikmeyle uygular, pencere bize kalır. */
function expiryDuration(untilIso: string, now: Date): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(untilIso) - now.getTime()) / 60_000));
  return `PT${minutes}M`;
}

/**
 * Sağlayıcı siparişinin bizden okuduğumuz yüzü: durum Revolut'un sözlüğünde değilse karar verilmez, çünkü yanlış tahmin ödenmiş bir
 * siparişi iptal ettirebilirdi. Alınan tutar yalnız tamamlanmış siparişte vardır.
 */
export function snapshotOf(order: RevolutApiOrder): PaymentSnapshot | null {
  const state = RevolutOrderStateEnum.safeParse(order.state);
  if (!state.success) return null;
  return {
    id: order.id,
    status: state.data,
    amountReceivedCents: state.data === 'completed' ? order.amount - (order.outstanding_amount ?? 0) : 0,
    orderId: order.metadata?.order_id ?? null,
    paymentToken: order.token ?? null,
  };
}

export function revolutGateway(client: RevolutClient | null): PaymentGateway | null {
  if (!client) return null;
  return {
    async read(orderRef) {
      return snapshotOf(await readRevolutOrder(client, orderRef));
    },
    async cancel(orderRef) {
      await client.request('POST', `/api/orders/${encodeURIComponent(orderRef)}/cancel`);
    },
    // Kalanın tamamı iade edilir; anahtar siparişten türer ki aynı iade iki kez gönderilse de para bir kez döner.
    async refund(orderRef) {
      const order = await readRevolutOrder(client, orderRef);
      const remaining = order.amount - (order.refunded_amount ?? 0);
      if (remaining <= 0) return;
      await refundRevolutOrder(client, { orderRef, amountCents: remaining, currency: order.currency, idempotencyKey: `full:${order.id}` });
    },
  };
}

/** Kısmi ya da tam iade; sağlayıcı iadeyi ayrı bir sipariş olarak açar ve sonucu o siparişin olayıyla bildirir. */
export async function refundRevolutOrder(
  client: RevolutClient,
  input: { orderRef: string; amountCents: number; currency?: string; idempotencyKey: string; reference?: string },
): Promise<{ refundOrderId: string }> {
  const created = RevolutApiOrderSchema.safeParse(
    await client.request(
      'POST',
      `/api/orders/${encodeURIComponent(input.orderRef)}/refund`,
      {
        amount: input.amountCents,
        currency: input.currency ?? 'EUR',
        ...(input.reference ? { merchant_order_data: { reference: input.reference } } : {}),
      },
      { idempotencyKey: input.idempotencyKey.slice(0, 50) },
    ),
  );
  if (!created.success) throw new RevolutError('parse', `Revolut iade cevabı beklenen biçimde değil: ${created.error.message}`);
  return { refundOrderId: created.data.id };
}

/**
 * Ödeme açma portunun Revolut uyarlaması: sipariş künyeye yazılır ki webhook ve zamanlayıcı ödemeyi siparişe bağlayabilsin; ödeme
 * ayırmanın bittiği an sağlayıcıda da düşer.
 */
export function revolutSessionCreator(client: RevolutClient | null): CheckoutSessionCreator | null {
  if (!client) return null;
  return async (params) => {
    const body = {
      amount: params.amountCents,
      currency: 'EUR',
      description: params.description,
      merchant_order_data: { reference: params.orderId },
      metadata: { order_id: params.orderId, customer_id: params.customerId, reservation_expires_at: params.reservationExpiresAt },
      expire_pending_after: expiryDuration(params.reservationExpiresAt, new Date()),
    };

    const created = RevolutApiOrderSchema.safeParse(await client.request('POST', '/api/orders', body));
    if (!created.success) throw new RevolutError('parse', `Revolut sipariş cevabı beklenen biçimde değil: ${created.error.message}`);
    return { id: created.data.id, paymentToken: created.data.token ?? null };
  };
}

/** Tahsil edilmiş ödemenin komisyonu; sağlayıcı tahsilden hemen sonra yazar. `null` = henüz yazılmamış ya da ödeme yok. */
export function revolutFeeOf(order: RevolutApiOrder): { feeCents: number; paymentId: string } | null {
  const paid = (order.payments ?? []).find((payment) => (payment.fees ?? []).length > 0);
  if (!paid) return null;
  return { feeCents: (paid.fees ?? []).reduce((sum, fee) => sum + fee.amount, 0), paymentId: paid.id };
}

/** Merchant hesabından ana hesaba aktarım; tutar aktarım tamamlanınca dolar. */
export async function readRevolutPayout(client: RevolutClient, payoutId: string) {
  const parsed = RevolutApiPayoutSchema.safeParse(await client.request('GET', `/api/payouts/${encodeURIComponent(payoutId)}`));
  if (!parsed.success) throw new RevolutError('parse', `Revolut aktarımı beklenen biçimde değil: ${parsed.error.message}`);
  return parsed.data;
}
