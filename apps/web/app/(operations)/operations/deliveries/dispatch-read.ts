import {
  DeliveryRunService,
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  SettingsService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { doorCheckOf } from '@lezzet/address';
import { listCourierRoutes } from '@lezzet/application';
import {
  cutoffBelongsToPreviousDay,
  deliveryRunWindow,
  findZoneForPostalCode,
  ORDER_CUTOFF_KEY,
  PREP_CUTOFF_KEY,
  upcomingDeliveryDates,
} from '@lezzet/domain-core';
import type { Country, DeliveryZoneWithCodes, Order, OrderStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readDayHours, type ZoneHours } from '@/lib/settings/day-hours';
import { shiftDay, toIsoDate } from './deliveries-url';
import { runPreviewOf, type StopOrderPreview } from './dispatch-preview';
import type { DispatchDayView, DispatchRunView, DispatchStopView, PrepStage } from './dispatch-types';

/*
  Sevkiyat masasının sorusu "kim atanmamış" olduğu için kurye süzgeçli gün listesi kullanılamaz; kurye süzgeci olmayan durum okuması
  kullanılır. Bölge burada tanımlanmaz: posta kodundan bölgeyi motor çözer, bölge kaydı depoların.
*/

/** Hazırlanmamış sipariş de listede görünür, gizlenseydi araç eksik yüklenirdi; iptal bir çıkış değildir. */
const DAY_STATUSES: OrderStatus[] = [
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  // Teslim edilen sipariş zamanla `completed` olur; listede olmasa geçmiş günün durakları birer birer kaybolurdu.
  'completed',
  'returned',
];

/** Durumdan okunur, yeniden karar verilmez; karar depo ekranının. */
function prepOf(status: OrderStatus): PrepStage {
  if (status === 'confirmed') return 'not_started';
  if (status === 'preparing') return 'preparing';
  // Yola çıkmış sipariş "Hazır" değildir: mal depoda değil araçtadır.
  if (status === 'out_for_delivery') return 'on_the_way';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  if (status === 'returned') return 'returned';
  return 'ready';
}

/** Tavana dayanıldığı ekrana söylenir, yoksa "kuyruk bitti" sanılırdı; uzun kuyruk zaten asıl haberdir. */
const SHIPPING_QUEUE_LIMIT = 100;

/** Teslim günü geçip sonuçlanmamış durumlar; teslim, kapanış, iade ve iptal birer sonuç olduğu için yok. */
const STRANDED_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery'];

/** Sağlıklı operasyonda liste boştur; tavan aşılınca ekran "daha var" der, sessiz kırpma "hepsi bu" diye okunurdu. */
const STRANDED_LIMIT = 50;

/**
 * Kargoda hiç yok, çünkü kargo peşin ödenir. Sonuçlanmış durak sayılmaz: reddedilenin parası tahsil edilmez, teslim edilenin
 * kalanı ise müşteri kartının konusu olan bir borçtur.
 */
function doorDueCents(order: Order): number | null {
  if (order.deliveryType === 'shipping') return null;
  if (order.status === 'delivered' || order.status === 'completed' || order.status === 'returned') return null;
  const due = outstandingCents(order);
  return due > 0 ? due : null;
}

/** Aşamadan bağımsız borç: `doorDueCents`in sonuçlanmış durakta `null` dönmesi "ödendi" demek değildir. */
function outstandingCents(order: Order): number {
  return Math.max(0, order.orderedTotalCents - (order.amountCollectedCents - order.amountRefundedCents));
}

export async function readDispatchDay(date: string): Promise<DispatchDayView> {
  const db = serviceDb();
  const now = new Date();

  const [dayOrders, shippingQueue, strandedPage, zones, warehouses, couriers, dayRoutes] = await Promise.all([
    new OrderService(db).listByStatus(DAY_STATUSES, { deliveryDate: date }),
    // Kargoda `delivery_date` boş olduğu için kuyruk gün süzgeciyle okunmaz.
    new OrderService(db).listByStatus(['ready'], { limit: SHIPPING_QUEUE_LIMIT }),
    // Askıdakiler bakılan günden bağımsızdır, yoksa geçmiş güne bakan operatör o günü de askıda görürdü.
    new OrderService(db).listPage(
      { status: STRANDED_STATUSES, deliveryType: 'route', deliveryTo: shiftDay(toIsoDate(now), -1) },
      { limit: STRANDED_LIMIT },
    ),
    new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
    new WarehouseService(db).list(),
    new UserProfileService(db).listByRole('courier'),
    // Kuryenin rota seçimiyle aynı kapı ki iki ekran ayrışmasın; kapsam bilerek depo-üstü, çünkü bu masaya yalnız admin ulaşır ve
    // bütün ağın gününü görür.
    listCourierRoutes(db, { date, scope: { kind: 'all' } }),
  ]);

  // Eşikler rota başına okunur, çünkü rotaya yazılan kesim de uygulanmalı; sorgu anahtar başına tektir.
  const hours = await readDayHours(
    new SettingsService(db),
    zones.map((zone) => zone.id),
  );

  // Rota günü, kargo kuyruğu ve askıdakiler tek küme olarak çözülür; ayrı ayrı çözmek aynı sorguları üç kez sormak olurdu.
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
      customerId: order.customerId,
      channel: order.channel,
      deliveryType: order.deliveryType,
      status: order.status,
      prep: prepOf(order.status),
      courierId: order.courierId,
      courierName: order.courierId ? (courierName.get(order.courierId) ?? 'bilinmeyen kurye') : null,
      dueAmountCents: doorDueCents(order),
      outstandingCents: outstandingCents(order),
      // Satır sayısı değil adet.
      unitCount: items.filter((item) => item.orderId === order.id).reduce((sum, item) => sum + item.qty, 0),
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      zoneId,
      zoneName: zone?.name ?? null,
      warehouseName: zone ? (warehouseName.get(zone.warehouseId) ?? null) : null,
      /* Anlık görüntü adres satırının tam kopyası olduğu için kapı doğrulaması ek sorgusuz okunur. */
      doorCheck: doorCheckOf(snapshot),
    };
  });

  // Özet yalnız günün çıkışlarını sayar; kargo kuyruğu bir güne ait değildir ve takip numarasız paketiyle kendi alanında sayılır.
  const dayStops = stops.filter((stop) => dayOrders.some((order) => order.id === stop.orderId));
  const route = dayStops.filter((stop) => stop.deliveryType === 'route');
  const shippingStops = stops.filter((stop) => shipping.some((order) => order.id === stop.orderId));
  // Engel sayaçları yalnız hâlâ müdahale edilebilir durakları sayar: sonuçlanmış durak engel değildir, künye sayaçları bütün günü sayar.
  const open = route.filter((stop) => stop.prep !== 'delivered' && stop.prep !== 'returned');

  // En eski önde: askıda kalmanın ağırlığı süreyle artar.
  const strandedStops = stops
    .filter((stop) => stranded.some((order) => order.id === stop.orderId))
    .sort((a, b) => (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? ''));

  /* Motorun dizdiği sıra araç çıkmadan görülebilsin diye önizleme; seferlerin durakları tek turda okunur. */
  const previews = await readRunPreviews(
    db,
    dayRoutes.flatMap((route) => (route.run ? [route.run.runId] : [])),
  );

  // Satır alan alan eşlenir, fazlası taşınmaz.
  const runs: DispatchRunView[] = dayRoutes.map((route) => ({
    zoneId: route.zoneId,
    zoneName: route.zoneName,
    warehouseName: route.warehouseName,
    stopCount: route.stopCount,
    run: route.run
      ? {
          runId: route.run.runId,
          referenceNo: route.run.referenceNo,
          courierId: route.run.courierId,
          courierName: route.run.courierName,
          vehicleLabel: route.run.vehicleLabel,
          departedAt: route.run.departedAt,
          returnedAt: route.run.returnedAt,
          closed: route.run.closed,
          stopOrder: previews.get(route.run.runId) ?? null,
        }
      : null,
  }));

  return {
    date,
    today: toIsoDate(now),
    runs,
    route: sortByZone(route, zones),
    shipping: shippingStops,
    shippingTruncated: shippingQueue.length >= SHIPPING_QUEUE_LIMIT,
    stranded: strandedStops,
    strandedTruncated: stranded.length >= STRANDED_LIMIT,
    couriers: couriers.map((profile) => ({ id: profile.id, name: profile.name })),
    summary: {
      stops: route.length,
      units: route.reduce((sum, stop) => sum + stop.unitCount, 0),
      // Okumanın sırası (bölge `sort_order`), alfabetik değil: operatörün dizdiği düzen.
      warehouses: [...new Set(route.map((stop) => stop.warehouseName).filter((name) => name !== null))],
      notReadyNames: [
        ...new Set(
          route
            .filter((stop) => stop.prep === 'not_started' || stop.prep === 'preparing')
            .map((stop) => stop.customerName),
        ),
      ],
      // Sefer yalnız rotada anlamlı: kargonun kuryesi değil taşıyıcısı olur.
      runless: runs.filter((route) => route.run === null).length,
      zoneless: open.filter((stop) => stop.zoneId === null).length,
      doorCents: dayStops.reduce((sum, stop) => sum + (stop.dueAmountCents ?? 0), 0),
      doorCount: dayStops.filter((stop) => stop.dueAmountCents !== null).length,
      parcels: shippingStops.length,
      parcelsUntracked: shippingStops.filter((stop) => !stop.trackingNumber).length,
      stranded: strandedStops.length,
      /* İkisi ayrık sayılır: aynı durağı iki satırda saymak özeti şişirirdi; `unknown` hiç sayılmaz. */
      doorElsewhere: open.filter((stop) => stop.doorCheck === 'elsewhere').length,
      doorUnverified: open.filter((stop) => stop.doorCheck === 'unverified').length,
    },
    cutoff: cutoffView(zones, hours, date, now),
    moveDatesByZone: moveDates(zones, hours, now),
  };
}

