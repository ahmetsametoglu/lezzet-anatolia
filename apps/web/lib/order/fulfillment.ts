import { OrderService, SettingsService, serviceDb } from '@lezzet/database';
import type { CloseResult, DeliverResult } from '@lezzet/types';
import { notifyOrderStatus } from './notify';
import { rewardCompletedOrder } from '../feedback/points';

/**
 * Teslim ve kapanış kapısı (07.7) — **uygulama katmanı orkestrasyonu**.
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
 */
export async function deliverOrder(
  orderId: string,
  opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null } = {},
): Promise<DeliverResult> {
  const result = await new OrderService(serviceDb()).deliver(orderId, opts);
  if (result.ok) {
    await notifyOrderStatus(orderId, 'delivered');
    // Sipariş puanı (17.4) — teslim `transition_order_status`'tan geçmediği için buradan da
    // çağrılmak zorunda. İki kez çağrılması zararsız: defterin tekillik indeksi ikinciyi düşürür.
    await rewardCompletedOrder(orderId);
  }
  return result;
}

/**
 * Kapanış: kâr kalemleri sabitlenir. Rota-içinde birim maliyet, kargoda gerçek ücret kullanılır;
 * ikisi de `settings`'ten okunur (kodda sabit yok).
 */
export async function closeOrder(
  orderId: string,
  opts: { actorId?: string | null; actualDeliveryCostCents?: number | null } = {},
): Promise<CloseResult> {
  const db = serviceDb();
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
