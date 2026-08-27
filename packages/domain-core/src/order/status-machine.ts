import type { OrderStatus } from '@lezzet/types';

/**
 * Sipariş durum makinesi — `ORDER_LIFECYCLE.md` birebir (03.1).
 *
 * Sipariş **katı bir zincir değildir**: izin verilen geçişler kümesidir. Aynı varlık iki yoldan
 * geçebilir — tam yol (uzaktan sipariş) ve hızlı satış (kapı önü, tek adımda kapanır).
 *
 * Bu dosya "geçilebilir mi" sorusunun tek cevap yeridir. Stok/para etkileri BURADA YAPILMAZ;
 * geçişin neyi tetiklediği çağıran katmanın işidir (motor karar verir, uygulama uygular).
 */

/** Bir durumdan gidilebilecek durumlar. Boş dizi = terminal (çıkışı yok). */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Sepet/oluşturuluyor. İki çıkış: tam yolun başı (`confirmed`) ve hızlı satış (`completed`).
  // `cancelled`: TTL dolması / terk edilen checkout (DOMAIN §4 — rezervasyon penceresi).
  draft: ['confirmed', 'completed', 'cancelled'],

  // Tam yol ileri gider; `preparing`/`ready` ATLANABİLİR (küçük sipariş, anında hazır) —
  // ORDER_LIFECYCLE "Atlanabilir adımlar". Atlama iz bırakmaz demek değildir: her geçiş loglanır.
  confirmed: ['preparing', 'ready', 'out_for_delivery', 'cancelled'],
  preparing: ['ready', 'out_for_delivery', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],

  // Kapıda üç sonuç: teslim · ulaşılamadı (geri `ready`, mal ayrılmış kalır) · reddedildi (`returned`).
  out_for_delivery: ['delivered', 'ready', 'returned'],

  // Teslim sonrası: kapanış ya da iade süreci.
  delivered: ['completed', 'returned'],

  // İade süreci kapanışı — depo aksiyonu + para iadesi bitince sipariş kapanır; kalıcı
  // `returned`'da kalmaz.
  returned: ['completed'],

  completed: [],
  cancelled: [],
};

/** Terminal durumlar — buradan çıkış yoktur. */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/**
 * **Hazırlık kesinleşti mi** — `fulfilled_qty` bir VERDİKT mi, yoksa henüz yazılmamış bir sayı mı?
 *
 * `fulfilled_qty` yalnız hazırlıkta yazılır (`record_preparation`); ondan önce varsayılanı 0'dır.
 * Bu ayrım gözetilmezse onaylanmış her sipariş "hiçbir kalemi karşılanmamış" görünür ve buna
 * dayanan her hesap yanlış çıkar: tahsil edilecek tutar 0'a iner, peşin ödenmiş sipariş "iade
 * bekliyor" olur, ekran "eksik gitti" der. Oysa mal daha hazırlanmamıştır — eksik giden bir şey yok.
 *
 * **Durum tek başına yetmez, üç bölge var:**
 * - `draft`/`confirmed`/`cancelled` → hazırlık HİÇ başlamadı; sayı bir karar değil.
 * - `preparing` → belirsiz bölge: depo hâlâ topluyor olabilir, ya da eksik toplayıp kararı
 *   beklemek için burada bırakmış olabilir (`lib/order/preparation`: "eksik varsa `preparing`'de
 *   kalır"). Ayıran şey KAYIT: bir kalem bile toplanmışsa hazırlık yazılmıştır.
 * - `ready` ve sonrası → hazırlık bitti; sayı kesindir.
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

/**
 * Geçiş izinli mi. İzin verilmeyen geçiş bir HATA DEĞERİDİR, fırlatma değil (ORDER_LIFECYCLE
 * "Uygulama notu" + STACK §8) — çağıran `{data, error}` sözleşmesine çevirir.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): TransitionCheck {
  if (from === to) return { allowed: false, reason: 'same_status' };
  if (isTerminal(from)) return { allowed: false, reason: 'terminal' };
  return TRANSITIONS[from].includes(to) ? { allowed: true } : { allowed: false, reason: 'not_allowed' };
}

/**
 * Geçişin stok etkisi (ORDER_LIFECYCLE "Stok etkileşimi"). Karardır — yazımı çağıran yapar.
 *
 * İncelik: `→ confirmed` her zaman "şimdi ayır" demek DEĞİLDİR. Online ödemede stok checkout
 * başında (sipariş `draft`ken, TTL'li) ayrılmıştır; o durumda `confirmed` geçişi stok tarafında
 * bir şey yapmaz. Bu yüzden çağıran, rezervasyonun zaten var olup olmadığını bildirir.
 *
 * `cancelled`/`returned` etkisi **depoya çıpalıdır**: mal fiziksel olarak depoya girdiğinde işler,
 * kapıda değil (DOMAIN §4). `out_for_delivery → ready` (ulaşılamadı) stoğu HİÇ değiştirmez.
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
 * **Bu geçiş hangi kapıdan yazılır** — düz durum yazımı mı, kendi RPC'si mi?
 *
 * ── NEDEN VAR (denetim 26.08) ────────────────────────────────────────────────
 * Operasyon sipariş detayının "İzinli geçişler" şeridi `allowedTransitions`ı SÜZMEDEN düğmeye
 * çeviriyor ve hepsini düz yazıma (`transition_order_status`) yolluyordu. Ölçüldü: şeritten iptal
 * edilen sipariş `cancelled` görünüyor ama **ayrılmış malı serbest kalmıyordu**; şeritten teslim
 * edilen sipariş `delivered` görünüyor ama **fiili stok hiç düşmüyordu**. İkincisi daha ağır — mal
 * müşteride, sayı depoda. Kapıda/vadeli siparişte rezervasyonun TTL'i olmadığı için süpürücü de o
 * satırı görmüyor: hasar kalıcı, üstelik `cancelled` terminal olduğu için doğru kapı da kapanmış
 * oluyordu.
 *
 * ── AYIRAN ÖLÇÜT: STOK İŞİNİN ZAMANI, VARLIĞI DEĞİL ──────────────────────────
 * İlk yazılışı "stok etkisi varsa kapı ister" idi ve YANLIŞTI — ölçünce çıktı: `→ confirmed`in
 * etkisi `reserve`dir ama ayırma geçişten ÖNCE, ayrı bir adımda yapılır (`reserveOrderStock`), yani
 * o kural bugünkü checkout'u kırardı. Doğru ölçüt şu:
 *
 *   · **önce** yapılan iş (`→ confirmed`: ayırma) → düz kapı doğrudur, geçiş yalnız kaydeder.
 *   · **sonra** yapılan iş (`→ returned`: akıbet depoda işlenince) → düz kapı doğrudur, geçiş
 *     süreci açar.
 *   · **geçişin KENDİSİYLE, aynı transaction'da** yapılan iş → kendi kapısı şarttır. Araya düz
 *     yazım girerse durum ilerler ve stok yazımı HİÇ olmaz; yarım kalmış bir geçiş, hiç olmamış
 *     geçişten beterdir çünkü geri dönüşü de kapatır.
 *
 * `stockEffectOf` bu ayrımı tek başına veremez: `release_on_warehouse_return` değeri iki farklı
 * zamanı birden taşıyor (iptalde geçişle birlikte, iadede sonra). O yüzden kapı adıyla söylenir —
 * ve ad gerçek bir RPC'ye karşılık gelir, uydurma bir sınıflandırmaya değil.
 */
