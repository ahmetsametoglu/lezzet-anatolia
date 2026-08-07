import {
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  SettingsService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { findZoneForPostalCode, upcomingDeliveryDates } from '@lezzet/domain-core';
import type { Country, DeliveryZoneWithCodes, Order, OrderStatus } from '@lezzet/types';
import { toIsoDate } from './deliveries-url';
import type { DispatchDayView, DispatchStopView, DispatchZoneView, PrepStage } from './dispatch-types';

/**
 * Sevkiyatçının gün planının okuması (09.15) — `design/pages/admin-teslimat.md`.
 *
 * **Kurye kapısı KULLANILMIYOR ve kullanılamaz:** `listCourierDay` kurye kimliğini zorunlu tutuyor
 * (o imza bir güvenlik sınırı) ve bu ekranın asıl sorusu tam tersi — *"bugün kim ATANMAMIŞ".*
 * Atanmamışı görmek için kurye süzgeci olmayan bir okuma gerekiyor; `listByStatus` zaten o okumayı
 * yapıyor (depo kuyruğunun okuması) ve gün süzgeci taşıyor.
 *
 * **Bölge burada TANIMLANMAZ, okunur** (tasarım §6): posta kodu → bölge eşlemesi motorun
 * (`findZoneForPostalCode`), bölge kaydı Depolar'ın. Bu okuma yalnız zinciri kuruyor.
 */

/**
 * Günün "çıkış" sayılan durumları. `confirmed` de dâhil ve bilerek: hazırlanmamış siparişin bu
 * listede GÖRÜNMESİ gerekiyor (tasarım §4 "hazır olmayan sipariş listede — görünür uyarı hâli"),
 * gizlenseydi araç eksik yüklenirdi. `cancelled` yok: iptal bir çıkış değil.
 */
const DAY_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'returned'];

/** Hazırlık kademesi — durumdan OKUNUR, yeniden karar verilmez (karar depo ekranının). */
function prepOf(status: OrderStatus): PrepStage {
  if (status === 'confirmed') return 'not_started';
  if (status === 'preparing') return 'preparing';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'returned') return 'returned';
  return 'ready';
}

/**
 * Kargo kuyruğunun tavanı. Sessiz kırpma YOK: tavana dayanıldığı ekrana söyleniyor, yoksa "kuyruk
 * bitti" sanılırdı. Kuyruk doğası gereği kısa olmalı — uzunsa asıl haber odur.
 */
const SHIPPING_QUEUE_LIMIT = 100;

/**
 * Kapıda tahsil edilecek tutar — **HÂLÂ tahsil edilebilir olanlar** (tasarım §2: "kapıda tahsil
 * edilecek toplam").
 *
 * İki eleme var ve ikisi de ölçümle kondu (06.08, seed verisi üstünde):
 *
 * - **Kargoda her zaman `null`** (K37: kargo yalnız online peşin ödenir). Kural veride de duruyor
 *   ama ekran onu varsaymıyor, açıkça uyguluyor: kapıda tahsilat kargo satırında hiç doğmamalı.
 * - **Sonuçlanmış durak sayılmaz.** Reddedilen siparişin parası HİÇ tahsil edilmeyecek (mal depoya
 *   döndü), teslim edilmişin parası da kapıda değil — kurye oradan ayrıldı, kalan varsa o bir
 *   BORÇTUR ve müşteri kartının konusudur. İkisi de dâhilken günün beklenen tahsilatı 747,80 €
 *   çıkıyordu, oysa en fazla 689,80 € toplanabilirdi: ekran sevkiyatçıya olmayan parayı vaat
 *   ediyordu ve akşam kasa mutabakatı (11.6) o farkı açıklanamaz bir eksik olarak gösterirdi.
 */
function doorDueCents(order: Order): number | null {
  if (order.deliveryType === 'shipping') return null;
  if (order.status === 'delivered' || order.status === 'completed' || order.status === 'returned') return null;
  const due = order.totalCents - (order.amountCollectedCents - order.amountRefundedCents);
  return due > 0 ? due : null;
}

