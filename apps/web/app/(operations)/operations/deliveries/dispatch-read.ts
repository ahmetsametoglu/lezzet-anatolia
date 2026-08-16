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
import { shiftDay, toIsoDate } from './deliveries-url';
import type { DispatchDayView, DispatchStopView, PrepStage } from './dispatch-types';

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
const DAY_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  // **`completed` UNUTULMUŞTU** (düzeltme 16.08, ekranda ölçüldü). `delivered → completed` yaşam
  // döngüsünün NORMAL kapanışıdır (`ORDER_LIFECYCLE`), yani gün kapandıkça duraklar listeden birer
  // birer siliniyordu: dünün ekranı "2 durak · 3 adet" derken veritabanında 5 sipariş · 14 adet
  // vardı — üçü `completed` olduğu için hiç okunmuyordu. Unutulduğunun kanıtı hemen altında:
  // `prepOf` `completed`i zaten karşılıyor ve "Teslim" diye gösteriyor.
  // Takvim geldikten sonra bu hata BÜYÜDÜ: artık her geçmiş gün bir tık uzakta.
  'completed',
  'returned',
];

/** Hazırlık kademesi — durumdan OKUNUR, yeniden karar verilmez (karar depo ekranının). */
function prepOf(status: OrderStatus): PrepStage {
  if (status === 'confirmed') return 'not_started';
  if (status === 'preparing') return 'preparing';
  // Yola çıkmış sipariş "Hazır" DEĞİLDİR (düzeltme 16.08): bu satır yokken `out_for_delivery` son
  // satıra düşüp "Hazır" diye okunuyordu — yani "depoda bekliyor". Mal araçtaydı.
  if (status === 'out_for_delivery') return 'on_the_way';
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
 * **Askıda kalmış sayılan durumlar** — teslim günü geçtiği hâlde sonuçlanmamış olanlar. Dördü de
 * "henüz bitmedi" der: `confirmed` hiç hazırlanmamış · `preparing` depoda kalmış · `ready` yola
 * çıkmamış ya da çıkıp geri dönmüş (ulaşılamadı) · `out_for_delivery` yolda takılı kalmış.
 *
 * `delivered`/`completed`/`returned`/`cancelled` YOK: hepsi bir sonuç, askıda değil.
 */
const STRANDED_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery'];

/**
 * Askıda listesinin tavanı. Sağlıklı bir operasyonda bu liste boş olmalı; uzunsa asıl haber odur ve
 * ekran "daha var" diyebilmeli — sessiz kırpma "hepsi bu" diye okunur.
 */
const STRANDED_LIMIT = 50;

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
  const due = outstandingCents(order);
  return due > 0 ? due : null;
}

/**
 * **Hâlâ ödenmemiş tutar — aşamadan BAĞIMSIZ** (düzeltme 16.08, ekranda ölçüldü).
 *
 * `doorDueCents` "kapıda tahsil edilecek" sorusunu cevaplıyor ve sonuçlanmış siparişte bilinçli
 * olarak `null` dönüyor. Ama tablo o `null`ı **"Ödendi"** diye okuyordu ve bu bir YALANDI: dün
 * teslim edilmiş `LA-26-EJXNWT` ekranda "Ödendi" yazıyordu, oysa tutar 6,00 € · tahsil edilen
 * 0,00 € · `payment_status = pending`. Kimse ödememişti.
 *
 * İki soru ayrıldı: *"kapıda para konuşulacak mı"* (`doorDueCents`) ve *"bu siparişin borcu var mı"*
 * (bu). Kodun kendi yorumu zaten ayrımı yazıyordu — *"kalan varsa o bir BORÇTUR ve müşteri kartının
 * konusudur"* — ekran o cümleyi görmüyordu.
 */
function outstandingCents(order: Order): number {
  return Math.max(0, order.totalCents - (order.amountCollectedCents - order.amountRefundedCents));
}

