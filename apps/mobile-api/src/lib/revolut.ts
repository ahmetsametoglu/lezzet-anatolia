import {
  revolutClient,
  revolutConfigFromSecrets,
  revolutGateway,
  revolutSessionCreator,
  type CheckoutSessionCreator,
  type PaymentGateway,
  type RevolutClient,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * `apps/mobile-api`nin ödeme sağlayıcısı kapısı. Anahtar ya da kip yoksa çağıran `null` görür ve "sağlayıcı yok" cevabı verir;
 * anahtarsız yerel çalışma meşrudur ama "ödeme alındı" demek değildir. İstemci saklanmaz ki Kurulum'dan yenilenen anahtar geçsin.
 */
async function client(): Promise<RevolutClient | null> {
  const config = await revolutConfigFromSecrets(serviceDb());
  return config ? revolutClient(config) : null;
}

/** Taslağın ödemesini açan port; native kart formu dönen jetonla açılır. */
export async function paymentSessionCreator(): Promise<CheckoutSessionCreator | null> {
  return revolutSessionCreator(await client());
}

/** Ödemenin durumunu soran, iptal ve iade eden port; web'in ve zamanlanmış işin kullandığıyla aynı. */
export async function paymentGateway(): Promise<PaymentGateway | null> {
  return revolutGateway(await client());
}
