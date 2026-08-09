import 'server-only';
import { createCheckoutDraft as createCheckoutDraftFor } from '@lezzet/application';
import type { CheckoutDraftInput, CheckoutDraftOutcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { rememberAcquisition } from '@/lib/analytics/attribution';
import { getPackagesByIds } from '@/lib/storefront/packages';

/**
 * Sepet → TASLAK SİPARİŞ (07.4'ün eksik halkası) — **uygulama katmanı orkestrasyonu**.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 2/3): gövde `@lezzet/application`'ın
 * `order/checkout-draft`ine taşındı — kural artık ORADA yaşıyor. Sebep tüzüğün kendisi: mobil
 * "Siparişi tamamla" ekranı aynı kapıyı çağıracak ve **iki yüzeyde iki sipariş kuralı olamaz.**
 * Bağlayıcı fiyatın sabitlenmesi, her seçimin yeniden doğrulanması, adres–posta kodu tutarlılığı
 * ve zam onayı — hepsi tek nüsha.
 *
 * Köprünün taşıdığı iki şey WEB'E ÖZGÜ olan, yani pakette yaşayamayacak olan:
 *
 * · **`bundles`** — paket çözümü (stok/kargo/ağırlık türetmesi) hâlâ `lib/storefront/packages.ts`te
 *   ve terfisi ayrı bir adım. Kapı geçildiği için bugünkü paket davranışı BİREBİR korunuyor;
 *   geçilmeseydi paket satırı engelli görünürdü.
 *
 * · **`onCustomerAcquired`** — edinim kaynağı (13.2) oturumun kampanya künyesini ÇEREZTEN okuyor
 *   (`analytics/attribution`). Çerez bir taşıma ayrıntısıdır ve paket Node'da da Hono'da da
 *   koşuyor; okumayı içeri koymak orkestrasyonu istek dışında çağrılamaz hâle getirirdi (aynı
 *   ders `settingScopeOf`ün yer eksenlerinde ölçüldü: 34 test). Mobil bu kapıyı geçmez — orada
 *   kampanya oturumu yok ve uydurulmuş bir kaynak, raporu sessizce bozardı.
 *   **Beklenmez** (`void`): kaynak künyesi bir ölçümdür, siparişin açılmasını geciktirmemeli.
 */
export async function createCheckoutDraft(
  input: Omit<CheckoutDraftInput, 'bundles' | 'onCustomerAcquired'>,
): Promise<CheckoutDraftOutcome> {
  return createCheckoutDraftFor(serviceDb(), {
    ...input,
    bundles: getPackagesByIds,
    onCustomerAcquired: (customerId) => void rememberAcquisition(customerId),
  });
}
