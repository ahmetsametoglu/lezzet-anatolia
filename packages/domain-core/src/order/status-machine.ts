import type { OrderStatus } from '@lezzet/types';

/**
 * Sipariş durum makinesi: katı bir zincir değil, izin verilen geçişler kümesi (tam yol ve hızlı satış).
 * Stok ve para etkileri burada yapılmaz; motor karar verir, uygulama uygular.
 */

/** Bir durumdan gidilebilecek durumlar. Boş dizi = terminal (çıkışı yok). */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // İki çıkış: tam yolun başı ve hızlı satış; `cancelled` terk edilen checkout içindir.
  draft: ['confirmed', 'completed', 'cancelled'],

  // `preparing`/`ready` atlanabilir (küçük sipariş anında hazır); her geçiş yine loglanır.
  confirmed: ['preparing', 'ready', 'out_for_delivery', 'cancelled'],
  preparing: ['ready', 'out_for_delivery', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],

  // Kapıda üç sonuç: teslim · ulaşılamadı (geri `ready`, mal ayrılmış kalır) · reddedildi (`returned`).
  out_for_delivery: ['delivered', 'ready', 'returned'],

  // Teslim sonrası: kapanış ya da iade süreci.
  delivered: ['completed', 'returned'],

  // Depo aksiyonu ve para iadesi bitince sipariş kapanır; kalıcı `returned`'da kalmaz.
  returned: ['completed'],

  completed: [],
  cancelled: [],
};

/** Terminal durumlar — buradan çıkış yoktur. */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * `fulfilled_qty` bir hazırlık kararı mı, yoksa henüz yazılmamış varsayılan mı? Ayrılmazsa onaylı her sipariş
 * "hiç karşılanmamış" görünür; `preparing`de ayıran şey en az bir kalemin toplanmış olmasıdır.
 */
export function isFulfillmentSettled(status: OrderStatus, lines: readonly { fulfilledQty: number }[]): boolean {
  if (status === 'draft' || status === 'confirmed' || status === 'cancelled') return false;
  if (status === 'preparing') return lines.some((line) => line.fulfilledQty > 0);
  return true;
}

/** Bir durumdan gidilebilecek durumlar (UI yalnız bunları sunar — yasak geçiş hiç gösterilmez). */
export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export type TransitionCheck = { allowed: true } | { allowed: false; reason: 'same_status' | 'terminal' | 'not_allowed' };

/** Geçiş izinli mi; izinsiz geçiş fırlatma değil hata değeridir. */
export function canTransition(from: OrderStatus, to: OrderStatus): TransitionCheck {
  if (from === to) return { allowed: false, reason: 'same_status' };
  if (isTerminal(from)) return { allowed: false, reason: 'terminal' };
  return TRANSITIONS[from].includes(to) ? { allowed: true } : { allowed: false, reason: 'not_allowed' };
}

/**
 * Geçişin stok etkisi; online ödemede stok checkout başında ayrıldığı için `→ confirmed` her zaman ayırma değildir.
 * `cancelled`/`returned` etkisi mal depoya girdiğinde işler, kapıda değil.
 */
export type StockEffect =
  | 'none'
  | 'reserve' // ayrılmışa ekle
  | 'consume' // ayrılmıştan düş + fiiliden düş (teslim)
  | 'consume_direct' // fiiliden doğrudan düş (hızlı satış — rezervasyon yok)
  | 'release_on_warehouse_return'; // mal depoya girince ayrılmıştan geri bırak / imha işaretle

export function stockEffectOf(
  from: OrderStatus,
  to: OrderStatus,
  opts: { alreadyReserved?: boolean } = {},
): StockEffect {
  if (to === 'confirmed') return opts.alreadyReserved ? 'none' : 'reserve';
  if (to === 'completed' && from === 'draft') return 'consume_direct'; // hızlı satış
  if (to === 'delivered') return 'consume';
  if (to === 'cancelled' || to === 'returned') return 'release_on_warehouse_return';
  return 'none';
}

/**
 * Geçiş hangi kapıdan yazılır: stok işi geçişin kendisiyle aynı transaction'da yapılıyorsa kendi RPC'si şarttır,
 * yoksa düz yazımla durum ilerler ve stok hiç yazılmazdı.
 */
export type OrderGate = 'plain' | 'cancel_order' | 'deliver_order' | 'quick_sale';

export function gateFor(from: OrderStatus, to: OrderStatus): OrderGate {
  if (to === 'cancelled') return 'cancel_order'; // rezervasyon + kalem-parti + para iadesi, hepsi orada
  if (to === 'delivered') return 'deliver_order'; // fiili stok düşümü + rezervasyon kapanışı
  if (to === 'completed' && from === 'draft') return 'quick_sale'; // hızlı satış: fiiliden doğrudan
  return 'plain';
}

/** Düz durum yazımı bu geçiş için yetersiz mi — çağıranın tek soracağı soru. */
export function needsDedicatedGate(from: OrderStatus, to: OrderStatus): boolean {
  return gateFor(from, to) !== 'plain';
}

/**
 * Geçişin anı kimin: saha (depo ve kurye uygulaması, kapı satışı), ofis (iptal, iade süreci, kapanış) ya da
 * sistem (taslağın onayı ve süpürülmesi). Düz kapıdan geçen geçiş bile anı sahibinden yazılır.
 */
export type TransitionOwner = 'field' | 'office' | 'system';

export function transitionOwner(from: OrderStatus, to: OrderStatus): TransitionOwner {
  if (from === 'draft') return to === 'completed' ? 'field' : 'system';
  if (to === 'cancelled' || to === 'completed' || (from === 'delivered' && to === 'returned')) return 'office';
  return 'field';
}

/**
 * Operasyon ekranının sunabileceği geçişler: izinli, düz kapıdan geçen ve anı ofisin olan. Sipariş detayı
 * ve liste aynı süzgeci buradan okur; iptal kendi kapısından geçtiği için burada yok.
 */
export function officeTransitions(from: OrderStatus): OrderStatus[] {
  return allowedTransitions(from).filter((to) => !needsDedicatedGate(from, to) && transitionOwner(from, to) === 'office');
}

/** `reference_no` ilk kalıcı durumda üretilir (`confirmed`, hızlı satışta `completed`). */
export function producesReferenceNo(from: OrderStatus, to: OrderStatus): boolean {
  if (from !== 'draft') return false;
  return to === 'confirmed' || to === 'completed';
}

/**
 * Tam yolun ana hattı: kural değil ölçüt; zaman çizelgesi atlanan adımı buna bakarak bulur.
 */
export const MAIN_PATH: readonly OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
];

/**
 * İki durum arasında ana hatta atlanan adımlar; çizelge onları gri gösterir, çünkü siparişin neden hızlı
 * kapandığını gizlememeli. Ana hat dışına çıkan geçişte atlama yoktur.
 */
export function skippedBetween(from: OrderStatus | null, to: OrderStatus): OrderStatus[] {
  const toIndex = MAIN_PATH.indexOf(to);
  if (toIndex <= 0) return [];
  // `from` yoksa (siparişin doğuşu) ana hattın başından sayılır.
  const fromIndex = from === null ? -1 : MAIN_PATH.indexOf(from);
  if (from !== null && fromIndex === -1) return [];
  return MAIN_PATH.slice(fromIndex + 1, toIndex);
}
