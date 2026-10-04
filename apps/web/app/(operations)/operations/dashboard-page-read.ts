import {
  AnalyticsReportService,
  AssistantProposalService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  SettingsService,
  TicketService,
  UserProfileService,
  type serviceDb,
} from '@lezzet/database';
import { countOverduePickups, readFacilityVanSummary } from '@lezzet/application';
import { PICKUP_WAIT_DAYS_DEFAULT, PICKUP_WAIT_DAYS_KEY } from '@lezzet/domain-core';
import { addDays, BUSINESS_TIME_ZONE, parisDateOf, parisMinutesOf } from '@lezzet/helper';
import type { Order, OrderStatus, TicketStatus } from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { stockLink } from './stock/stock-url';
import { DAY_HOUR_FALLBACK, DAY_HOUR_KEYS, type DayHourKey } from '@/lib/settings/day-hours';
import { money, num } from '@/components/operation/ui/format';
import { toOrderRows } from './orders/orders-read';
import type { OrderRow } from './orders/orders-types';
import {
  buildBand,
  buildKpis,
  buildProposals,
  buildQueue,
  buildRouteFlow,
  toRoute,
  toStops,
  type QueueFact,
  type RouteFlowFact,
  type StopFact,
} from './dashboard-read';
import type { DashboardData, DeliveryRouteView, VanLoadBandView } from './dashboard-types';

type Db = ReturnType<typeof serviceDb>;

// Panelin sunucu okuması: dönüştürücüler `dashboard-read`te (saf, istemciye girer), DB'ye dokunan her şey burada. Günün siparişleri tek
// sayfada okunup dört bölümü birden besler, eşik saatleri ayardan gelir (varsayılanları `lib/settings/day-hours`te).

/** Günün siparişi bir tesiste yüzlerle ölçülmez; tavan kaçak bir güvence, ekranın sözü değil. */
const DAY_ORDER_LIMIT = 300;
/** Gecikmiş vade taraması — açık ödemeli siparişler; kuyruk sayısı için fazlasıyla yeter. */
const OPEN_PAYMENT_LIMIT = 200;
/** Sparkline penceresi: bugün dahil yedi gün. */
const SERIES_DAYS = 7;

const PAYMENT_TERM_KEY = 'payment_term_days';
const PAYMENT_TERM_DEFAULT = 30;

/** Hazırlanmış sayılan durumlar — `ready` ve sonrası. `confirmed`/`preparing` henüz raftadır. */
const PREPARED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['ready', 'out_for_delivery', 'delivered', 'completed']);

/** Gün listesinden düşenler: iptal ve taslak bir iş değildir, sayılırsa gün olduğundan yoğun görünür. */
const OUT_OF_DAY: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['draft', 'cancelled']);

/** Paris takviminde `days` gün ötesi (`YYYY-MM-DD`): sunucu UTC'de koşar, işletmenin günü ise Paris'tedir. */
const dayOffset = (base: Date, days: number): string => addDays(parisDateOf(base), days);

