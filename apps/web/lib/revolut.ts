import 'server-only';
import {
  integrationSecrets,
  revolutClient,
  revolutConfigFromSecrets,
  revolutGateway,
  type PaymentGateway,
  type RevolutClient,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * Revolut istemcisinin web'deki tek kurulum yeri. Anahtar ya da kip yoksa `null` döner ve çağıran açık bir "sağlayıcı yok" cevabı
 * verir; yerelde anahtarsız çalışmak meşrudur ama "ödeme alındı" demek değildir. İstemci saklanmaz, çünkü Kurulum'dan yenilenen
 * anahtar okuyucunun kısa önbelleği dolunca geçmeli.
 */
export async function webRevolutClient(): Promise<RevolutClient | null> {
  const config = await revolutConfigFromSecrets(serviceDb());
  return config ? revolutClient(config) : null;
}

/** Ödemenin durumu, iptali ve iadesi; anahtarsız ortamda `null` ve çağıran "sorulamadı" der, "ödenmedi" demez. */
export async function revolutPaymentGateway(): Promise<PaymentGateway | null> {
  return revolutGateway(await webRevolutClient());
}

/** Webhook imza anahtarı; yoksa doğrulama yapılamaz ve istek reddedilir. */
export async function revolutWebhookSecret(): Promise<string | null> {
  return (await integrationSecrets(serviceDb()))('revolut_webhook_secret');
}

/** Revolut'un barındırdığı ödeme sayfası; ortam sunucunun kipinden türer ki jeton yanlış ortamın sayfasında açılmasın. */
export async function revolutCheckoutUrl(paymentToken: string): Promise<string | null> {
  const client = await webRevolutClient();
  if (!client) return null;
  const host = client.mode === 'live' ? 'https://checkout.revolut.com' : 'https://sandbox-checkout.revolut.com';
  return `${host}/payment-link/${encodeURIComponent(paymentToken)}`;
}
