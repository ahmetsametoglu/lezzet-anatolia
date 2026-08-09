import { resolveDelivery as resolveDeliveryFor } from '@lezzet/application';
import type { DeliveryResolution, ResolveDeliveryInput } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { readDeliveryInputs } from '@/lib/delivery/inputs';

/**
 * Checkout teslimat çözümü (07.2) — **uygulama katmanı orkestrasyonu**. DOMAIN §6.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 2/3): gövde `@lezzet/application`'ın
 * `order/delivery`sine taşındı — kural artık ORADA yaşıyor. Sebep sipariş zincirinin tamamıyla
 * aynı: mobil "Siparişi tamamla" ekranı aynı kuralı çağıracak ve "rota mı kargo mu, hangi gün"
 * kararı iki yüzeyde iki kez yazılamaz.
 *
 * Köprünün taşıdığı tek şey WEB'E ÖZGÜ olan: bölge + depo listelerinin istek kapsamlı önbelleği
 * (`lib/delivery/inputs`, `react.cache()`). Amacı hız değil TUTARLILIK — aynı istekte sepet bir
 * depoyu, katalog başka bir depoyu görmesin; ve iki tur teslimat çözümü aynı listeyi görsün. Paket
 * bu listeyi `inputs` girdisiyle kabul ediyor, önbelleğin kendisi web'te kalıyor.
 */
export async function resolveDelivery(input: Omit<ResolveDeliveryInput, 'inputs'>): Promise<DeliveryResolution> {
  return resolveDeliveryFor(serviceDb(), { ...input, inputs: await readDeliveryInputs() });
}