export async function readDashboard(db: Db, now = new Date()): Promise<DashboardData> {
  const orderSvc = new OrderService(db);
  const profileSvc = new UserProfileService(db);
  const settings = new SettingsService(db);

  // Bağlam önce okunur: sayaçların, listenin ve nabzın evrenini o belirler.
  const ctx = await readWarehouseContext();
  const warehouseIds = ctx.warehouseIds;

  const today = dayOffset(now, 0);
  const yesterday = dayOffset(now, -1);
  const seriesFrom = dayOffset(now, -(SERIES_DAYS - 1));

  // Rotalar eşiklerin EKSENİ olduğu için ilk dalgada okunuyor: hem nabzın satırları hem gün akışının
  // saatleri buradan türüyor. Pasif bölge de geliyor — bugüne siparişi varsa nabızda görünmeli.
  const allZones = await new DeliveryZoneService(db).listWithCodes();

  /** Depo bağlamı gün akışına da uygulanır, yoksa bir tesis seçiliyken akışta başka tesisin rota kesimi görünürdü; kapsam `null` ise süzgeç yok. */
  const zones = warehouseIds ? allZones.filter((z) => warehouseIds.includes(z.warehouseId)) : allZones;
  const zoneRefs: ZoneRef[] = zones.map((z) => ({ id: z.id, name: z.name }));

  // Haftanın günü Paris tarihinden; `getUTCDay()` pazarı 0 verir, veri modeli ISO 1-7 kullanır (`delivery_zone.weekdays`).
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const isoWeekday = weekday === 0 ? 7 : weekday;

  const [times, todayCounts, yesterdayCounts, openCounts, dayPage, revenueRows, termDays, labels, ticketCounts, proposalCount] =
    await Promise.all([
      readThresholds(settings, zoneRefs),
      orderSvc.counts({ deliveryFrom: today, deliveryTo: today, warehouseIds }),
      orderSvc.counts({ deliveryFrom: yesterday, deliveryTo: yesterday, warehouseIds }),
      // Tahsilat GÜNE bağlı değil: dün teslim edilmiş bir siparişin kapıda kalan borcu da bekleyen
      // tahsilattır. Bu yüzden tarih süzgeci YOK, ödeme durumu süzgeci var.
      orderSvc.counts({ paymentStatus: 'pending', warehouseIds }),
      orderSvc.listPage({ deliveryFrom: today, deliveryTo: today, warehouseIds }, { limit: DAY_ORDER_LIMIT }),
      new AnalyticsReportService(db).orderRevenue(seriesFrom, today),
      settings.getNumber(PAYMENT_TERM_KEY, PAYMENT_TERM_DEFAULT),
      readWarehouseLabels(),
      new TicketService(db).countByStatus(),
      new AssistantProposalService(db).countPending(),
    ]);

  const dayOrders = dayPage.rows.filter((o) => !OUT_OF_DAY.has(o.status));

  // Satır kurulumu siparişler ekranının kapısıyla AYNI (`toOrderRows`): kalem sayısı, kapıda kalan
  // tutar ve vade gecikmesi orada tek yerde hesaplanıyor — panel kendi ikinci hesabını yazsaydı iki
  // ekran aynı siparişe farklı şeyler derdi (`CLAUDE §1`).
  const rows = await toRows(db, profileSvc, { orders: dayOrders, termDays, labels, now });

  // Açık ödemeli siparişler AYRI okunur: gecikmiş vade bugünün siparişinde değil, geçmişte birikir.
  const openPage = await orderSvc.listPage({ paymentStatus: 'pending', warehouseIds }, { limit: OPEN_PAYMENT_LIMIT });
  const openRows = await toRows(db, profileSvc, {
    orders: openPage.rows.filter((o) => !OUT_OF_DAY.has(o.status)),
    termDays,
    labels,
    now,
  });
  const overdue = openRows.filter((r) => r.payment.overdue);

  // Durum kaydı TEK turda iki soruya cevap veriyor: kapıdan dönen sipariş (11.4) ve teslim edilmiş
  // durağın GERÇEK saati. İkisi de aynı satırlardan çıkıyor, iki okuma yapmanın karşılığı yok.
  const dayLog = await readDayLog(
    db,
    dayOrders.map((o) => o.id),
  );

  const nowMinutes = parisMinutesOf(now);
  const flow = buildRouteFlow(routeFlowFacts(dayOrders, { zones, labels, times, isoWeekday }), { nowMinutes });

  const queue = buildQueue(queueFacts({ overdue, openTickets: ticketCounts }));
  // Süresi dolan gel-al: eşik ayardan, sayı kapıdan (`countOverduePickups`) — kapsam personelin depolarıdır.
  const overduePickups = await countOverduePickups(db, {
    warehouseIds,
    waitDays: await settings.getNumber(PICKUP_WAIT_DAYS_KEY, PICKUP_WAIT_DAYS_DEFAULT),
    now,
  });

  return {
    now: {
      iso: now.toISOString(),
      label: now.toLocaleDateString('tr-TR', { timeZone: BUSINESS_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }),
      time: now.toLocaleTimeString('tr-TR', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' }),
    },
    scopeLabel: scopeLabelOf(ctx),
    band: buildBand({ flow, queue, overduePickups }),
    kpis: buildKpis({
      orders: {
        /* İptal hariç: kart başlığı, depo kırılımı ve 7 günlük çizgi aynı kümeden okunur, yoksa tek kart üç ayrı gerçek söylerdi. */
        today: todayCounts.active.count,
        yesterday: yesterdayCounts.active.count,
        split: splitOf(rows),
        series: seriesOf(revenueRows, seriesFrom, now, 'orderCount'),
      },
      revenue: {
        todayCents: todayCounts.active.totalCents,
        // Dünle karşılaştırma da AYNI tabandan — biri iptalli biri iptalsiz olsaydı yüzde uydurmaydı.
        deltaPercent: deltaPercentOf(todayCounts.active.totalCents, yesterdayCounts.active.totalCents),
        split: revenueSplitOf(rows),
        series: seriesOf(revenueRows, seriesFrom, now, 'revenueCents'),
      },
      receivable: {
        codCents: openCounts.cod.totalCents - openCounts.cod.collectedCents,
        termCents: Math.max(
          0,
          openCounts.sum.totalCents - openCounts.sum.collectedCents - (openCounts.cod.totalCents - openCounts.cod.collectedCents),
        ),
        overdueCount: overdue.length,
        overdueCents: overdue.reduce((sum, r) => sum + r.payment.openCents, 0),
        series: [],
      },
      undelivered: {
        today: dayLog.bounced.size,
        series: [],
        detail: dayLog.bounced.size > 0 ? 'kapıdan dönen sipariş yeniden planlanmalı' : 'kapıdan dönen yok',
      },
      // Marj-altı henüz hesaplanmıyor; `null` kartı çizdirmez, sıfır yazmak hiç sayılmamış kümeyi temiz gösterirdi.
      belowMargin: null,
    }),
    flow,
    queue,
    proposals: buildProposals(proposalCount, []),
    routes: routesOf(rows, dayLog.deliveredAt, await runLabelsOf(db, today)),
    // Araç yükü yalnız tek tesis seçiliyken yazılır: ağın bütün araçlarını tek satırda toplamak "ek olarak" cümlesini anlamsız kılar.
    vanLoad: ctx.activeWarehouseId ? await readVanLoadBand(db, ctx.activeWarehouseId) : null,
  };
}

/**
 * Panelin araç bandı; motoru `readFacilityVanSummary`, burası yalnız cümleyi kurar. Kutu da mal da yoksa bant `null` döner: "Araçta 0
 * kutu" her sabah tekrarlanan bir gürültüdür ve dolduğu günü fark ettirmez.
 */
async function readVanLoadBand(db: Db, facilityId: string): Promise<VanLoadBandView | null> {
  const summary = await readFacilityVanSummary(db, { facilityId, lineLimit: VAN_SAMPLE_LINES });
  const units = summary.vans.reduce((sum, van) => sum + van.unitCount, 0);
  if (summary.boxCount === 0 && units === 0) return null;

  // Tek araçta adıyla, çoklukta sayısıyla yazılır; araç kaydı bağlanmamış kutu varsa özne "Araçta"dır.
  const tekArac = summary.vans.length === 1 ? summary.vans[0] : null;
  const subject = tekArac ? tekArac.code : summary.vans.length > 1 ? `${summary.vans.length} araç` : 'Araçta';
  const variants = summary.vans.reduce((sum, van) => sum + van.variantCount, 0);
  const sample = summary.vans
    .flatMap((van) => van.lines)
    .slice(0, VAN_SAMPLE_LINES)
    .map((line) => `${line.name} ${line.qty}`)
    .join(' · ');

  return {
    subject,
    boxes:
      summary.boxCount > 0
        ? `${summary.boxCount} kutu · ${summary.orderCount} sipariş`
        : null,
    goods: units > 0 ? `${units} adet · ${variants} üründen` : null,
    sample: sample || null,
    // Köprü ARACIN stok bakışına gider; araç bilinmiyorsa tesisin kendi stoğuna (yanlış bir yere
    // götürmektense bilinen yere götürmek).
    href: stockLink(tekArac ? { depo: tekArac.code } : {}),
  };
}

/** Araç bandında adı geçen kalem sayısı: cümle bir satırda kalmalı, liste Stok'ta. */
const VAN_SAMPLE_LINES = 3;

/** Günün sefer künyeleri, kartların kimliği: rota adı + sefer kodu; kurye adı seferin kuryesidir. */
async function runLabelsOf(db: ReturnType<typeof serviceDb>, date: string): Promise<Map<string, string>> {
  const runs = await new DeliveryRunService(db).listByDate(date);
  if (runs.length === 0) return new Map();
  const zones = await new DeliveryZoneService(db).list();
  const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));
  return new Map(
    runs.map((run) => [run.id, `${zoneName.get(run.deliveryZoneId) ?? 'Rota'} · ${run.referenceNo}`]),
  );
}

