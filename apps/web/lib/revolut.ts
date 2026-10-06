import 'server-only';
import { revolutClient, revolutConfigFromEnv, revolutGateway, type PaymentGateway, type RevolutClient } from '@lezzet/application';

/**
 * Revolut istemcisinin web'deki tek kurulum yeri. Anahtar ya da kip yoksa `null` döner ve çağıran açık bir "sağlayıcı yok" cevabı
 * verir; yerelde anahtarsız çalışmak meşrudur ama "ödeme alındı" demek değildir.
 */
let cached: RevolutClient | null | undefined;

export function webRevolutClient(): RevolutClient | null {
  if (cached !== undefined) return cached;
  const config = revolutConfigFromEnv();
  cached = config ? revolutClient(config) : null;
  return cached;
}

/** Ödemenin durumu, iptali ve iadesi; anahtarsız ortamda `null` ve çağıran "sorulamadı" der, "ödenmedi" demez. */
export function revolutPaymentGateway(): PaymentGateway | null {
  return revolutGateway(webRevolutClient());
}

/** Webhook imza anahtarı; yoksa doğrulama yapılamaz ve istek reddedilir. */
export function revolutWebhookSecret(): string | null {
  return process.env.REVOLUT_WEBHOOK_SECRET || null;
}

/** Revolut'un barındırdığı ödeme sayfası; ortam sunucunun kipinden türer ki jeton yanlış ortamın sayfasında açılmasın. */
export function revolutCheckoutUrl(paymentToken: string): string | null {
  const client = webRevolutClient();
  if (!client) return null;
  const host = client.mode === 'live' ? 'https://checkout.revolut.com' : 'https://sandbox-checkout.revolut.com';
  return `${host}/payment-link/${encodeURIComponent(paymentToken)}`;
}
