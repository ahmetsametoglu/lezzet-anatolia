import type { AddressDeliveryType } from '@lezzet/types';

/**
 * **TAŞIYICI SEÇİMİNİN KURALI** (07.12 · kullanıcı kararı 29.08) — saf karar.
 *
 * Kullanıcının cümlesi: *"Teslimat noktasına kullanıcı eğer kendisi seçiyorsa ve kargo parası
 * mevcut siparişin üzerine ekleniyorsa olabilir. Ama eşiği geçtiyse ve kargo ücretsiz diyorsak
 * o zaman evine teslim senaryosu devrede demektir."*
 *
 * İki hâl, ve ayıran şey PARANIN KİMDEN çıktığı:
 *
 * 1. **Müşteri ödüyor** (eşik altı) → seçim MÜŞTERİNİN. Teslimat noktası da bir seçenektir; onu
 *    seçen kendisi olduğu için "eve gitmedi" diye bir şikâyet doğmaz.
 * 2. **Biz ödüyoruz** (eşik üstü, "ücretsiz kargo") → seçim BİZİM ve **eve gider**. Müşteriye
 *    hiçbir şey sorulmaz; sorulsaydı ücreti etkilemeyen bir soru sormuş olurduk.
 *
 * ── KURAL NEDEN CHECKOUT'TA DEĞİL, SEVKTE BAĞLAYICI ─────────────────────────
 * Ölçüldü (29.08): müşterinin checkout'ta seçtiği servis kodu **hiçbir yere yazılmıyor** — yalnız
 * gösterilen ücreti belirliyor. Taşıyıcıyı gerçekte depo seçiyor (`quoteOrderShipment`), sevk
 * anında. Yani "ücretsiz kargo eve gider" kuralını checkout'a koymak onu SÖYLEMEK olurdu,
 * UYGULAMAK değil: checkout'ta ne seçilirse seçilsin depo başka bir şey satın alabilirdi.
 *
 * Kural bu yüzden iki yerde birden geçerli ve tek kaynaktan: checkout SORMAZ, sevk SEÇTİRMEZ.
 */

/** Sağlayıcıların "son adım" değeri; eve teslim bu. Dize olarak taşınıyor — `domain-core` sağlayıcı paketini bilmez. */
export const HOME_DELIVERY = 'home_delivery';

/**
 * Bu siparişin taşıması EVE mi gitmek zorunda?
 *
 * Ölçüt ücretin SIFIR olması, "eşiği geçti mi" değil — ve fark önemli: ücret rota teslimatında da
 * sıfırdır ama orada kargo yoktur, kampanyayla sıfırlanırsa da yine biz ödüyoruzdur. Soru
 * *"parayı kim ödedi"*; cevabı `shipping_fee` satırında duruyor ve o satır siparişin kendi kaydı.
 */
export function requiresHomeDelivery(order: { deliveryType: AddressDeliveryType | 'pickup'; shippingFeeCents: number }): boolean {
  return order.deliveryType === 'shipping' && order.shippingFeeCents === 0;
}

/**
 * Eve teslim edenleri süz. **Son adımı BİLİNMEYEN seçenek elenir** (`null`): "bilmiyorum" ile
 * "eve gidiyor" aynı şey değildir (`CLAUDE §1`) ve burada yanılmanın bedeli somut — müşteri
 * ücretsiz kargo bekleyip kolisini teslim noktasında bulur.
 */
export function homeDeliveryOnly<T extends { lastMile: string | null }>(options: readonly T[]): T[] {
  return options.filter((o) => o.lastMile === HOME_DELIVERY);
}
