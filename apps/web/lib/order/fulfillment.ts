import 'server-only';
import { serviceDb } from '@lezzet/database';
import { closeOrder as closeOrderFor, deliverOrder as deliverOrderFor } from '@lezzet/application';
import { webOrderEffects } from './transition';

/**
 * Teslim ve kapanış (07.6 · 12.x) — **geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * Gövde `@lezzet/application/order/fulfillment`ta: teslimin neden `transition_order_status`'tan
 * geçmediği (kendi RPC'si var), kapanışta birim maliyetlerin neden koddan değil `settings`ten
 * okunduğu — hepsi orada.
 *
 * ── KÖPRÜNÜN TAŞIDIĞI ŞEY: İKİ YAN ETKİ ─────────────────────────────────────
 * Teslim durum geçişinden geçmediği için teslim haberi (14.5) ve sipariş puanı (17.4) bu kapıdan
 * tetikleniyor. Paket ikisini de PORT'tan istiyor; web'in portu zaten kurulu ve tek:
 * `webOrderEffects`. Burada ikinci bir etki nesnesi kurulsaydı, gün gelir biri güncellenir öteki
 * unutulurdu — teslim edilen siparişin haberi giderken puanının yazılmaması gibi, sessiz bir arıza.
 */

export function deliverOrder(orderId: string, opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null } = {}) {
  return deliverOrderFor(serviceDb(), orderId, { ...opts, effects: webOrderEffects });
}

export function closeOrder(orderId: string, opts: { actorId?: string | null; actualDeliveryCostCents?: number | null } = {}) {
  return closeOrderFor(serviceDb(), orderId, opts);
}