/** Rotanın kendi eşiği, yoksa küresel satır. */
function thresholdsOf(
  zoneId: string | null,
  hours: Awaited<ReturnType<typeof readDayHours>>,
): { cutoffTime: string; prepCutoffTime: string } {
  const own: ZoneHours | undefined = zoneId ? hours.byZone.get(zoneId) : undefined;
  return {
    cutoffTime: own?.[ORDER_CUTOFF_KEY].time ?? hours.global[ORDER_CUTOFF_KEY],
    prepCutoffTime: own?.[PREP_CUTOFF_KEY].time ?? hours.global[PREP_CUTOFF_KEY],
  };
}

/**
 * Kararı motor verir (`deliveryRunWindow`). Eşikler rota başına, cevap tek: liste ancak her rota kapanınca kesinleşir ve yazılan
 * saat en geç kesimdir, çünkü operatörün beklemesi gereken an odur.
 */
function cutoffView(
  zones: readonly DeliveryZoneWithCodes[],
  hours: Awaited<ReturnType<typeof readDayHours>>,
  date: string,
  now: Date,
): DispatchDayView['cutoff'] {
  const rows = zones.length > 0 ? zones.map((zone) => thresholdsOf(zone.id, hours)) : [thresholdsOf(null, hours)];

  const settled = rows.every(
    (row) => deliveryRunWindow({ deliveryDate: date, now, cutoffTime: row.cutoffTime, prepCutoffTime: row.prepCutoffTime }) !== 'open',
  );
  const time = rows.map((row) => row.cutoffTime).sort((a, b) => b.localeCompare(a))[0]!;
  // Yazılan saatin hangi güne ait olduğu, o saatin sahibi rotanın kuralından okunur.
  const owner = rows.find((row) => row.cutoffTime === time) ?? rows[0]!;
  return { time, settled, isPrevDay: cutoffBelongsToPreviousDay(owner.cutoffTime, owner.prepCutoffTime) };
}

