import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EmailVerificationSchema,
  EmailVerificationInsertSchema,
  EmailVerificationUpdateSchema,
  type EmailVerification,
  type EmailVerificationInsert,
  type EmailVerificationUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

const TTL_MINUTES = 15;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Kripto-güvenli 6-haneli kod (000000–999999, sıfır dolgulu). */
function generateSixDigitCode(): string {
  const num = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(num).padStart(6, '0');
}

export type RequestCodeResult = { status: 'ok'; code: string } | { status: 'rate_limit' | 'cooldown'; retryAfterSec: number };

export type VerifyCodeResult =
  { status: 'ok' } | { status: 'wrong'; remainingAttempts: number } | { status: 'locked' | 'expired' | 'not_found' };

/**
 * Passwordless e-posta OTP orkestrasyonu — tümüyle atomik RPC üzerinden (rate-limit +
 * cooldown + invalidate + insert / verify tek round-trip, race-safe). Plain kod JS'te
 * üretilir; DB'ye yalnız SHA-256 hash gider. **service_role** client ile çağrılır (RLS bypass).
 *
 * Ham sorgu yazmaz — RPC'ler base'in `executeRpc` metodu üzerinden çağrılır (base sözleşmesi).
 */
export class EmailVerificationService extends BaseDbService<EmailVerification, EmailVerificationInsert, EmailVerificationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'email_verifications', EmailVerificationSchema, EmailVerificationInsertSchema, EmailVerificationUpdateSchema, false);
  }

  /** Yeni kod üretir, hash'ini DB'ye yazdırır; plain kodu (mail için) döner. */
  async requestCode(email: string): Promise<RequestCodeResult> {
    const code = generateSixDigitCode();
    const tokenHash = sha256(code);
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();

    const rows = await this.executeRpc<Array<{ status: string; retry_after_sec: number }>>('request_passwordless_code', {
      p_email: email,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    });
    const row = rows?.[0];
    if (!row) throw new Error('request_passwordless_code RPC boş döndü');

    if (row.status === 'ok') return { status: 'ok', code };
    return { status: row.status as 'rate_limit' | 'cooldown', retryAfterSec: row.retry_after_sec };
  }

  /** Girilen kodu doğrular ve tüketir. */
  async verifyCode(email: string, code: string): Promise<VerifyCodeResult> {
    const tokenHash = sha256(code);

    const rows = await this.executeRpc<Array<{ status: string; remaining_attempts: number }>>('verify_passwordless_code', {
      p_email: email,
      p_token_hash: tokenHash,
    });
    const row = rows?.[0];
    if (!row) throw new Error('verify_passwordless_code RPC boş döndü');

    if (row.status === 'wrong') return { status: 'wrong', remainingAttempts: row.remaining_attempts };
    return { status: row.status as 'ok' | 'locked' | 'expired' | 'not_found' };
  }
}
