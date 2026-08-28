/**
 * Sendcloud hata sınıflandırması.
 *
 * **Neden ham hata fırlatmıyoruz:** çağıranın vereceği karar hataya göre değişiyor —
 * `credentials` kurulum hatasıdır (operatöre söylenir), `credit` iş kararıdır (bakiye yükle),
 * `network` geçicidir (yeniden denenebilir), `validation` bizim gönderdiğimiz veriyle ilgilidir
 * (ölçü/adres). Tek bir `Error` bunları ayırt ettirmez ve her çağıran metin ayrıştırmaya başlar.
 */
export type SendcloudErrorCode =
  /** Anahtarlar yok ya da geçersiz — kurulum hatası. */
  | 'credentials'
  /** Sendcloud bakiyesi yetersiz (402) — etiket satın alınamaz. */
  | 'credit'
  /** Gönderdiğimiz veri reddedildi (4xx) — ölçü, adres, servis kodu. */
  | 'validation'
  /** Sendcloud tarafında arıza (5xx). */
  | 'provider'
  /** Ağ/zaman aşımı — istek karşıya ULAŞMAMIŞ olabilir. */
  | 'network'
  /** Cevap beklediğimiz şekilde değil — sözleşme değişmiş olabilir. */
  | 'parse';

export interface SendcloudErrorDetail {
  code: SendcloudErrorCode;
  message: string;
  /** Sendcloud'un işaret ettiği alan (`source.pointer`) — varsa operatöre gösterilir. */
  field?: string;
  detail?: unknown;
}

export class SendcloudError extends Error {
  readonly code: SendcloudErrorCode;
  readonly field?: string;
  readonly detail?: unknown;

  constructor({ code, message, field, detail }: SendcloudErrorDetail) {
    super(message);
    this.name = 'SendcloudError';
    this.code = code;
    this.field = field;
    this.detail = detail;
  }
}

export function isSendcloudError(err: unknown): err is SendcloudError {
  return err instanceof SendcloudError;
}

/**
 * HTTP durumundan ve gövdeden hata sınıfı çıkarır.
 *
 * 401/403 → `credentials`, 402 → `credit` özel olarak ayrılıyor: ikisi de 4xx ama biri kurulumun
 * biri muhasebenin sorunu ve operatöre gösterilecek cümle bambaşka.
 */
export function classify(status: number, body: unknown): SendcloudErrorDetail {
  if (status === 401 || status === 403) {
    return { code: 'credentials', message: 'Sendcloud kimlik doğrulaması başarısız — API anahtarlarını kontrol edin.' };
  }
  if (status === 402) {
    return { code: 'credit', message: 'Sendcloud bakiyesi yetersiz — etiket satın alınamıyor.' };
  }
  const first = firstError(body);
  if (status >= 500) {
    return { code: 'provider', message: `Sendcloud sunucu hatası (${status})`, detail: body };
  }
  if (status === 429) {
    // Oran sınırı (POST 100/dk · GET 1000/dk) — geçici, ama YENİDEN DENEME kararı çağıranın:
    // POST'ta tekrar denemek ikinci koli açar (idempotency anahtarı yok).
    return { code: 'network', message: 'Sendcloud oran sınırı aşıldı (429) — biraz sonra yeniden deneyin.' };
  }
  return {
    code: 'validation',
    message: first ? `Sendcloud isteği reddetti: ${first.detail}` : `Sendcloud beklenmedik cevap (${status})`,
    field: first?.pointer,
    detail: body,
  };
}

function firstError(body: unknown): { detail: string; pointer?: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const e = errors[0] as { detail?: unknown; title?: unknown; code?: unknown; source?: { pointer?: unknown } };
  const detail = [e.detail, e.title, e.code].find((v) => typeof v === 'string') as string | undefined;
  return { detail: detail ?? 'bilinmeyen hata', pointer: typeof e.source?.pointer === 'string' ? e.source.pointer : undefined };
}