type TimeKey = DayHourKey;

interface ZoneRef {
  id: string;
  name: string;
}

/**
 * Eşikler rota başına okunur, rotasız sipariş için genel satır da gerekir. Sorgu sayısı rota sayısıyla çarpmaz: `SettingsService` bir
 * anahtarın bütün kapsam satırlarını tek turda çekip önbelleğe koyar.
 */
async function readThresholds(
  settings: SettingsService,
  zones: readonly ZoneRef[],
): Promise<{ byZone: Map<string, Record<TimeKey, string>>; global: Record<TimeKey, string> }> {
  const keys = DAY_HOUR_KEYS;

  const read = async (zoneId: string | null): Promise<Record<TimeKey, string>> => {
    const values = await Promise.all(keys.map((key) => settings.get<string>(key, DAY_HOUR_FALLBACK[key], zoneId ? { zoneId } : {})));
    return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? DAY_HOUR_FALLBACK[key]])) as Record<TimeKey, string>;
  };

  const [global, perZone] = await Promise.all([read(null), Promise.all(zones.map((z) => read(z.id)))]);
  return { byZone: new Map(zones.map((z, i) => [z.id, perZone[i] ?? global])), global };
}

async function toRows(
  db: Db,
  profileSvc: UserProfileService,
  input: {
    orders: readonly Order[];
    termDays: number;
    labels: Awaited<ReturnType<typeof readWarehouseLabels>>;
    now: Date;
  },
): Promise<OrderRow[]> {
  if (input.orders.length === 0) return [];
  const orderIds = input.orders.map((o) => o.id);
  const customerIds = [...new Set(input.orders.map((o) => o.customerId))];
  const courierIds = [...new Set(input.orders.flatMap((o) => (o.courierId ? [o.courierId] : [])))];

  const [items, customers, couriers] = await Promise.all([
    new OrderItemService(db).listByOrders(orderIds),
    profileSvc.listByIds(customerIds),
    courierIds.length > 0 ? profileSvc.listByIds(courierIds) : Promise.resolve([]),
  ]);

  const itemsByOrder = new Map<string, Awaited<ReturnType<OrderItemService['listByOrders']>>>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId);
    if (list) list.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  return toOrderRows({
    orders: input.orders,
    itemsByOrder,
    customers: new Map(customers.map((c) => [c.id, c])),
    courierNames: new Map(couriers.map((c) => [c.id, c.name])),
    defaultTermDays: input.termDays,
    now: input.now,
    warehouseLabels: input.labels,
    // Panelin satırları GÜNÜN rota siparişleri ve açık ödemeler; hazır gel-al satırı buraya düşmez, süre okunmaz.
    pickupReadyAt: new Map(),
    pickupWaitDays: Number.POSITIVE_INFINITY,
  });
}