/**
 * Bölgesizler önde: hiçbir rotaya düşmeyen siparişe araç uğramaz, en acil olan odur. Bölge içindeki sıra operatörün dizdiği
 * sıradır, durak sırası değil.
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

/** Serbest tarih seçtirilmez: bölgenin haftalık günü olmayan güne taşınan sipariş teslim edilemez. */
function moveDates(
  zones: readonly DeliveryZoneWithCodes[],
  hours: Awaited<ReturnType<typeof readDayHours>>,
  now: Date,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const zone of zones) {
    // Her rota kendi kesim penceresini görür, komşusununkini değil.
    map[zone.id] = upcomingDeliveryDates({ weekdays: zone.weekdays, now, count: 4, ...thresholdsOf(zone.id, hours) });
  }
  return map;
}

/** Yalnız kimlik döner; bölge nesnesi listede zaten var. */
function zoneIdOf(snapshot: Record<string, unknown>, zones: readonly DeliveryZoneWithCodes[]): string | null {
  const postalCode = typeof snapshot.postalCode === 'string' ? snapshot.postalCode : null;
  const country = typeof snapshot.country === 'string' ? (snapshot.country as Country) : null;
  if (!postalCode || !country) return null;
  return findZoneForPostalCode({ country, postalCode }, zones)?.id ?? null;
}

/**
 * Amaç denetim: kuş uçuşuyla dizilmiş tur nehir ya da tek yön gibi bir engeli atlayabilir ve bunu sahadan önce ancak bir insan
 * görür. Sırası hesaplanmamış sefer `null` döner, harita çizilmez.
 */
async function readRunPreviews(db: SupabaseClient, runIds: readonly string[]): Promise<Map<string, StopOrderPreview>> {
  const out = new Map<string, StopOrderPreview>();
  if (runIds.length === 0) return out;

  const runRows = await new DeliveryRunService(db).listByIds(runIds);
  const sequenced = runRows.filter((run) => run.stopOrderMetric !== null && run.stopOrderPrecision !== null);
  if (sequenced.length === 0) return out;

  const [orders, warehouses] = await Promise.all([
    new OrderService(db).listByRuns(sequenced.map((run) => run.id)),
    new WarehouseService(db).list({}),
  ]);
  const warehouseById = new Map(warehouses.map((row) => [row.id, row]));

  /* Eşleme saf ve ayrı dosyada (`dispatch-preview.ts`) ki veritabanısız sınanabilsin; burada yalnız okuma var. */
  for (const run of sequenced) {
    const preview = runPreviewOf({
      run,
      orders: orders.map((order) => ({
        id: order.id,
        deliveryRunId: order.deliveryRunId,
        referenceNo: order.referenceNo,
        addressSnapshot: (order.addressSnapshot ?? null) as Record<string, unknown> | null,
      })),
      depot: warehouseById.get(run.warehouseId) ?? null,
    });
    if (preview) out.set(run.id, preview);
  }

  return out;
}
