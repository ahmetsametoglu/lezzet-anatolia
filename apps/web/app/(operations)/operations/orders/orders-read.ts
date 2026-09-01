import {
  allowedTransitions,
  derivePaymentStatusForOrder,
  dueDateOf,
  isOverdue,
  needsDedicatedGate,
  openAmountCents,
} from '@lezzet/domain-core';
import type { Order, OrderItem, UserProfile } from '@lezzet/types';
import type { OrderCountsView, OrderRow } from './orders-types';
import type { OrderCounts } from '@lezzet/database';

/**
 * Sipariş satırının kurulumu (09.7) — **saf dönüşüm**: DB satırları girer, ekranın göreceği
 * view-model çıkar. Okuma `page.tsx`'te, karar motorda; burası ikisini birleştirir.
 *
 * Kararların hiçbiri burada VERİLMEZ: izinli geçişler `allowedTransitions`'tan, vade gecikmesi
 * `isOverdue`'dan, tahsil edilecek tutar `derivePaymentStatusForOrder`'dan gelir — üçü de checkout
 * freninin ve durum makinesinin kullandığı tanımların ta kendisi.
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
}

export function toOrderRows(input: OrderRowInput): OrderRow[] {
  return input.orders.map((order) => toOrderRow(order, input));
}

function toOrderRow(order: Order, input: OrderRowInput): OrderRow {
  const customer = input.customers.get(order.customerId);
  const items = input.itemsByOrder.get(order.id) ?? [];
  const termDays = customer?.paymentTermDays ?? input.defaultTermDays;
  const warehouse = input.warehouseLabels.get(order.warehouseId) ?? null;

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
      dueDate: order.onAccount ? dueDateOf(order.createdAt, termDays).toISOString().slice(0, 10) : null,
      /*
        KALAN MOTORDAN (01.09) — liste ile detay AYNI sayıyı söylemek zorunda.

        Burada `openAmountCents(order)` duruyordu ve o hesap `total − net tahsilat`tır: **kısmi
        karşılamayı görmez.** Ölçüldü (`LA-26-93UXKY`): liste "Kapıda 46,39 €" derken detay
        "Kalan 27,29 €" diyordu — aradaki 19,10 € hiç gitmemiş maldı. İki ekranın aynı siparişe iki
        borç yazması, hangisine bakıldığına göre farklı para tahsil edilmesi demek.

        `openAmountCents` yanlış değil, BAŞKA bir sorunun cevabı: vade defterinde siparişin ham
        borcu odur (`creditPosition` onu kullanır ve orada doğrudur). Kapıda tahsil edilecek tutarı
        soran ekran motora sorar.
      */
      openCents: derivePaymentStatusForOrder(order, items, {
        collectedCents: order.amountCollectedCents,
        refundedCents: order.amountRefundedCents,
      }).amountToCollectCents,
      overdue: isOverdue(order, termDays, input.now),
    },
    isGift: order.isGiftOrder,
    createdAt: order.createdAt,
    // Detay şeridiyle AYNI süzgeç (denetim 26.08): düz durum yazımından geçemeyen geçiş burada da
    // "ilerlenebilir" diye sunulmaz. Bugün bu alanı çizen bir liste ekranı yok; süzgeç yine de
    // burada, çünkü ayrı bırakılan iki liste bir gün ayrışır ve ikincisini kullanan ekran aynı
    // arızayı sıfırdan doğurur — ilkinde düzeltilmiş olması onu korumaz.
    allowedNext: allowedTransitions(order.status).filter((to) => !needsDedicatedGate(order.status, to)),
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