/**
 * Günün durum kaydından iki türetme: kapıdan dönen sipariş (`out_for_delivery → ready`, aynı sipariş bir kez sayılır) ve teslim anı
 * (`order` tablosunda teslim kolonu yok, an durum kaydından gelir).
 */
async function readDayLog(db: Db, orderIds: readonly string[]): Promise<{ bounced: Set<string>; deliveredAt: Map<string, string> }> {
  if (orderIds.length === 0) return { bounced: new Set(), deliveredAt: new Map() };
  const logs = await new OrderStatusLogService(db).listByOrders(orderIds);
  const bounced = new Set<string>();
  const deliveredAt = new Map<string, string>();
  for (const log of logs) {
    if (log.fromStatus === 'out_for_delivery' && log.toStatus === 'ready') bounced.add(log.orderId);
    // İlk teslim anı korunur: yeniden teslim edilen sipariş için ilk kayıt gerçeğin kendisidir.
    if (log.toStatus === 'delivered' && !deliveredAt.has(log.orderId)) deliveredAt.set(log.orderId, log.createdAt);
  }
  return { bounced, deliveredAt };
}

/** Satırın depo etiketi — ad çözülemediyse tire; yanlış depo söylemekten iyidir. */
function warehouseKeyOf(row: OrderRow): string {
  return row.warehouse?.code ?? row.warehouse?.name ?? '—';
}