export async function readDispatchDay(date: string): Promise<DispatchDayView> {
  const db = serviceDb();
  const now = new Date();

  const [dayOrders, shippingQueue, strandedPage, zones, warehouses, couriers, cutoffTime] = await Promise.all([
    new OrderService(db).listByStatus(DAY_STATUSES, { deliveryDate: date }),
    // Kargo GÜN süzgeciyle okunmaz — kargoda `delivery_date` şema gereği null (bkz. `shipping` künyesi).
    new OrderService(db).listByStatus(['ready'], { limit: SHIPPING_QUEUE_LIMIT }),
    // Askıda kalanlar BAKILAN GÜNDEN bağımsız: ölçüt "teslim günü bugünden önce ve sonuçlanmamış".
    // Bakılan güne göre okunsaydı geçmiş bir güne bakan operatör kendi baktığı günü de askıda görürdü.
    new OrderService(db).listPage(
      { status: STRANDED_STATUSES, deliveryType: 'route', deliveryTo: shiftDay(toIsoDate(now), -1) },
      { limit: STRANDED_LIMIT },
    ),
    new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
    new WarehouseService(db).list(),
    new UserProfileService(db).listByRole('courier'),
    new SettingsService(db).get<string>('order_cutoff_time', '16:00'),
  ]);

  // Rota günü + kargo kuyruğu + askıdakiler tek küme olarak çözülür (müşteri adı, adet, bölge aynı
  // yoldan geliyor); ayrı ayrı çözmek aynı üç sorguyu üç kez sormak olurdu.
  const shipping = shippingQueue.filter((order) => order.deliveryType === 'shipping');
  const stranded = strandedPage.rows;
  const extra = [...shipping, ...stranded];
  const orders = [...dayOrders, ...extra.filter((order) => !dayOrders.some((day) => day.id === order.id))];
  const orderIds = orders.map((order) => order.id);
  const [items, customers] = await Promise.all([
    orderIds.length > 0 ? new OrderItemService(db).listByOrders(orderIds) : Promise.resolve([]),
    new UserProfileService(db).listByIds([...new Set(orders.map((order) => order.customerId))]),
  ]);

  const customerName = new Map(customers.map((profile) => [profile.id, profile.name]));
  const courierName = new Map(couriers.map((profile) => [profile.id, profile.name]));
  const warehouseName = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));

  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

  const stops = orders.map((order): DispatchStopView => {
    const snapshot = (order.addressSnapshot ?? {}) as Record<string, unknown>;
    const zoneId = zoneIdOf(snapshot, zones);
    const zone = zoneId ? zoneById.get(zoneId) : undefined;
    return {
      orderId: order.id,
      referenceNo: order.referenceNo,
      deliveryDate: order.deliveryDate ?? null,
      customerName: customerName.get(order.customerId) ?? '—',
      channel: order.channel,
      deliveryType: order.deliveryType,
      status: order.status,
      prep: prepOf(order.status),
      courierId: order.courierId,
      courierName: order.courierId ? (courierName.get(order.courierId) ?? 'bilinmeyen kurye') : null,
      dueAmountCents: doorDueCents(order),
      outstandingCents: outstandingCents(order),
      // ADET, satır sayısı değil (16.08 düzeltmesi — `unitCount` künyesi).
      unitCount: items.filter((item) => item.orderId === order.id).reduce((sum, item) => sum + item.qty, 0),
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      zoneId,
      zoneName: zone?.name ?? null,
      warehouseName: zone ? (warehouseName.get(zone.warehouseId) ?? null) : null,
    };
  });

  // Özet YALNIZ GÜNÜN çıkışlarını sayar. Kargo kuyruğu bir güne ait değil; durak sayacına katsaydı
  // "bugün kaç çıkış" sorusunun cevabı her gün aynı sayı kadar şişerdi. **Ama kuyruğun EKSİĞİ
  // (takip numarası yazılmamış paket) künyeye giriyor** (16.08): tasarım §2 onu "gün kapanmadan
  // görünür bir eksiklik" diye tanımlıyordu, oysa özet susuyor ve eksik yalnız ekranın alt yarısında
  // görünüyordu. Kargo bir durak DEĞİL — kendi alanında sayılıyor, `stops`'a karışmıyor.
  const dayStops = stops.filter((stop) => dayOrders.some((order) => order.id === stop.orderId));
  const route = dayStops.filter((stop) => stop.deliveryType === 'route');
  const shippingStops = stops.filter((stop) => shipping.some((order) => order.id === stop.orderId));
  // EN ESKİ ÖNDE: askıda kalmanın ağırlığı süreyle artar. `listPage` `createdAt`e göre sıralıyor —
  // sipariş sırası burada bir şey söylemiyor, bekleme süresi söylüyor.
  /**
   * **Hâlâ müdahale edilebilir duraklar** — engel sayaçlarının kümesi (düzeltme 16.08).
   *
   * Sayaçlar bütün günü sayıyordu ve geçmiş günde ekran kendi kendisiyle çelişiyordu: şerit
   * *"1 sipariş hiçbir rotaya düşmedi"* derken aynı satır **"Teslim"** yazıyordu. Sonuçlanmış bir
   * durak bir engel değildir — mal gitti, yapılacak bir şey kalmadı. Künye sayaçları (`stops`,
   * `units`) bütün günü saymaya devam ediyor: onlar günün KİMLİĞİ, engel değil.
   */
  const open = route.filter((stop) => stop.prep !== 'delivered' && stop.prep !== 'returned');

  const strandedStops = stops
    .filter((stop) => stranded.some((order) => order.id === stop.orderId))
    .sort((a, b) => (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? ''));

  return {
    date,
    today: toIsoDate(now),
    route: sortByZone(route, zones),
    shipping: shippingStops,
    shippingTruncated: shippingQueue.length >= SHIPPING_QUEUE_LIMIT,
    stranded: strandedStops,
    strandedTruncated: stranded.length >= STRANDED_LIMIT,
    couriers: couriers.map((profile) => ({ id: profile.id, name: profile.name })),
    summary: {
      stops: route.length,
      units: route.reduce((sum, stop) => sum + stop.unitCount, 0),
      // Sıra okumanın sırası (bölge `sort_order`), alfabetik değil: operatörün dizdiği düzen.
      warehouses: [...new Set(route.map((stop) => stop.warehouseName).filter((name) => name !== null))],
      notReadyNames: [
        ...new Set(
          route
            .filter((stop) => stop.prep === 'not_started' || stop.prep === 'preparing')
            .map((stop) => stop.customerName),
        ),
      ],
      // Atanmamışlık YALNIZ rotada anlamlı: kargonun kuryesi olmaz, taşıyıcısı olur.
      unassigned: open.filter((stop) => !stop.courierId).length,
      zoneless: open.filter((stop) => stop.zoneId === null).length,
      doorCents: dayStops.reduce((sum, stop) => sum + (stop.dueAmountCents ?? 0), 0),
      doorCount: dayStops.filter((stop) => stop.dueAmountCents !== null).length,
      parcels: shippingStops.length,
      parcelsUntracked: shippingStops.filter((stop) => !stop.trackingNumber).length,
      stranded: strandedStops.length,
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
 * Rota satırlarının sırası — **bölgeye göre, bölgesizler ÖNDE** (16.08).
 *
 * Gruplama kalkıp bölge kolona dönünce sıra bir yerleşim tercihi olmaktan çıktı, bir öncelik kararı
 * oldu: bölgesi çözülemeyen sipariş hiçbir rotaya düşmemiştir, yani araç ona uğramaz. Eskiden bu
 * satırlar *"Bölgesi çözülemedi"* diye SON gruba düşüyordu — en acil olan en altta. Şimdi başta.
 *
 * Bölge içinde sıra okumanın verdiği sıradır (`delivery_zone.sort_order` → operatörün dizdiği sıra);
 * durak sırası DEĞİLDİR ve olmamalı — sistem sırayı bilmiyor (tasarım §6).
 */
function sortByZone(stops: readonly DispatchStopView[], zones: readonly DeliveryZoneWithCodes[]): DispatchStopView[] {
  const rank = new Map(zones.map((zone, index) => [zone.id, index]));
  return [...stops].sort((a, b) => {
    const left = a.zoneId === null ? -1 : (rank.get(a.zoneId) ?? Number.MAX_SAFE_INTEGER);
    const right = b.zoneId === null ? -1 : (rank.get(b.zoneId) ?? Number.MAX_SAFE_INTEGER);
    if (left !== right) return left - right;
    return a.customerName.localeCompare(b.customerName, 'tr');
  });
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

// `addressTextOf` SİLİNDİ (16.08) — sevkiyatçının tablosunda açık adres kolonu kalmadı. Adres
// kuryenin ekranında yaşıyor (`lib/courier/day.ts`, orada navigasyon/arama bağıyla birlikte) ve tam
// hâli sipariş detayında; burada okunması bir karar üretmiyordu. Snapshot yine okunuyor, ama yalnız
// BÖLGE çözmek için (`zoneIdOf`).
