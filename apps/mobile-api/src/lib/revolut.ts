import {
  revolutClient,
  revolutConfigFromEnv,
  revolutGateway,
  revolutSessionCreator,
  type CheckoutSessionCreator,
  type PaymentGateway,
  type RevolutClient,
} from '@lezzet/application';

/**
 * `apps/mobile-api`nin ödeme sağlayıcısı kapısı. Anahtar ya da kip yoksa çağıran `null` görür ve "sağlayıcı yok" cevabı verir;
 * anahtarsız yerel çalışma meşrudur ama "ödeme alındı" demek değildir.
 */
let cached: RevolutClient | null | undefined;

function client(): RevolutClient | null {
  if (cached !== undefined) return cached;
  const config = revolutConfigFromEnv();
  cached = config ? revolutClient(config) : null;
  return cached;
}

/** Taslağın ödemesini açan port; native kart formu dönen jetonla açılır. */
export function paymentSessionCreator(): CheckoutSessionCreator | null {
  return revolutSessionCreator(client());
}

/** Ödemenin durumunu soran, iptal ve iade eden port; web'in ve zamanlanmış işin kullandığıyla aynı. */
export function paymentGateway(): PaymentGateway | null {
  return revolutGateway(client());
}
