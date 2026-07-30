import 'server-only';
import { OrderItemService, OrderService, serviceDb } from '@lezzet/database';
import { customerOrderStatus, isActiveForCustomer } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import type { CustomerOrderStatus, KeysetCursor, OrderItem, PaymentMethod, PaymentStatus } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { resolveOrderLines } from './customer-lines';

/**
 * "Siparişlerim" listesinin okuma kapısı (08.5).
 *
 * **Sayfalama keyset ve imleç URL'e YAZILMAZ** (CLAUDE.md §1): sipariş sayısı veriyle sınırsız
 * büyür, ama süzgeç yok — paylaşılabilecek bir seçim de yok. Liste kaydırdıkça uzar
 * (tasarım: *"sayfalama düğmesi yok"*).
 *
 * **Taslaklar listede YOKTUR.** Yarıda kalmış bir checkout müşterinin verdiği bir sipariş değildir;
 * göstermek "bir siparişim daha varmış" dedirtirdi. Süzme durum kararının kendisinden geliyor
 * (`customerOrderStatus` → `null`), ayrı bir liste tutulmuyor: iki yerde yaşayan bir kural, bir gün
 * ayrışan bir kuraldır.
 *
 * Taslak süzmesi sayfa DOLDURULDUKTAN sonra olduğu için bir sayfa istenenden az satır dönebilir —
 * bu kabul edilir; `nextCursor` yine doğrudur ve kaydırma devam eder. Alternatifi, sorguya durum
 * süzgeci koyup keyset'i bozmaktı.
 */
export interface CustomerOrderSummary {
  id: string;
  /** Referans numarası — sipariş onaylanınca doğar; taslakta yok ama taslak zaten listede yok. */
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  /** Listenin en üstünde yeşil çerçeveyle ayrışan satır (tasarım). */
  active: boolean;
  total: number;
  itemCount: number;
  /** Kısa içerik özeti — ilk birkaç ürünün adı; müşteri "hangi siparişim neydi"yi ayırt etsin. */
  productNames: readonly string[];
}

export interface CustomerOrderPage {
  orders: readonly CustomerOrderSummary[];
  nextCursor: KeysetCursor | null;
}

/** Özette adı yazılan ürün sayısı — tasarımda üç ad + "…" var. */
const SUMMARY_NAME_LIMIT = 3;

export async function listCustomerOrders(
  locale: Locale,
  customerId: string,
  cursor?: KeysetCursor,
): Promise<CustomerOrderPage> {
  const db = serviceDb();
  const page = await new OrderService(db).listByCustomer(customerId, { cursor });

  // Kalemler TEK turda: sipariş başına sorgu N+1 olurdu (`listByOrders` öbekliyor).
  const items = await new OrderItemService(db).listByOrders(page.rows.map((o) => o.id));
  const lines = await resolveOrderLines(db, items, locale);

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const orders: CustomerOrderSummary[] = [];
  for (const order of page.rows) {
    const status = customerOrderStatus(order.status);
    if (!status) continue; // Taslak — müşterinin siparişi değil.

    const own = itemsByOrder.get(order.id) ?? [];
    // Ad tekilleştirilir: aynı ürünün iki boyu özette iki kez yazılmamalı ("Baklava, Baklava").
    const names = [...new Set(own.map((i) => lines.get(i.variantId)?.name).filter((n): n is string => Boolean(n)))];

    orders.push({
      id: order.id,
      referenceNo: order.referenceNo,
      createdAt: order.createdAt,
      status,
      active: isActiveForCustomer(status),
      total: order.total,
      itemCount: own.length,
      productNames: names.slice(0, SUMMARY_NAME_LIMIT),
    });
  }

  return { orders, nextCursor: page.nextCursor };
}

/** Detay sayfasının kalemi — künye + sipariş anındaki para. */
export interface CustomerOrderDetailLine {
  id: string;
  name: string;
  unit: string;
  qty: number;
  /** Fiziksel olarak giden miktar; `qty`den azsa ekran farkı ve para çözümünü yazar. */
  fulfilledQty: number;
  unitPrice: number;
  lineTotal: number;
  /** Paketten gelen kalem — ekran paket adıyla gruplar. */
  bundleId: string | null;
}

export interface CustomerOrderDetail {
  id: string;
  referenceNo: string | null;
  createdAt: string;
  status: CustomerOrderStatus;
  deliveryType: 'route' | 'shipping';
  deliveryDate: string | null;
  address: { line1?: string; line2?: string; postalCode?: string; city?: string } | null;
  lines: readonly CustomerOrderDetailLine[];
  subtotal: number;
  discountAmount: number;
  discountLabel: string;
  shippingFee: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
}

/**
 * Tek siparişin detayı (08.5).
 *
 * **Sahiplik sunucuda doğrulanır** ve bulunamayan ile başkasına ait olan AYNI cevabı alır (`null`):
 * ayrım söylenirse, deneme yanılmayla başkasının sipariş kimliği doğrulatılabilirdi.
 *
 * **Taslak burada da görünmez** — listede olmayan bir siparişin detayına doğrudan adresle
 * girilebilmesi, listenin kuralını arkadan delerdi.
 *
 * **Satır toplamı sipariş anındaki paradan hesaplanır** (`unit_price` × giden miktar − indirim
 * payı), bugünkü fiyattan değil: burası bir kayıttır, vitrin değil. Ürün ADI ise canlı okunur
 * (`customer-lines` künyesi) — para donar, isim donmaz.
 */
export async function getCustomerOrderDetail(
  locale: Locale,
  customerId: string,
  orderId: string,
): Promise<CustomerOrderDetail | null> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(orderId);
  if (!found || found.order.customerId !== customerId) return null;

  const { order, items } = found;
  const status = customerOrderStatus(order.status);
  if (!status) return null;

  const lookup = await resolveOrderLines(db, items, locale);

  const lines = items.map((item) => {
    // Karşılanan miktar üzerinden: eksik gönderilen kalemin parası da eksiktir.
    const billedQty = item.fulfilledQty;
    return {
      id: item.id,
      name: lookup.get(item.variantId)?.name ?? '',
      unit: lookup.get(item.variantId)?.unit ?? '',
      qty: item.qty,
      fulfilledQty: item.fulfilledQty,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * billedQty - item.lineDiscountAmount,
      bundleId: item.bundleId,
    };
  });

  return {
    id: order.id,
    referenceNo: order.referenceNo,
    createdAt: order.createdAt,
    status,
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate,
    address: order.addressSnapshot as CustomerOrderDetail['address'],
    lines,
    // Ara toplam kalemlerden TÜRETİLİR: siparişte ayrı bir alan yok ve olmamalı — iki kaynak
    // bir gün ayrışır. İndirim ayrı satır olarak gösterildiği için burada payları geri ekliyoruz.
    subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0) + order.discountAmount,
    discountAmount: order.discountAmount,
    discountLabel: order.discountLabel ? resolveLocalizedText(order.discountLabel, locale) : '',
    shippingFee: order.shippingFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
  };
}
