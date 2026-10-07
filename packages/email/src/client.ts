import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { brand } from '@lezzet/brand';
import { logger } from '@lezzet/observability/logger';

export interface SendEmailParams {
  to: string;
  subject: string;
  react: ReactElement;
}

export interface SendEmailResult {
  data: { id: string } | null;
  error: string | null;
}

/** Anahtarın kaynağı; süreç başında takılır, takılmadıysa ortam değişkeni okunur. */
type KeySource = () => Promise<string | null>;
const SLOT = Symbol.for('lezzet.email.key-source');
type Slot = { [SLOT]?: KeySource };

/**
 * Süreç başında BİR KEZ takılır; `null` söker. Kanca modül değişkeninde değil `globalThis`te durur, çünkü Next modülleri ayrı
 * grafiklerde yükler ve bir grafikte takılan kanca ötekinde boş görünürdü.
 */
export function setEmailKeySource(source: KeySource | null): void {
  (globalThis as Slot)[SLOT] = source ?? undefined;
}

const envKey: KeySource = async () => process.env.RESEND_API_KEY || null;

let cachedClient: { key: string; client: Resend } | null = null;

/** Gönderici: `RESEND_FROM` env varsa o, yoksa sabit marka fallback. */
function resolveFrom(): string {
  return process.env.RESEND_FROM || `${brand.name} <bonjour@lezzetanatolie.com>`;
}

/** İstemci anahtar başına bir kez kurulur; yenilenen anahtar yeni istemci doğurur. Anahtar yoksa `null` (sendEmail atlar). */
async function getClient(): Promise<Resend | null> {
  const apiKey = await ((globalThis as Slot)[SLOT] ?? envKey)();
  if (!apiKey) return null;
  if (cachedClient?.key !== apiKey) cachedClient = { key: apiKey, client: new Resend(apiKey) };
  return cachedClient.client;
}

/**
 * React Email şablonunu Resend ile render edip gönderir. Anahtar yoksa (yerel geliştirme) mail atlanır ve bir uyarı loglanır — akış
 * bloklanmaz; anahtar okunamazsa sonuç hatadır, fırlatılmaz.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  let client: Resend | null;
  try {
    client = await getClient();
  } catch (error) {
    return { data: null, error: `e-posta anahtarı okunamadı: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!client) {
    // **Alıcı adresi loglanmaz** (denetim A8 · `OBSERVABILITY §5`, `CLAUDE.md §1`): log'a kimlik
    // yazılır, içerik yazılmaz — e-posta/telefon/adres HAYIR. Burada `to` yazıyordu ve bu satır
    // yerelde her mail atlandığında bir müşteri adresini kayda düşürüyordu. Teşhis için konu yeter:
    // hangi mailin atlandığını söyler, kime gideceğini söylemez. Kime gideceği zaten DB'de.
    logger.warn({ context: 'email/send', subject: params.subject }, 'e-posta anahtarı yok → mail atlandı');
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
