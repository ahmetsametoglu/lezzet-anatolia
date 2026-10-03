/**
 * Pennylane hata sınıfı: çağıranın kararı hataya göre değişir; `credentials` ve `company_mismatch` kurulum hatasıdır, `network`,
 * `rate_limited` ve `provider` sonraki turda yeniden denenir, `validation` ve `conflict` gönderdiğimiz veriyle ilgilidir.
 */
export type PennylaneErrorCode =
  /** Anahtar yok, geçersiz ya da kapsamı eksik (401, 403). */
  | 'credentials'
  /** Kip ile anahtarın şirketi uyuşmuyor: test kipinde canlı şirket ya da canlı kipte test şirketi. */
  | 'company_mismatch'
  /** Gönderdiğimiz veri reddedildi (400, 422). */
  | 'validation'
  /** İstenen kayıt yok ya da başka şirketin (404). */
  | 'not_found'
  /** Kayıt zaten var (409); Pennylane aynı dosyayı ikinci kez almaz. */
  | 'conflict'
  /** İstek sınırı bekleyerek de aşılamadı (429). */
  | 'rate_limited'
  /** Pennylane tarafında arıza (5xx). */
  | 'provider'
  /** Ağ ya da zaman aşımı; istek karşıya ulaşmamış olabilir. */
  | 'network'
  /** Cevap beklenen biçimde değil, sözleşme değişmiş olabilir. */
  | 'parse';

export interface PennylaneErrorDetail {
  code: PennylaneErrorCode;
  message: string;
  detail?: unknown;
}

export class PennylaneError extends Error {
  readonly code: PennylaneErrorCode;
  readonly detail?: unknown;

  constructor({ code, message, detail }: PennylaneErrorDetail) {
    super(message);
    this.name = 'PennylaneError';
    this.code = code;
    this.detail = detail;
  }
}

/** HTTP durumundan hata sınıfı; Pennylane reddin sebebini `error`, `message` ve `details` alanında verir, mesaja o taşınır. */
export function classify(status: number, body: unknown): PennylaneErrorDetail {
  const reason = typeof body === 'object' && body !== null ? (body as { error?: unknown; message?: unknown; details?: unknown }) : {};
  const said = [
    typeof reason.error === 'string' ? reason.error : null,
    typeof reason.message === 'string' ? reason.message : null,
    reason.details ? JSON.stringify(reason.details) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (status === 401 || status === 403) {
    return { code: 'credentials', message: `Pennylane anahtarı geçersiz ya da kapsamı eksik (${status})${said ? `: ${said}` : ''}` };
  }
  if (status === 404) return { code: 'not_found', message: 'Pennylane kaydı bulunamadı (404)', detail: body };
  if (status === 409) return { code: 'conflict', message: `Pennylane kaydı zaten var (409)${said ? `: ${said}` : ''}`, detail: body };
  if (status === 429) return { code: 'rate_limited', message: 'Pennylane istek sınırı aşıldı (429)' };
  if (status >= 500) return { code: 'provider', message: `Pennylane sunucu hatası (${status})`, detail: body };
  return { code: 'validation', message: `Pennylane isteği reddetti (${status})${said ? `: ${said}` : ''}`, detail: body };
}