/** Depo kırılımı: "STR 12 · COL 7". Tek depolu bakışta yazılmaz — kendini tekrarlar. */
function splitOf(rows: readonly OrderRow[]): string | null {
  const byWarehouse = new Map<string, number>();
  for (const row of rows) {
    const key = warehouseKeyOf(row);
    byWarehouse.set(key, (byWarehouse.get(key) ?? 0) + 1);
  }
  if (byWarehouse.size <= 1) return null;
  return [...byWarehouse.entries()].map(([code, n]) => `${code} ${num(n)}`).join(' · ');
}

/** Ciro kırılımı — aynı kural: tek depoda yazılmaz. */
function revenueSplitOf(rows: readonly OrderRow[]): string | null {
  const byWarehouse = new Map<string, number>();
  for (const row of rows) {
    const key = warehouseKeyOf(row);
    byWarehouse.set(key, (byWarehouse.get(key) ?? 0) + row.totalCents);
  }
  if (byWarehouse.size <= 1) return null;
  return [...byWarehouse.entries()].map(([code, cents]) => `${code} ${money(cents)}`).join(' · ');
}

/** Yüzde fark — taban sıfırsa `null`. Sıfırdan artışın yüzdesi yoktur, "sonsuz" da bir bilgi değil. */
function deltaPercentOf(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

/**
 * 7 günlük seri, gün başına kanalların toplamı; verisiz gün 0'dır, çünkü o gün sipariş girmemiştir. Okuma hiç dönmezse seri boş kalır:
 * sıfırlarla doldurmak ölçülmemişi "hiç satış yok" gibi okuturdu.
 */
function seriesOf(
  rows: Awaited<ReturnType<AnalyticsReportService['orderRevenue']>>,
  from: string,
  now: Date,
  field: 'orderCount' | 'revenueCents',
): number[] {
  if (rows.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row[field]);
  const out: number[] = [];
  const todayKey = dayOffset(now, 0);
  for (let i = 0; i < SERIES_DAYS; i += 1) {
    const day = dayOffset(new Date(from), i);
    if (day > todayKey) break;
    out.push(byDay.get(day) ?? 0);
  }
  return out;
}

/** Kısa gün adları — rota `weekdays` alanı ISO 1-7 taşıyor (1 = pazartesi). */
const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'] as const;

/**
 * Gün akışında satır rotadır, sipariş değil: boş rotanın da çıkış saati vardır ve operatör onu bilmeli; bugün koşmayan rota sönük çizilir.
 * Rotasız sipariş sayaca girmez, çünkü kargo siparişinin hazırlık kesimi yoktur ve bir rotayı olduğundan yüklü gösterirdi.
 */
function routeFlowFacts(
  orders: readonly Order[],
  input: {
    zones: Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>;
    labels: Awaited<ReturnType<typeof readWarehouseLabels>>;
    times: { byZone: Map<string, Record<TimeKey, string>>; global: Record<TimeKey, string> };
    isoWeekday: number;
  },
): RouteFlowFact[] {
  const byZone = new Map<string, { ready: number; total: number }>();
  for (const order of orders) {
    if (!order.deliveryZoneId) continue;
    const entry = byZone.get(order.deliveryZoneId) ?? { ready: 0, total: 0 };
    entry.total += 1;
    if (PREPARED.has(order.status)) entry.ready += 1;
    byZone.set(order.deliveryZoneId, entry);
  }

  return input.zones.map((zone) => {
    const counted = byZone.get(zone.id) ?? { ready: 0, total: 0 };
    const runsToday = zone.isActive && zone.weekdays.includes(input.isoWeekday);
    // Rotanın kendi ayarı yoksa global satır: eşik bir KAPSAM zinciridir (`SettingsService`), rota
    // yazmadıysa üst kademe geçerlidir. Uydurma saat yok, devralınan saat var.
    const t = input.times.byZone.get(zone.id) ?? input.times.global;
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      warehouseCode: input.labels.get(zone.warehouseId)?.code ?? null,
      runsToday,
      weekdayLabel: runsToday
        ? null
        : [...zone.weekdays]
            .sort((a, b) => a - b)
            .map((d) => WEEKDAY_SHORT[d - 1] ?? '?')
            .join(' · ') || 'gün tanımlı değil',
      times: {
        orderCutoff: t.order_cutoff_time,
        prepCutoff: t.prep_cutoff_time,
        routeDeparture: t.route_departure_time,
        courierClose: t.courier_close_time,
      },
      readyCount: counted.ready,
      totalCount: counted.total,
    };
  });
}