export async function readDispatchDay(date: string): Promise<DispatchDayView> {
  const db = serviceDb();
  const now = new Date();

  const [dayOrders, shippingQueue, zones, warehouses, couriers, cutoffTime] = await Promise.all([
    new OrderService(db).listByStatus(DAY_STATUSES, { deliveryDate: date }),
    // Kargo GÜN süzgeciyle okunmaz — kargoda `delivery_date` şema gereği null (bkz. `shipping` künyesi).
    new OrderService(db).listByStatus(['ready'], { limit: SHIPPING_QUEUE_LIMIT }),
    new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
    new WarehouseService(db).list(),
    new UserProfileService(db).listByRole('courier'),
    new SettingsService(db).get<string>('order_cutoff_time', '16:00'),
  ]);

  // Rota günü + kargo kuyruğu tek küme olarak çözülür (müşteri adı, kalem sayısı, adres aynı yoldan
  // geliyor); ayrı ayrı çözmek aynı üç sorguyu iki kez sormak olurdu.
  const shipping = shippingQueue.filter((order) => order.deliveryType === 'shipping');
  const orders = [...dayOrders, ...shipping.filter((order) => !dayOrders.some((day) => day.id === order.id))];
  const orderIds = orders.map((order) => order.id);
  const [items, customers] = await Promise.all([
    orderIds.length > 0 ? new OrderItemService(db).listByOrders(orderIds) : Promise.resolve([]),
    new UserProfileService(db).listByIds([...new Set(orders.map((order) => order.customerId))]),
  ]);

  const customerName = new Map(customers.map((profile) => [profile.id, profile.name]));
  const courierName = new Map(couriers.map((profile) => [profile.id, profile.name]));
  const warehouseName = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));

  const stops = orders.map((order): DispatchStopView & { zoneId: string | null } => {
    const snapshot = (order.addressSnapshot ?? {}) as Record<string, unknown>;
    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      customerName: customerName.get(order.customerId) ?? '—',
      address: addressTextOf(snapshot),
      deliveryType: order.deliveryType,
      status: order.status,
      prep: prepOf(order.status),
      courierId: order.courierId,
      courierName: order.courierId ? (courierName.get(order.courierId) ?? 'bilinmeyen kurye') : null,
      dueAmountCents: doorDueCents(order),
      itemCount: items.filter((item) => item.orderId === order.id).length,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      zoneId: zoneIdOf(snapshot, zones),
    };
  });

  // Özet YALNIZ GÜNÜN çıkışlarını sayar. Kargo kuyruğu bir güne ait değil; sayaca katsaydı
  // "bugün kaç çıkış" sorusunun cevabı her gün aynı sayı kadar şişerdi.
  const dayStops = stops.filter((stop) => dayOrders.some((order) => order.id === stop.orderId));
  const route = dayStops.filter((stop) => stop.deliveryType === 'route');

  return {
    date,
    today: toIsoDate(now),
    zones: groupByZone(route, zones, warehouseName),
    shipping: stops.filter((stop) => shipping.some((order) => order.id === stop.orderId)),
    shippingTruncated: shippingQueue.length >= SHIPPING_QUEUE_LIMIT,
    couriers: couriers.map((profile) => ({ id: profile.id, name: profile.name })),
    summary: {
      total: dayStops.length,
      ready: dayStops.filter((stop) => stop.prep === 'ready' || stop.prep === 'delivered').length,
      // Atanmamışlık YALNIZ rotada anlamlı: kargonun kuryesi olmaz, taşıyıcısı olur.
      unassigned: route.filter((stop) => !stop.courierId).length,
      doorCents: dayStops.reduce((sum, stop) => sum + (stop.dueAmountCents ?? 0), 0),
      doorCount: dayStops.filter((stop) => stop.dueAmountCents !== null).length,
    },
    cutoff: { time: cutoffTime, settled: isSettledDay(date, cutoffTime, now) },
    moveDatesByZone: moveDates(zones, cutoffTime, now),
  };
}