export type OrderGate = 'plain' | 'cancel_order' | 'deliver_order' | 'quick_sale';

export function gateFor(from: OrderStatus, to: OrderStatus): OrderGate {
  if (to === 'cancelled') return 'cancel_order'; // rezervasyon + kalem-parti + para iadesi, hepsi orada
  if (to === 'delivered') return 'deliver_order'; // fiili stok düşümü + rezervasyon kapanışı
  if (to === 'completed' && from === 'draft') return 'quick_sale'; // hızlı satış: fiiliden doğrudan
  return 'plain';
}

/** Düz durum yazımı bu geçiş için YETERSİZ mi — çağıranın tek soracağı soru. */
export function needsDedicatedGate(from: OrderStatus, to: OrderStatus): boolean {
  return gateFor(from, to) !== 'plain';
}

/**
 * `reference_no` bu geçişte üretilir mi — kural: **ilk kalıcı durum** (`confirmed`, hızlı satışta
 * `completed`). Numara rastgeledir ve hacim sızdırmaz (DATA_MODEL Kalıcı kararlar).
 */
export function producesReferenceNo(from: OrderStatus, to: OrderStatus): boolean {
  if (from !== 'draft') return false;
  return to === 'confirmed' || to === 'completed';
}

/**
 * Tam yolun ANA HATTI — sipariş normalde bu adımlardan geçer. Zincir katı değildir (adım
 * atlanabilir), bu yüzden liste bir kural değil bir ÖLÇÜTTÜR: zaman çizelgesi "hangi adım
 * atlandı" sorusunu buna bakarak yanıtlar.
 *
 * `draft` yok (sipariş sayılmaz), `cancelled`/`returned` yok (ana hat değil, sapma).
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
 * İki durum arasında ana hatta ATLANAN adımlar — "hazırlanıyor" hiç yazılmadan `ready`'e geçilmişse
 * o adım atlanmıştır.
 *
 * Zaman çizelgesi atlanan adımı SİLMEZ, gri gösterir: "burada bir şey olmadı" ile "burası hiç
 * yoktu" farklı şeylerdir ve ikincisi, siparişin neden hızlı kapandığını gizler.
 *
 * Ana hat dışına çıkan geçişte (iptal, iade, ulaşılamadı) atlama YOKTUR — sapma bir adım eksikliği
 * değildir.
 */
export function skippedBetween(from: OrderStatus | null, to: OrderStatus): OrderStatus[] {
  const toIndex = MAIN_PATH.indexOf(to);
  if (toIndex <= 0) return [];
  // `from` yoksa (siparişin doğuşu) ana hattın başından sayılır.
  const fromIndex = from === null ? -1 : MAIN_PATH.indexOf(from);
  if (from !== null && fromIndex === -1) return [];
  return MAIN_PATH.slice(fromIndex + 1, toIndex);
}
