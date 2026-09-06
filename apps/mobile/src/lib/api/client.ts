import { z } from 'zod';
import { env } from '../env';

/*
  `/api/v1` istemcisi — zarf sözleşmesi apps/mobile-api `lib/respond.ts` ile AYNI:
  `{ data, error }`; başarıda `error: null`, hatada `data: null`; `error` bir ANAHTARDIR, cümle
  değil (metni ekran kurar). Her cevabın gövdesi ÇAĞIRANIN verdiği Zod şemasıyla parse edilir —
  sözleşme tek kaynak, elle tip yazılmaz (02-mimari §3.2).

  Hata YUTULMAZ ama FIRLATILMAZ da: sonuç Result desenidir (`ApiResult`) — apps/web server
  action zarfıyla aynı okuma alışkanlığı. Mobil istemci log altyapısı ayrı iş (01-teknoloji §9
  açık sorusu); o gelene dek iz, çağıranın elindeki hatanın kendisidir.
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
 * Arızanın SINIFI — "ne yüklenemedi" değil "NİÇİN yüklenemedi".
 *
 * ── ÖLÇÜLMÜŞ ARIZA (06.09, sosyal gelen kutusu) ─────────────────────────────
 * Cihazda oturum ölmüştü (yerel veritabanı tazelenince `auth.users` yeniden doğuyor, elde kalan
 * jetonun tazelemesi `refresh_token_not_found` ile düşüyor): `authorizedFetch` ağa HİÇ çıkmadan
 * `401` döndürdü, ekran ise "Bağlantıyı kontrol edip yeniden deneyin" dedi. Operatör wifi'sini
 * kontrol etti; arıza ise oturumdaydı. Uç, şema ve veri yolu boyunca hiçbir şey yanlış değildi —
 * yanlış olan tek şey EKRANIN CÜMLESİYDİ (CLAUDE §1: belirtiyi susturan değil, sebebi söyleyen).
 *
 * Dört sınıf, dördü de bir CEVABIN kanıtı — tahmin yok:
 * · `connection` — istek ağa hiç çıkamadı (`network_error`, `status: null`).
 * · `session`    — 401: ya cihazda oturum yok/ölü (yerel kısa devre) ya uç jetonu reddetti.
 * · `forbidden`  — 403: kimlik doğru, rol kapısı kapalı (`requireStaffRole`).
 * · `unexpected` — gerisi: sözleşmeye uymayan gövde, 5xx, tanınmayan alan anahtarı.
 *
 * 401'i "oturum öldü" diye YORUMLAMAZ, "oturum doğrulanmadı" der: uç, auth sunucusuna
 * ulaşamadığında da 401 üretir (ölçüldü: GoTrue `/user` 504 → mobile-api `unauthorized`). Sınıf
 * ne kadarını biliyorsa onu söyler; oturumu kendiliğinden kapatmak bu kadar bilgiyle yapılamaz.
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
  body?: unknown;
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
