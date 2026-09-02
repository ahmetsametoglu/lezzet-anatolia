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
import { readFacilityVanSummary } from '@lezzet/application';
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
const PREPARED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['ready', 'out_for_delivery', 'delivered', 'completed']);

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
  const allZones = await new DeliveryZoneService(db).listWithCodes();

  /**
   * **Depo bağlamı gün akışına da uygulanır** (kullanıcı isteği 18.08: *"o depoyu seçince o depo ile
   * alakalı bilgileri panele yerleştirebilirsin"*).
   *
   * Ölçülmüş arızaydı: seçici siparişleri süzüyordu (`warehouseIds` her sorguya gidiyor) ama eşik
   * saatleri HER deponun HER rotasından hesaplanıyordu — Strasbourg seçiliyken akışta Colmar'ın
   * kesimi görünebiliyordu. Eksikliği "en erken saat" toplaması gizliyordu: tek sayı gösterildiği
   * için hangi rotadan geldiği okunamıyordu.
   *
   * Kapsam `null` ise (tüm depolar) süzgeç uygulanmaz — bugünkü davranış aynen korunur.
   */
  const zones = warehouseIds ? allZones.filter((z) => warehouseIds.includes(z.warehouseId)) : allZones;
  const zoneRefs: ZoneRef[] = zones.map((z) => ({ id: z.id, name: z.name }));

  // `getDay()` pazarı 0 verir, veri modeli ISO 1-7 kullanıyor (`delivery_zone.weekdays`).
  const isoWeekday = now.getDay() === 0 ? 7 : now.getDay();

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

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const flow = buildRouteFlow(routeFlowFacts(dayOrders, { zones, labels, times, isoWeekday }), { nowMinutes });

  const queue = buildQueue(queueFacts({ overdue, openTickets: ticketCounts }));

  return {
    now: {
      iso: now.toISOString(),
      label: now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }),
      time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    },
    scopeLabel: scopeLabelOf(ctx),
    band: buildBand({ flow, queue }),
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
      // **Marj-altı bu turda ÖLÇÜLMEDİ** (09.3 ikinci dilim) — `null` geçiyor ve kart hiç çizilmiyor.
      // Sıfır yazmak, hiç sayılmamış bir kümeyi "temiz" göstermek olurdu (`CLAUDE §1`).
      belowMargin: null,
    }),
    flow,
    queue,
    proposals: buildProposals(proposalCount, []),
    routes: routesOf(rows, dayLog.deliveredAt, await runLabelsOf(db, today)),
    /*
      Araç yükü YALNIZ TEK TESİS SEÇİLİYKEN (kullanıcı isteği 02.09: *"seçili deponun panel
      ekranında"*). "Tüm depolar" bakışında bu blok yazılmaz ve bu bir eksiklik değil bir karar:
      ağın bütün araçlarını tek satırda toplamak, "ek olarak" cümlesini anlamsız kılardı — neyin
      ekine? Panelin geri kalanı da bağlamı izliyor (18.08 kararı).
    */
    vanLoad: ctx.activeWarehouseId ? await readVanLoadBand(db, ctx.activeWarehouseId) : null,
  };
}

/**
 * Panelin araç şeridi — motoru `@lezzet/application` (`readFacilityVanSummary`), burası yalnız
 * cümleyi kuruyor.
 *
 * **Sıfır cümlesi KURULMAZ.** Kutu yoksa kutu yarısı, mal yoksa mal yarısı `null` döner; ikisi de
 * boşsa şeridin kendisi `null` olur ve panelde hiç çizilmez. "Araçta 0 kutu · 0 adet" bir bilgi
 * değil, her sabah tekrarlanan bir gürültüdür — ve gürültü, dolduğu gün fark edilmesini zorlaştırır.
 */
async function readVanLoadBand(db: Db, facilityId: string): Promise<VanLoadBandView | null> {
  const summary = await readFacilityVanSummary(db, { facilityId, lineLimit: VAN_SAMPLE_LINES });
  const units = summary.vans.reduce((sum, van) => sum + van.unitCount, 0);
  if (summary.boxCount === 0 && units === 0) return null;

  // Tek araçta adıyla, çoklukta sayısıyla: "VAN-1" bir yerdir, "2 araç" bir kümedir. Araç hiç
  // yokken de buraya gelinebilir (kutu var, araç kaydı bağlanmamış) — özne o hâlde "Araçta".
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

/** Şeritte adı geçen kalem sayısı — cümle bir satırda kalmalı, liste Stok'ta yaşıyor. */
const VAN_SAMPLE_LINES = 3;

/**
 * Günün sefer künyeleri — panel kartlarının kimliği (18.08). Kart artık kurye grubunun değil
 * SEFERİN kartı: rota adı + SF kodu okunur, kurye adı seferin kuryesidir (satırlardan geliyor —
 * `courier_id` start'ta senkronlandığı için ikisi ayrışamaz).
 */
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

/** Kısa gün adları — rota `weekdays` alanı ISO 1-7 taşıyor (1 = pazartesi). */
const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'] as const;

/**
 * Gün akışı olguları — **satır = ROTA** (kullanıcı kararı 18.08).
 *
 * Satırlar ROTADAN gelir, siparişten değil: eski nabız siparişleri bölgeye göre grupluyordu ve
 * siparişi olmayan rota hiç görünmüyordu — oysa boş bir rotanın da çıkış saati vardır ve operatör
 * onu bilmek zorundadır. Sipariş sayaçları rotanın üstüne yazılır, rotayı DOĞURMAZ.
 *
 * **Bugün koşmayan rota da gelir** ve `runsToday: false` taşır: ekran onu sönük çizer. Gizlemek
 * yerine sönük göstermek kullanıcı kararı — hangi rotaların var olduğu da bir bilgi.
 *
 * **Rotasız sipariş sayaca girmez** — kargo siparişinin hazırlık kesimi yoktur ve onu bir rotanın
 * satırına yazmak, o rotayı olduğundan yüklü göstermek olurdu. Göstergeler onları yine sayıyor.
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
 * Rota kartları — SEFER başına gruplanır (18.08; kurye grubunun halefi). Panelin "rota" dediği şey
 * eskiden kurye grubuydu ve `zoneLabel: null` geçiyordu — kartın kimliği yoktu. Sefer varlığı tam o
 * boşluğu dolduruyor: kart başlığı rota adı + SF kodu, kurye adı seferin kuryesi.
 *
 * **Sefere bağlanmamış duraklar da gösterilir** ("Sefer açılmadı" kartı): gizlenirse "8 durak"
 * eksik okunur ve rotanın hâlâ beklediği fark edilmez.
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

/** Kuyruk olguları — bu turda ikisi: gecikmiş vade · açık talep (öneriler ayrı blokta). */
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
