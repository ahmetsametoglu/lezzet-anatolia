import { resolveCheckoutPayment as resolveCheckoutPaymentFor } from '@lezzet/application';
import type { CheckoutPaymentInput, CheckoutPaymentResult } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * Checkout ödeme seçenekleri (07.3) — **uygulama katmanı orkestrasyonu**. DOMAIN §6, §7.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 2/3): gövde `@lezzet/application`'ın
 * `order/checkout-options`ine taşındı — kural artık ORADA yaşıyor. Vade freni, kapıda ödeme tavanı
 * ve kargo ücreti kararı mobil sipariş yolunun da kararıdır; ikinci bir nüsha, iki yüzeyin aynı
 * müşteriye farklı ödeme yöntemi sunması demekti.
 *
 * Girdi/sonuç tipleri pakette `CheckoutPayment*` adını aldı: `CheckoutOptions*` motorun
 * (`domain-core`) kendi tipinin adı ve barrel'dan ihraç edilince ikisi çakışırdı.
 */
export async function resolveCheckoutPayment(input: CheckoutPaymentInput): Promise<CheckoutPaymentResult> {
  return resolveCheckoutPaymentFor(serviceDb(), input);
}
