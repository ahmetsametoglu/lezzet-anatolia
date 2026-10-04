import { waitingDaysSince } from '@lezzet/application';
import {
  derivePaymentStatusForOrder,
  dueDateOf,
  isOverdue,
  officeTransitions,
  openAmountCents,
} from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import type { Order, OrderItem, UserProfile } from '@lezzet/types';
import type { OrderCountsView, OrderRow } from './orders-types';
import type { OrderCounts } from '@lezzet/database';

/**
 * Sipariş satırının kurulumu saf dönüşümdür: DB satırları girer, ekranın view-model'i çıkar. Geçişler, vade gecikmesi ve tahsil
 * edilecek tutar motordan gelir, ki checkout freni ve durum makinesiyle aynı tanım kullanılsın.
 */

interface OrderRowInput {
  orders: readonly Order[];
  /** Sipariş kimliğine göre kalemler — kalem/adet özeti ve paket işareti için. */
  itemsByOrder: Map<string, OrderItem[]>;
  customers: Map<string, UserProfile>;
  courierNames: Map<string, string>;
  /** Müşteride tanımlı değilse geçerli olan vade süresi (`Setting`). */
  defaultTermDays: number;
  /** TEK "şimdi": listenin tüm satırları aynı ana göre değerlendirilsin. */
  now: Date;
  /** Kimlik → depo adı/kodu; KAPALI depolar dahil (geçmiş sipariş tesisini söylemek zorunda). */
  warehouseLabels: Map<string, { code: string; name: string }>;
  /** Hazır gel-al siparişlerinin `ready`ye ilk geçiş anı (sipariş → ISO); yalnız o satırlar için okunur. */
  pickupReadyAt: ReadonlyMap<string, string>;
  /** `pickup_wait_days` ayarı — süresi dolan gel-al bu eşikle işaretlenir. */
  pickupWaitDays: number;
}

export function toOrderRows(input: OrderRowInput): OrderRow[] {
  return input.orders.map((order) => toOrderRow(order, input));
}

function toOrderRow(order: Order, input: OrderRowInput): OrderRow {
  const customer = input.customers.get(order.customerId);
  const items = input.itemsByOrder.get(order.id) ?? [];
  const termDays = customer?.paymentTermDays ?? input.defaultTermDays;
  const warehouse = input.warehouseLabels.get(order.warehouseId) ?? null;
  // Süre yalnız HAZIR gel-al'da anlamlı: toplanmamış sipariş henüz müşteriyi bekletmiyor, teslim edilmiş beklemiyor.
  const pickupWaitingDays =
    order.deliveryType === 'pickup' && order.status === 'ready' ? waitingDaysSince(input.pickupReadyAt.get(order.id) ?? null, input.now) : null;

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    customerName: customer?.name?.trim() || 'Bilinmeyen müşteri',
    customerHint: hintOf(customer),
    channel: order.channel,
    status: order.status,
    source: order.orderSource,
    itemCount: items.length,
    unitCount: items.reduce((sum, i) => sum + i.qty, 0),
    hasBundle: items.some((i) => i.bundleId !== null),
    totalCents: order.orderedTotalCents,
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    pickupWaitingDays,
    pickupOverdue: pickupWaitingDays !== null && pickupWaitingDays > input.pickupWaitDays,
    deliveryArea: areaOf(order.addressSnapshot),
    courierId: order.courierId,
    courierName: order.courierId ? (input.courierNames.get(order.courierId) ?? null) : null,
    deliveryRunId: order.deliveryRunId,
    payment: {
      status: order.paymentStatus,
      method: order.paymentMethod,
      onAccount: order.onAccount,
      // Vade günü YALNIZ vadeli siparişte anlamlı: peşin siparişte "vade 12 Tem" yazmak, olmayan
      // bir borcu varmış gibi gösterirdi.
      dueDate: order.onAccount ? parisDateOf(dueDateOf(order.createdAt, termDays)) : null,
      /* Kalan tutar motordan gelir, ki liste ile detay aynı sayıyı söylesin; `openAmountCents` kısmi karşılamayı görmez, o vade
         defterinin ham borcudur. */
      openCents: derivePaymentStatusForOrder(order, items, {
        collectedCents: order.amountCollectedCents,
        refundedCents: order.amountRefundedCents,
      }).amountToCollectCents,
      overdue: isOverdue(order, termDays, input.now),
    },
    isGift: order.isGiftOrder,
    createdAt: order.createdAt,
    // Detayın eylem satırıyla aynı süzgeç (`officeTransitions`); bugün bu alanı çizen liste yok, ama ayrı bırakılan iki süzgeç bir gün
    // ayrışırdı.
    allowedNext: officeTransitions(order.status),
    // Bir sipariş TEK depodan çıkar (DOMAIN §17) — bu yüzden satırda tek bir kod durur, liste değil.
    // Ad bilinmiyorsa (silinmiş değil, yalnız haritaya girmemiş bir kimlik) uydurma yapılmaz.
    warehouse: warehouse ? { code: warehouse.code, name: warehouse.name } : null,
  };
}

/** Aynı adlı iki müşteriyi ayıran kısa künye: şirket varsa o, yoksa telefon. */
function hintOf(customer: UserProfile | undefined): string {
  if (!customer) return '';
  const company = (customer.companyInfo as { legalName?: string } | null)?.legalName;
  return company?.trim() || customer.phone?.trim() || '';
}

/**
 * Adres kopyasından semt/şehir. Kopya `jsonb`'dir ve şeması sipariş anına aittir — alan eksikse
 * boş döner, ekran o zaman teslim türünü tek başına yazar (uydurma adres yok).
 */
function areaOf(snapshot: Record<string, unknown> | null): string {
  if (!snapshot) return '';
  const city = typeof snapshot.city === 'string' ? snapshot.city.trim() : '';
  const postal = typeof snapshot.postalCode === 'string' ? snapshot.postalCode.trim() : '';
  return [postal, city].filter(Boolean).join(' ');
}

/** Servis sayaçlarını ekranın okuduğu hâle indirger — para KURUŞA burada çevrilir (STACK §8). */
export function toCountsView(counts: OrderCounts): OrderCountsView {
  return {
    byStatus: Object.fromEntries(counts.byStatus),
    total: counts.total,
    totalCents: counts.sum.totalCents,
    codCount: counts.cod.count,
    // Açık tutar formülü MOTORUN: toplamlar doğrusal olduğu için küme toplamına da birebir uyar.
    codOpenCents: openAmountCents({
      orderedTotalCents: counts.cod.totalCents,
      amountCollectedCents: counts.cod.collectedCents,
      amountRefundedCents: counts.cod.refundedCents,
    }),
  };
}