/**
 * **Liste kesinleşti mi** (tasarım §2). Geçmiş gün kesindir; gelecek gün büyümeye açıktır; BUGÜN ise
 * kesim saatine bağlıdır — saatten sonra gelen sipariş bir sonraki güne yazılır, yani liste artık
 * araç yüklenirken büyümez. Bu, ekranın verdiği bir güven duygusudur ve uydurulmaz: kural motorun
 * (`upcomingDeliveryDates`) kesim mantığının aynısı, saat de ayardan gelir.
 */
function isSettledDay(date: string, cutoffTime: string, now: Date): boolean {
  const today = toIsoDate(now);
  if (date < today) return true;
  if (date > today) return false;

  const [hour, minute] = cutoffTime.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  return now.getHours() * 60 + now.getMinutes() >= hour! * 60 + minute!;
}

/**
 * Bölge grupları. **Bölgesi çözülemeyen durak GİZLENMEZ**, sonda kendi grubunda toplanır: posta kodu
 * hiçbir aktif bölgeye düşmüyorsa bu bir veri sorunudur ve sevkiyatçının görmesi gereken tam olarak
 * odur — gizlenseydi araç eksik çıkardı ve kimse sebebini bilemezdi.
 */
function groupByZone(
  stops: Array<DispatchStopView & { zoneId: string | null }>,
  zones: readonly DeliveryZoneWithCodes[],
  warehouseName: ReadonlyMap<string, string>,
): DispatchZoneView[] {
  const grouped: DispatchZoneView[] = [];

  for (const zone of zones) {
    const own = stops.filter((stop) => stop.zoneId === zone.id);
    if (own.length === 0) continue;
    grouped.push({
      id: zone.id,
      name: zone.name,
      warehouseName: warehouseName.get(zone.warehouseId) ?? '—',
      stops: own,
    });
  }

  const orphans = stops.filter((stop) => stop.zoneId === null);
  if (orphans.length > 0) {
    grouped.push({ id: '', name: 'Bölgesi çözülemedi', warehouseName: '—', stops: orphans });
  }
  return grouped;
}

/**
 * Bir durağın taşınabileceği yaklaşan günler, bölge başına. Serbest tarih seçtirmiyoruz: bölgenin
 * haftalık günü olmayan bir güne taşımak, o gün oraya araç gitmediği için teslim edilemeyecek bir
 * sipariş yaratırdı. Kesim saati de aynı motorda uygulanıyor.
 */
function moveDates(zones: readonly DeliveryZoneWithCodes[], cutoffTime: string, now: Date): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const zone of zones) {
    map[zone.id] = upcomingDeliveryDates({ weekdays: zone.weekdays, now, cutoffTime, count: 4 });
  }
  return map;
}

/**
 * Adresin anlık kopyasından bölge KİMLİĞİ — kararı motor veriyor, ekran değil.
 *
 * Bölge nesnesinin tamamı değil yalnız kimliği dönüyor: gruplama zaten bölge listesi üzerinden
 * kuruluyor, nesneyi ikinci kez taşımak aynı kaydın iki kopyasını dolaştırmak olurdu.
 */
function zoneIdOf(snapshot: Record<string, unknown>, zones: readonly DeliveryZoneWithCodes[]): string | null {
  const postalCode = typeof snapshot.postalCode === 'string' ? snapshot.postalCode : null;
  const country = typeof snapshot.country === 'string' ? (snapshot.country as Country) : null;
  if (!postalCode || !country) return null;
  return findZoneForPostalCode({ country, postalCode }, zones)?.id ?? null;
}

/** Sipariş anındaki adres — sonradan düzeltilse de aracın gideceği yer budur (0015). */
function addressTextOf(snapshot: Record<string, unknown>): string | null {
  const parts = [snapshot.line1, snapshot.line2, snapshot.postalCode, snapshot.city].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}
