import {
  AnalyticsReportService,
  AssistantProposalService,
  DeliveryZoneService,
  OrderItemService,
  OrderService,
  OrderStatusLogService,
  SettingsService,
  TicketService,
  UserProfileService,
  type serviceDb,
} from '@lezzet/database';
import type { Order, OrderStatus, TicketStatus } from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { DAY_HOUR_FALLBACK, DAY_HOUR_KEYS, type DayHourKey } from '@/lib/settings/day-hours';
import { money, num } from '@/components/operation/ui/format';
import { toOrderRows } from './orders/orders-read';
import type { OrderRow } from './orders/orders-types';
import {
  buildBand,
  buildFlow,
  buildKpis,
  buildProposals,
  buildPulse,
  buildQueue,
  toRoute,
  toStops,
  type PulseFact,
  type QueueFact,
  type StopFact,
  type ThresholdFact,
} from './dashboard-read';
import type { DashboardData, DeliveryRouteView } from './dashboard-types';

type Db = ReturnType<typeof serviceDb>;

// Panel (09.3) — SUNUCU okuması. Dönüştürücüler `dashboard-read`te (saf, istemciye girer); DB'ye
// dokunan her şey burada kalır (`warehouses/page.tsx` künyesindeki ölçülmüş kural).
//
// ── SORGU SAYISI SATIRLA ÇARPMAZ ─────────────────────────────────────────────
// Bugünün siparişleri TEK sayfada okunur (`DAY_ORDER_LIMIT`) ve o küme dört bölümü birden besler:
// duraklar · depo nabzı · akışın hazırlık notu · teslim edilemeyen sayacı. Aynı satırları dört kez
// sormak yerine bir kez okuyup dört soru soruyoruz — panel gün içinde sık sık açılıyor (`§7`).
//
// ── EŞİK SAATLERİ AYARDAN ────────────────────────────────────────────────────
// Dört eşik `settings`ten okunur. Ayar yoksa **makul varsayılan** devreye girer (`CLAUDE §4`):
// panelin `db:refresh` beklemeden çalışması için.
//
// **Varsayılanlar ARTIK BURADA DEĞİL** (`lib/settings/day-hours`): aynı dört saati Ayarlar sözlüğü
// (fabrika değeri) ve rota kurulumu (rota başına düzenleme) da okuyor. Değerler burada da yazılıydı
// ve ayrışsalardı panel bir saati, sistem başkasını uygulardı — hiçbir hata vermeden (`CLAUDE §1`).
//
// Okuma yolu (`readThresholds`) burada KALIYOR ve bu bilinçli: `readDayHours` bir saatin NEREDEN
// geldiğini de söylüyor (rotaya mı yazılı, genel mi) — o ayrım rota ekranının sorusu, panelin değil.
// Panel yalnız yürürlükteki değeri istiyor ve `get()` üzerinden okuduğu için 30 sn'lik ayar
// önbelleğinden yararlanıyor; panel gün içinde sık açılıyor (`§7`).

/** Günün siparişi bir tesiste yüzlerle ölçülmez; tavan kaçak bir güvence, ekranın sözü değil. */
const DAY_ORDER_LIMIT = 300;
/** Gecikmiş vade taraması — açık ödemeli siparişler; kuyruk sayısı için fazlasıyla yeter. */
const OPEN_PAYMENT_LIMIT = 200;
/** Sparkline penceresi: bugün dahil yedi gün. */
const SERIES_DAYS = 7;

const PAYMENT_TERM_KEY = 'payment_term_days';
const PAYMENT_TERM_DEFAULT = 30;

/** Hazırlanmış sayılan durumlar — `ready` ve sonrası. `confirmed`/`preparing` henüz raftadır. */
const PREPARED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
]);

/** Gün listesinden düşenler: iptal ve taslak bir iş değildir, sayılırsa gün olduğundan yoğun görünür. */
const OUT_OF_DAY: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['draft', 'cancelled']);

function dayOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function readDashboard(db: Db, now = new Date()): Promise<DashboardData> {
  const orderSvc = new OrderService(db);
  const profileSvc = new UserProfileService(db);
  const settings = new SettingsService(db);

  // Bağlam ÖNCE: sayaçların, listenin ve nabzın evrenini o belirliyor (19.14).
  const ctx = await readWarehouseContext();
  const warehouseIds = ctx.warehouseIds;

  const today = dayOffset(now, 0);
  const yesterday = dayOffset(now, -1);
  const seriesFrom = dayOffset(now, -(SERIES_DAYS - 1));

  // Rotalar eşiklerin EKSENİ olduğu için ilk dalgada okunuyor: hem nabzın satırları hem gün akışının
  // saatleri buradan türüyor. Pasif bölge de geliyor — bugüne siparişi varsa nabızda görünmeli.
  const zones = await new DeliveryZoneService(db).listWithCodes();
  const zoneRefs: ZoneRef[] = zones.map((z) => ({ id: z.id, name: z.name }));

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
  const dayLog = await readDayLog(db, dayOrders.map((o) => o.id));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const pulse = buildPulse(pulseFacts(dayOrders, { zones, labels, times }), { nowMinutes });
  const readyCount = dayOrders.filter((o) => PREPARED.has(o.status)).length;

  // Akışın saatleri: her eşik için EN ERKEN rota saati. Rota hiç yoksa global satır (`times.global`).
  const earliest = (key: TimeKey): ThresholdFact => earliestOf(key, zoneRefs, times.byZone, times.global[key]);

  const flow = buildFlow({
    nowMinutes,
    times: {
      orderCutoff: earliest('order_cutoff_time'),
      prepCutoff: earliest('prep_cutoff_time'),
      routeDeparture: earliest('route_departure_time'),
      courierClose: earliest('courier_close_time'),
    },
    orderCount: dayOrders.length,
    warehouseCount: new Set(dayOrders.map((o) => o.warehouseId)).size,
    readyCount,
    totalCount: dayOrders.length,
    stopCount: rows.filter((r) => r.deliveryType === 'route').length,
    courierNames: [...new Set(rows.flatMap((r) => (r.courierName ? [r.courierName] : [])))],
    expectedCashCents: todayCounts.cod.totalCents - todayCounts.cod.collectedCents,
    atRisk: pulse.some((p) => p.tone === 'amber' || p.tone === 'red'),
  });

  const queue = buildQueue(queueFacts({ overdue, openTickets: ticketCounts }));

  return {
    now: {
      iso: now.toISOString(),
      label: now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
      time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
    scopeLabel: scopeLabelOf(ctx),
    band: buildBand({ flow, queue, pulse }),
    kpis: buildKpis({
      orders: {
        today: todayCounts.total,
        yesterday: yesterdayCounts.total,
        split: splitOf(rows),
        series: seriesOf(revenueRows, seriesFrom, now, 'orderCount'),
      },
      revenue: {
        todayCents: todayCounts.sum.totalCents,
        deltaPercent: deltaPercentOf(todayCounts.sum.totalCents, yesterdayCounts.sum.totalCents),
        split: revenueSplitOf(rows),
        series: seriesOf(revenueRows, seriesFrom, now, 'revenueCents'),
      },
      receivable: {
        codCents: openCounts.cod.totalCents - openCounts.cod.collectedCents,
        termCents: Math.max(
          0,
          openCounts.sum.totalCents -
            openCounts.sum.collectedCents -
            (openCounts.cod.totalCents - openCounts.cod.collectedCents),
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
      // **Marj-altı bu turda ÖLÇÜLMEDİ** (09.3 ikinci dilim) — `null` geçiyor ve kart hiç çizilmiyor.
      // Sıfır yazmak, hiç sayılmamış bir kümeyi "temiz" göstermek olurdu (`CLAUDE §1`).
      belowMargin: null,
    }),
    flow,
    queue,
    proposals: buildProposals(proposalCount, []),
    routes: routesOf(rows, dayLog.deliveredAt),
    pulse,
  };
}

type TimeKey = DayHourKey;

interface ZoneRef {
  id: string;
  name: string;
}

/**
 * Eşikler **rota başına** okunur (kullanıcı kararı 17.08: depo ekseni kaldırıldı, her rota kendi
 * saatini taşır).
 *
 * **Sorgu sayısı rota sayısıyla ÇARPMAZ:** `SettingsService` bir anahtarın TÜM kapsam satırlarını tek
 * turda çekip statik önbelleğe koyuyor (`rowsFor`), yani N rota × 4 anahtar için 4 sorgu atılır.
 * Ölçülmeden yazılsaydı buradaki döngü bir N+1 tuzağı olurdu.
 *
 * Rotasız okuma da gerekiyor (`global`): kargo siparişi ya da hiç rota tanımlı olmadığı hâl.
 */
async function readThresholds(
  settings: SettingsService,
  zones: readonly ZoneRef[],
): Promise<{ byZone: Map<string, Record<TimeKey, string>>; global: Record<TimeKey, string> }> {
  const keys = DAY_HOUR_KEYS;

  const read = async (zoneId: string | null): Promise<Record<TimeKey, string>> => {
    const values = await Promise.all(
      keys.map((key) => settings.get<string>(key, DAY_HOUR_FALLBACK[key], zoneId ? { zoneId } : {})),
    );
    return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? DAY_HOUR_FALLBACK[key]])) as Record<
      TimeKey,
      string
    >;
  };

  const [global, perZone] = await Promise.all([read(null), Promise.all(zones.map((z) => read(z.id)))]);
  return { byZone: new Map(zones.map((z, i) => [z.id, perZone[i] ?? global])), global };
}

/**
 * Bir eşiğin **en sıkı** hâli: en erken saat + onu taşıyan rota.
 *
 * Gün akışı tek şerit kalsın diye her eşik türü için en erken saat gösterilir — ona yetişen ötekilere
 * de yetişir. Tüm rotalar aynı saatteyse rota adı yazılmaz: tekrar, bilgi değil gürültü olur.
 */
