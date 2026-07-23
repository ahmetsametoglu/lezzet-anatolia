import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { brand } from '@lezzet/brand';

export interface SendEmailParams {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface SendEmailResult {
  data: { id: string } | null;
  error: string | null;
}

let cachedClient: Resend | null | undefined;

/** Gönderici: `RESEND_FROM` env varsa o, yoksa sabit marka fallback. */
function resolveFrom(): string {
  return process.env.RESEND_FROM || `${brand.name} <bonjour@lezzet-anatolia.fr>`;
}

/** Lazy Resend client — `RESEND_API_KEY` yoksa null (sendEmail graceful atlar). */
function getClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  cachedClient = apiKey ? new Resend(apiKey) : null;
  return cachedClient;
}

/**
 * React Email şablonunu Resend ile render edip gönderir. `RESEND_API_KEY` yoksa
 * (yerel geliştirme) mail atlanır ve `console.warn` düşülür — akış bloklanmaz.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    console.warn('[email] RESEND_API_KEY yok → mail atlandı:', { to: params.to, subject: params.subject });
    return { data: null, error: null };
  }

  const result = await client.emails.send({
    from: resolveFrom(),
    to: params.to,
    subject: params.subject,
    react: params.react,
  });

  if (result.error) return { data: null, error: result.error.message };
  return { data: result.data ? { id: result.data.id } : null, error: null };
}
