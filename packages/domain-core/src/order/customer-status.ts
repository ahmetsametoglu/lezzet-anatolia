import type { CustomerOrderStatus, DeliveryType, OrderStatus } from '@lezzet/types';

/**
 * Sipariş durumunun müşteriye görünen karşılığı; `preparing`+`ready` ve `delivered`+`completed` birleşir, gel-al'da `ready`
 * müşterinin beklediği an olduğu için teslimat türü girdidir. Taslak `null`dır, ama ödemesi açılmış kart taslağı müşterinin
 * verdiği siparişin kendisidir ve `awaiting_payment` görünür.
 */
export function customerOrderStatus(
  status: OrderStatus,
  deliveryType: DeliveryType,
  /** Kart ödemesi açıldı mı: taslak online ödemeli ve ödeme kimliği yazılmış. */
  cardPaymentOpen = false,
): CustomerOrderStatus | null {
  switch (status) {
    case 'draft':
      return cardPaymentOpen ? 'awaiting_payment' : null;
    case 'confirmed':
      return 'received';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return deliveryType === 'pickup' ? 'ready_for_pickup' : 'preparing';
    case 'out_for_delivery':
      return 'on_the_way';
    case 'delivered':
    case 'completed':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    case 'returned':
      return 'returning';
  }
}

/**
 * Sipariş müşteri için hâlâ "akıyor" mu: liste onu yeşil çerçeveyle ayırır. Ölçüt müşterinin takip edeceği bir hareket; iade,
 * iptal ve ödeme bekleyen sipariş aktif sayılmaz, çünkü top bizde ya da müşterinin kendi eylemindedir.
 */
export function isActiveForCustomer(status: CustomerOrderStatus): boolean {
  return status === 'received' || status === 'preparing' || status === 'ready_for_pickup' || status === 'on_the_way';
}

/**
 * `fulfilled_qty` bir ölçüm mü: hazırlık onayına kadar kolon yazılmamış bir `0`dır ve "hiçbiri gönderilmedi" demez. Eşik
 * `ready`, çünkü onay orada yazılır; ölçüm yoksa okuyan taraf `qty`ye düşer.
 */
export function isFulfilmentKnown(status: OrderStatus): boolean {
  switch (status) {
    case 'draft':
    case 'confirmed':
    case 'preparing':
    case 'cancelled':
      return false;
    case 'ready':
    case 'out_for_delivery':
    case 'delivered':
    case 'completed':
    case 'returned':
      return true;
  }
}

/**
 * Müşteriye gösterilen dört sabit kilometre taşı (tasarım: "zaman çizgisi 4 sabit adım"). Gel-al'da üçüncü taş
 * "yolda" değil "teslime hazır": mal hiç yola çıkmaz, müşteri gelir.
 */
export type OrderMilestone = 'received' | 'prepared' | 'on_the_way' | 'ready_for_pickup' | 'delivered';

export interface OrderTimelineStep {
  milestone: OrderMilestone;
  state: 'done' | 'current' | 'pending';
  /**
   * Adımın gerçekleştiği an — **kaydı yoksa `null`.**
   *
   * Ayrım şu: **durum çıkarsanabilir, damga çıkarsanamaz.** Sipariş yoldaysa hazırlandığı
   * kesindir (hazırlanmamış sipariş yola çıkmaz), o yüzden adım `done` işaretlenir. Ama "ne zaman
   * hazırlandı" sorusunun cevabı yoksa uydurulmaz — ekran o adımın altına saat yazmaz.
   * (CLAUDE.md §1: ölçülemeyen değer sıfır değildir; burada da tarih değildir.)
   */
  at: string | null;
}

/** Kilometre taşını KARŞILAYAN iç durum(lar) — sıra anlamlıdır, zaman çizgisi bu sırayla çizilir. */
const MILESTONE_STATUSES: readonly (readonly [OrderMilestone, readonly OrderStatus[]])[] = [
  ['received', ['confirmed']],
  ['prepared', ['ready']],
  ['on_the_way', ['out_for_delivery']],
  ['delivered', ['delivered', 'completed']],
];

/**
 * Gel-al çizgisi: "hazırlandı" ile "teslime hazır" aynı iç durumdur (`ready`) ve çizgide iki kez gösterilmez;
 * üçüncü taş teslimi bekleyen malın kendisidir.
 */
const PICKUP_MILESTONE_STATUSES: readonly (readonly [OrderMilestone, readonly OrderStatus[]])[] = [
  ['received', ['confirmed']],
  ['ready_for_pickup', ['ready']],
  ['delivered', ['delivered', 'completed']],
];

/**
 * Sipariş zaman çizgisi: girdi anlık durum değil durum geçmişidir, çünkü atlanan geçişleri yalnız geçmiş söyler. `null` çizgi
 * çizilmez demek (iptal, iade, taslak); `prepared` adımı `ready`e bakar, mutfakta olmak adım sayılmaz.
 */
export function orderTimeline(
  current: OrderStatus,
  /** Durum defteri (`order_status_log`), eskiden yeniye. */
  history: readonly { toStatus: OrderStatus; createdAt: string }[],
  deliveryType: DeliveryType,
): OrderTimelineStep[] | null {
  if (current === 'draft' || current === 'cancelled' || current === 'returned') return null;

  const milestones = deliveryType === 'pickup' ? PICKUP_MILESTONE_STATUSES : MILESTONE_STATUSES;
  const stampOf = new Map<OrderStatus, string>();
  for (const row of history) if (!stampOf.has(row.toStatus)) stampOf.set(row.toStatus, row.createdAt);

  const reached = new Set<OrderStatus>([...history.map((h) => h.toStatus), current]);
  const hit = milestones.map(([, statuses]) => statuses.some((s) => reached.has(s)));

  // En ileri geçilen adım. Hiçbiri yoksa (yalnız `preparing`) ilk adım "şu an"dır: sipariş alınmış
  // ama kaydı düşmemiş olabilir — müşteriye boş bir çizgi göstermektense ilk adımı işaretlemek doğru.
  let furthest = 0;
  for (let i = hit.length - 1; i >= 0; i -= 1) {
    if (hit[i]) {
      furthest = i;
      break;
    }
  }

  const terminal = current === 'delivered' || current === 'completed';
  return milestones.map(([milestone, statuses], i) => ({
    milestone,
    // Geçilmiş adım `done`: yoldaki sipariş hazırlanmıştır, kaydı düşmemiş olsa da. Bu bir uydurma
    // DEĞİL, fiziksel bir çıkarım — ortada boş halka bırakmak müşteriye bozuk bir çizgi gösterirdi.
    state: (i < furthest ? 'done' : i === furthest ? (terminal ? 'done' : 'current') : 'pending') as OrderTimelineStep['state'],
    // Damga ise çıkarsanmaz: defterde karşılığı yoksa `null`.
    at: statuses.map((st) => stampOf.get(st)).find(Boolean) ?? null,
  }));
}