function earliestOf(key: TimeKey, zones: readonly ZoneRef[], byZone: Map<string, Record<TimeKey, string>>, fallback: string): ThresholdFact {
  const rows = zones.flatMap((z) => {
    const time = byZone.get(z.id)?.[key];
    return time ? [{ time, name: z.name }] : [];
  });
  if (rows.length === 0) return { time: fallback, routeLabel: null };

  const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
  const first = sorted[0]!;
  const allSame = sorted.every((r) => r.time === first.time);
  return { time: first.time, routeLabel: allSame ? null : first.name };
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
  });
}

/**
 * Günün durum kaydı — iki türetme, tek okuma.
 *
 * **`bounced`:** kapıya gidilip dönen sipariş = `out_for_delivery → ready` geçişi (11.4). Aynı sipariş
 * iki kez dönmüşse BİR kez sayılır: soru "kaç sipariş yeniden planlanmalı", "kaç kez denendi" değil.
 *
 * **`deliveredAt`:** teslim anı. Panelde saat YALNIZ olmuş durakta görünür ve bu onun tek kaynağıdır
 * (`order` tablosunda `delivered_at` kolonu yok, tarih durum kaydından türetilir — `0012:218`).
 */
async function readDayLog(
  db: Db,
  orderIds: readonly string[],
): Promise<{ bounced: Set<string>; deliveredAt: Map<string, string> }> {
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
 * 7 günlük seri — gün başına toplam (kanallar toplanır: `analytics_order_revenue` kanal kırılımlı
 * döner). Veri olmayan gün **0**dır ve bu doğru: o gün sipariş girmemiş. Okuma HİÇ dönmezse seri boş
 * kalır ve çubuklar çizilmez — sıfırlarla doldurmak, ölçülmemişi "hiç satış yok" gibi okutur.
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

/**
 * Nabız olguları — **ROTA başına** (kullanıcı kararı 17.08). Gün listesinden türer, ayrı sorgu yok:
 * sipariş `deliveryZoneId` taşıyor, yani rota bağı bedava.
 *
 * **Rotasız sipariş nabza girmez** — kargo siparişinin hazırlık kesimi yoktur ve onu bir rotanın
 * satırına yazmak, o rotayı olduğundan yüklü göstermek olurdu. Gün akışının sayaçları onları yine
 * sayıyor (`dayOrders`), yani sipariş kaybolmuyor.
 */
function pulseFacts(
  orders: readonly Order[],
  input: {
    zones: Awaited<ReturnType<DeliveryZoneService['listWithCodes']>>;
    labels: Awaited<ReturnType<typeof readWarehouseLabels>>;
    times: { byZone: Map<string, Record<TimeKey, string>>; global: Record<TimeKey, string> };
  },
): PulseFact[] {
  const byZone = new Map<string, { ready: number; total: number }>();
  for (const order of orders) {
    if (!order.deliveryZoneId) continue;
    const entry = byZone.get(order.deliveryZoneId) ?? { ready: 0, total: 0 };
    entry.total += 1;
    if (PREPARED.has(order.status)) entry.ready += 1;
    byZone.set(order.deliveryZoneId, entry);
  }

  return [...byZone.entries()].map(([zoneId, { ready, total }]) => {
    const zone = input.zones.find((z) => z.id === zoneId);
    return {
      zoneId,
      zoneName: zone?.name ?? 'Rota',
      warehouseCode: zone ? (input.labels.get(zone.warehouseId)?.code ?? null) : null,
      readyCount: ready,
      totalCount: total,
      prepCutoff: input.times.byZone.get(zoneId)?.prep_cutoff_time ?? input.times.global.prep_cutoff_time,
    };
  });
}

/**
 * Rota kartları — kurye başına gruplanır. **Kuryesi atanmamış duraklar da gösterilir:** gizlenirse
 * "8 durak" eksik okunur ve atamanın unutulduğu fark edilmez.
 */
function routesOf(rows: readonly OrderRow[], deliveredAt: Map<string, string>): DeliveryRouteView[] {
  const routeRows = rows.filter((r) => r.deliveryType === 'route');
  const groups = new Map<string, OrderRow[]>();
  for (const row of routeRows) {
    const key = row.courierId ?? 'unassigned';
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()].map(([key, group]) =>
    toRoute({
      key,
      courierName: group[0]?.courierName ?? 'Kurye atanmadı',
      zoneLabel: null,
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

/** Kuyruk olguları — bu turda ikisi: gecikmiş vade · açık talep (öneriler ayrı blokta). */
function queueFacts(input: { overdue: readonly OrderRow[]; openTickets: Record<TicketStatus, number> }): QueueFact[] {
  const facts: QueueFact[] = [];

  if (input.overdue.length > 0) {
    const worst = input.overdue.reduce((a, b) =>
      (a.payment.dueDate ?? '9999-12-31') < (b.payment.dueDate ?? '9999-12-31') ? a : b,
    );
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
  const active = ctx.warehouses.find((w) => w.id === ctx.activeWarehouseId);
  return active ? active.name : 'Tüm depolar';
}
