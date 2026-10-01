/**
 * Hiboutik hata sınıfı: çağıranın kararı hataya göre değişir; `credentials` kurulum hatasıdır, `network` ve `provider` yeniden
 * denenir, `validation` gönderdiğimiz veriyle ilgilidir ve tekrar aynı sonucu verir.
 */
export type HiboutikErrorCode =
  /** Hesap, kullanıcı ya da anahtar yok veya geçersiz. */
  | 'credentials'
  /** Gönderdiğimiz veri reddedildi (400, 422). */
  | 'validation'
  /** İstenen kayıt yok (404). */
  | 'not_found'
  /** Hiboutik tarafında arıza (5xx). */
  | 'provider'
  /** Ağ, zaman aşımı ya da oran sınırı; istek karşıya ulaşmamış olabilir. */
  | 'network'
  /** Cevap beklenen şekilde değil, sözleşme değişmiş olabilir. */
  | 'parse';

export interface HiboutikErrorDetail {
  code: HiboutikErrorCode;
  message: string;
  detail?: unknown;
}

export class HiboutikError extends Error {
  readonly code: HiboutikErrorCode;
  readonly detail?: unknown;

  constructor({ code, message, detail }: HiboutikErrorDetail) {
    super(message);
    this.name = 'HiboutikError';
    this.code = code;
    this.detail = detail;
  }
}

export function isHiboutikError(err: unknown): err is HiboutikError {
  return err instanceof HiboutikError;
}

/** HTTP durumundan hata sınıfı; Hiboutik reddin sebebini `details` alanında alan adıyla verir, mesaja o taşınır. */
export function classify(status: number, body: unknown): HiboutikErrorDetail {
  if (status === 401 || status === 403) {
    return { code: 'credentials', message: 'Hiboutik kimlik doğrulaması başarısız — hesap, kullanıcı ve API anahtarını kontrol edin.' };
  }
  if (status === 404) return { code: 'not_found', message: 'Hiboutik kaydı bulunamadı (404)', detail: body };
  if (status === 429) return { code: 'network', message: 'Hiboutik oran sınırı aşıldı (429)' };
  if (status >= 500) return { code: 'provider', message: `Hiboutik sunucu hatası (${status})`, detail: body };
  const details = typeof body === 'object' && body !== null ? (body as { details?: unknown }).details : undefined;
  return {
    code: 'validation',
    message: `Hiboutik isteği reddetti (${status})${details ? `: ${JSON.stringify(details)}` : ''}`,
    detail: body,
  };
}