/**
 * Rota kartları sefer başına gruplanır: başlık rota adı + sefer kodu, kurye adı seferin kuryesi. Sefere bağlanmamış duraklar da "Sefer
 * açılmadı" kartında görünür, gizlenirse rotanın hâlâ beklediği fark edilmez.
 */
function routesOf(
  rows: readonly OrderRow[],
  deliveredAt: Map<string, string>,
  runLabels: ReadonlyMap<string, string>,
): DeliveryRouteView[] {
  const routeRows = rows.filter((r) => r.deliveryType === 'route');
  const groups = new Map<string, OrderRow[]>();
  for (const row of routeRows) {
    const key = row.deliveryRunId ?? 'no-run';
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()].map(([key, group]) =>
    toRoute({
      key,
      courierName: group[0]?.courierName ?? 'Kurye bekleniyor',
      zoneLabel: key === 'no-run' ? 'Sefer açılmadı' : (runLabels.get(key) ?? null),
      warehouseCode: group[0]?.warehouse?.code ?? null,
      stops: toStops(group.map((row) => toStopFact(row, deliveredAt.get(row.id) ?? null))),
    }),
  );
}

function toStopFact(row: OrderRow, deliveredAt: string | null): StopFact {
  return {
    orderId: row.id,
    reference: row.referenceNo,
    customerName: row.customerName,
    itemCount: row.itemCount,
    channel: row.channel === 'b2b' ? 'b2b' : 'b2c',
    // Kapıda kalan borç: vadeli siparişte kapıda ödeme yoktur, orada tutar KONUŞULMAZ.
    dueCents: row.payment.onAccount ? null : row.payment.openCents,
    status: row.status,
    paymentMethod: row.payment.method,
    deliveredAt,
  };
}

/** Kuyruk olguları: gecikmiş vade ve açık talep; öneriler ayrı blokta. */
function queueFacts(input: { overdue: readonly OrderRow[]; openTickets: Record<TicketStatus, number> }): QueueFact[] {
  const facts: QueueFact[] = [];

  if (input.overdue.length > 0) {
    const worst = input.overdue.reduce((a, b) => ((a.payment.dueDate ?? '9999-12-31') < (b.payment.dueDate ?? '9999-12-31') ? a : b));
    const total = input.overdue.reduce((sum, r) => sum + r.payment.openCents, 0);
    facts.push({
      key: 'overdue-payment',
      group: 'now',
      count: input.overdue.length,
      title: 'Gecikmiş vadeli sipariş',
      stamp: worst.payment.dueDate ? `en eski vade ${worst.payment.dueDate}` : null,
      detail: `${worst.customerName} · ${money(total)} açık bakiye`,
      tone: 'red',
      link: { label: 'Para →', href: '/operations/finance' },
    });
  }

  const open = input.openTickets.open + input.openTickets.in_progress;
  if (open > 0) {
    facts.push({
      key: 'open-tickets',
      group: 'today',
      count: open,
      title: 'Açık talep',
      stamp: null,
      detail: 'Cevap bekleyen müşteri talebi/şikâyeti',
      tone: 'amber',
      link: { label: 'Talepler →', href: '/operations/tickets' },
    });
  }

  return facts;
}

/** Bağlam adı: tek tesis seçiliyse onun adı, değilse "Tüm depolar". */
function scopeLabelOf(ctx: Awaited<ReturnType<typeof readWarehouseContext>>): string {
  if (!ctx.activeWarehouseId) return 'Tüm depolar';
  // `facilities` yeter: seçilebilen bağlam zaten tesistir (`context.ts` — çerez tesise karşı doğrulanır).
  const active = ctx.facilities.find((w) => w.id === ctx.activeWarehouseId);
  return active ? active.name : 'Tüm depolar';
}
