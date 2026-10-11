import {
  revolutClientFromSecrets,
  revolutGateway,
  revolutRefunderWith,
  revolutSessionCreator,
  type CheckoutSessionCreator,
  type PaymentGateway,
  type ProviderRefunder,
  type RevolutClient,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { SOURCES } from '@lezzet/observability';

/**
 * `apps/mobile-api`nin ödeme sağlayıcısı kapısı. Anahtar ya da kip yoksa çağıran `null` görür ve "sağlayıcı yok" cevabı verir;
 * anahtarsız yerel çalışma meşrudur ama "ödeme alındı" demek değildir. İstemci saklanmaz ki Kurulum'dan yenilenen anahtar geçsin.
 */
async function client(): Promise<RevolutClient | null> {
  return revolutClientFromSecrets(serviceDb());
}

/** Taslağın ödemesini açan port; native kart formu dönen jetonla açılır. */
export async function paymentSessionCreator(): Promise<CheckoutSessionCreator | null> {
  return revolutSessionCreator(await client());
}

/** Ödemenin durumunu soran, iptal ve iade eden port; web'in ve zamanlanmış işin kullandığıyla aynı. */
export async function paymentGateway(): Promise<PaymentGateway | null> {
  return revolutGateway(await client());
}

/** Karta iade; kapıdaki ret, depo dönüşü ve yola çıkıştaki hazırlık eksiği parayı bu porttan iade eder. */
export function providerRefunder(): ProviderRefunder {
  return revolutRefunderWith(client, SOURCES.mobileApiHttp);
}
