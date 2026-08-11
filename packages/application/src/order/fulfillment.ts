import { OrderService, SettingsService } from '@lezzet/database';
import type { CloseResult, DeliverResult } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyStatusEffect, type OrderEffects } from './effects';

/**
 * Teslim ve kapanış kapısı (07.7; terfi 21.10 — kaynağı `apps/web/lib/order/fulfillment.ts`).
 * Web kopyası geçiş köprüsüdür.
 *
 * **Neden terfi etti:** kurye kapısı (`courier/delivery`) teslimi buradan yapıyor. `closeOrder` de
 * birlikte geldi — dosyayı ikiye bölmek, aynı iki anın (teslim/kapanış) künyesini iki yere
 * dağıtmak olurdu ve ayrımın anlatıldığı tek yer bu künyedir.
 *
 * İki an ayrıdır (DOMAIN §12):
 * - **Teslim** malın fiziksel gerçeğini değiştirir: ayrılmış düşer, fiili stok kayıtlı partilerden
 *   düşer, teslim onayı yazılır.
 * - **Kapanış** kâr kalemlerini sabitler. Aralarında iade/kısmi düzeltme olabildiği için maliyeti
 *   teslimde dondurmak o düzeltmeleri kârın dışında bırakırdı.
 *
 * Maliyet oranları ayarlardan gelir — kapı onları toplar, hesabı RPC yapar.
 */

/**
 * Teslim: kurye ekranındaki onay. `deliveryProof` kapsamı parametriktir (B2B zorunlu, B2C kapalı).
 *
 * Teslim `transition_order_status`'tan geçmez (kendi RPC'si vardır) — bu yüzden teslim haberi de
 * burada tetiklenir. Gönderim yalnız teslim GERÇEKLEŞTİYSE olur; `stale` dönen çağrı haber üretmez.
 *
 * **Haber ve puan artık PORT** (`effects`): web'de `notifyOrderStatus` ve `rewardCompletedOrder`
 * doğrudan çağrılıyordu; ikisi de bu paketin bağımlısı olmayan modüllerde yaşıyor. Gerekçe ve
 * eksik-port davranışı `effects.ts` künyesinde.
 */
export async function deliverOrder(
  db: SupabaseClient,
  orderId: string,
  opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null; effects?: OrderEffects } = {},
): Promise<DeliverResult> {
  const result = await new OrderService(db).deliver(orderId, opts);
  if (result.ok) {
    await notifyStatusEffect(opts.effects, orderId, 'delivered');
    // ÖDÜL ÇAĞRISI BURADAN KALKTI (17.9): sipariş puanı silindi ve getirenin ödülü teslimata değil
    // ÖDEMEYE bağlandı. Kapıda ödeyen müşteride ikisi aynı ana denk geliyor ama ölçüt artık paranın
    // defterde görünmesi — teslim edilip ödenmemiş sipariş puan doğurmuyor.
  }
  return result;
}

/**
 * Kapanış: kâr kalemleri sabitlenir. Rota-içinde birim maliyet, kargoda gerçek ücret kullanılır;
 * ikisi de `settings`'ten okunur (kodda sabit yok).
 */
export async function closeOrder(
  db: SupabaseClient,
  orderId: string,
  opts: { actorId?: string | null; actualDeliveryCostCents?: number | null } = {},
): Promise<CloseResult> {
  const settings = new SettingsService(db);

  const [routeUnitCents, packagingUnitCents] = await Promise.all([
    settings.getNumber('route_delivery_unit_cost_cents', 250),
    settings.getNumber('packaging_unit_cost_cents', 120),
  ]);

  // Ayarlar zaten cent'te tutuluyordu; servis de artık cent alıyor (02.9) — buradaki `/ 100`
  // çevrimleri kalktı ve iki taraf aynı birimi konuşuyor.
  return new OrderService(db).close(orderId, {
    actorId: opts.actorId,
    deliveryCostCents: opts.actualDeliveryCostCents,
    routeUnitCostCents: routeUnitCents,
    packagingUnitCostCents: packagingUnitCents,
  });
}
