import { z } from 'zod';
import { env } from '../env';

/*
  `/api/v1` istemcisi: zarf sözleşmesi mobile-api `lib/respond.ts` ile aynı (`{ data, error }`, `error` bir anahtardır, cümle değil)
  ve her cevap çağıranın Zod şemasıyla parse edilir. Hata yutulmaz ama fırlatılmaz da: sonuç `ApiResult` desenidir.
*/

/**
 * İstemci tarafında DOĞAN taşıma hataları — sunucu bu iki anahtarı asla üretmez, o yüzden
 * telin anahtar kümesinden ayrı yaşarlar: ağ yok/istek atılamadı · gövde sözleşmeye uymuyor.
 */
export const CLIENT_ERROR = {
  network: 'network_error',
  invalidResponse: 'invalid_response',
} as const;

/** Sunucu zarfı — gövde şeması çağırandan gelir, zarfın kendisi burada tek kez doğrulanır. */
const EnvelopeSchema = z.object({ data: z.unknown(), error: z.string().nullable() });

export interface ApiOk<T> {
  data: T;
  error: null;
  status: number;
  retryAfterSec: null;
}

export interface ApiFail {
  data: null;
  /** Telin hata anahtarı ya da `CLIENT_ERROR` değerlerinden biri. */
  error: string;
  /** HTTP durum kodu; istek hiç atılamadıysa (ağ) `null` — 0 değil, bilinmiyor (CLAUDE §1). */
  status: number | null;
  /** 429'un `Retry-After` başlığı (saniye); yoksa `null`. */
  retryAfterSec: number | null;
}

export type ApiResult<T> = ApiOk<T> | ApiFail;

/**
 * Arızanın sınıfı, yani niçin yüklenemediği: `connection` istek ağa çıkamadı, `session` 401, `forbidden` 403, `unexpected` gerisi.
 * 401 "oturum doğrulanmadı" demektir, "öldü" değil: uç auth sunucusuna ulaşamadığında da 401 üretir, kapatma kararı tazeleme
 * cevabına bakar (`authorizedFetch`).
 */
export type ApiFailureCause = 'connection' | 'session' | 'forbidden' | 'unexpected';

/**
 * Düşen çağrının sebep sınıfı. `null` = sebep kaydı taşınmamış (200 döndü ama gövde boştu gibi
 * hâller) — o zaman bir sebep İDDİA EDİLMEZ, en dar doğru cümleye (`unexpected`) düşülür.
 */
export function failureCauseOf(failure: ApiFail | null): ApiFailureCause {
  if (failure === null) return 'unexpected';
  if (failure.error === CLIENT_ERROR.network) return 'connection';
  if (failure.status === 401) return 'session';
  if (failure.status === 403) return 'forbidden';
  return 'unexpected';
}

export interface ApiFetchInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Nesne verilir, metin değil: istemci kendisi JSON'a çevirir; metin verilseydi iki kez çevrilir ve uç `invalid_body` derdi. */
  body?: Record<string, unknown> | readonly unknown[];
  headers?: Record<string, string>;
}

/** `Retry-After` yalnız saniye biçiminde beklenir (sunucumuz öyle yazar); tarih biçimi `null` düşer. */
function readRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

/** Tek kapı: zarfı açar, gövdeyi verilen şemayla parse eder, 429'un bekleme süresini sonuca taşır. */
export async function apiFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    // fetch yalnız ağ/iptal durumunda fırlatır — HTTP hataları normal dönüştür. Yutulmuyor: anahtar sonuçta.
    return { data: null, error: CLIENT_ERROR.network, status: null, retryAfterSec: null };
  }

  const envelope = EnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (!envelope.success) {
    return { data: null, error: CLIENT_ERROR.invalidResponse, status: response.status, retryAfterSec: null };
  }

  if (envelope.data.error !== null) {
    return { data: null, error: envelope.data.error, status: response.status, retryAfterSec: readRetryAfter(response) };
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    // Zarf "başarı" dedi ama gövde sözleşmeye uymuyor — bu bizim hatamız, müşteri hâli değil.
    return { data: null, error: CLIENT_ERROR.invalidResponse, status: response.status, retryAfterSec: null };
  }

  return { data: parsed.data, error: null, status: response.status, retryAfterSec: null };
}

/**
 * Sorgu dizesi `?a=1&b=2`: `undefined` olan atlanır, sonuç boşsa dize de boş. Tek kopya, çünkü `encodeURIComponent` gibi bir
 * düzeltme kopyaların yalnız birine uygulanırdı; `packages.ts`in `queryOf`u imzası başka olduğu için ayrıdır.
 */
export function queryString(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
