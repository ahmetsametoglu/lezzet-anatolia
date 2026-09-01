import {
  DeliveryRunCloseService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderBoxService,
  OrderService,
  UserProfileService,
  VehicleService,
  WarehouseService,
} from '@lezzet/database';
import { canAccessWarehouse, type WarehouseScope } from '@lezzet/domain-core';
import type { DeliveryRun, DeliveryZone } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
// Araç adının kuralı ("ad varsa ad, yoksa plaka") günün seferiyle ORTAK — künyesi kendi dosyasında.
import { vehicleLabelsOf } from './vehicle-label';

/**
 * Kuryenin ROTA SEÇİMİ (K1 · 18.08, `docs/feature/sefer.md`) — **uygulama katmanı orkestrasyonu**.
 *
 * Hedef akış kullanıcının cümlesi: *"arayüzden kurye ataması saçma — kurye giriş yapar, ROTAYI
 * seçer, aracını doldurur, o rotayı sürer."* Bu kapı seçim ekranının verisini kurar: o gün koşan
 * aktif rotalar, yükleri ve varsa açık seferin künyesi. KURYEYE süzülmez — seçilecek rotanın
 * durakları henüz kimsenin değil; sahiplik seferi başlatanın claim'iyle doğar.
 *
 * ── İKİ EKSEN, İKİ AYRI KARAR (11.7 · kullanıcı kuralı 21.08) ────────────────
 * Kurye eksenİ süzmez (üstteki karar), DEPO ekseni süzer: *"kurye hangi depoya aitse o depoya ait
 * rotaları görebilmeli ve alabilmeli."* Rota bölgeden, bölge depodan doğar; başka deponun rotası
 * bu listede hiç görünmez — görünseydi Strasbourg'un kuryesi Kehl'in seferini başlatır, malı başka
 * şehirde duran duraklar onun üstüne yazılırdı (`CLAUDE §1`: süzgeci unutulan okuma çok depoluda
 * sessizce başka şehrin işini gösterir). `scope` bu yüzden ZORUNLU; depo-üstü bakış isteyen çağıran
 * bunu `{ kind: 'all' }` ile AÇIKÇA söyler (Sevkiyat masası öyle yapıyor).
 *
 * Rota kümesi doğal tavanlı (operatör elle kurar) → tek turda çekilir, sayfalama yok (CLAUDE §1).
 */

/** Seçim ekranındaki bir rota satırı — sözleşmedeki `CourierRouteSchema`nın aynası. */
export interface CourierRouteView {
  /** Rotanın günü (`YYYY-MM-DD`) — liste birden çok gün taşıyor (31.08). */
  day: string;
  zoneId: string;
  zoneName: string;
  warehouseId: string;
  warehouseName: string | null;
  /** O güne yazılmış rota siparişi — kurye seçerken yükü görsün. */
  stopCount: number;
  /** Rotanın kutu sayısı (v3:17) — durak sayısı hacmi söylemez, üç durak on bir kutu olabilir. */
  boxCount: number;
  /** Kapıda tahsilat bekleyen durak sayısı (v3:17) — günün nakit yükü. */
  collectionCount: number;
  run: {
    runId: string;
    referenceNo: string;
    zoneId: string;
    zoneName: string | null;
    vehicleId: string | null;
    /** Aracın ekranda okunan adı ("Küçük kamyonet") ya da plakası — sefer şeridinin künyesi. */
    vehicleLabel: string | null;
    /** Seferin günü — künyenin ortak alanı (31.08). */
    deliveryDate: string;
    departedAt: string | null;
    returnedAt: string | null;
    closed: boolean;
    courierId: string;
    courierName: string | null;
  } | null;
}

/** Gün kaydırma — pencere hesabının tek yeri; tarih aritmetiği iki yerde yazılırsa biri kayar. */
function addDays(date: string, offset: number): string {
  const base = new Date(`${date}T12:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

/** `getDay()`: 0=Pazar → ISO'da 7 (motorun `upcomingDeliveryDates` hesabıyla birebir). */
function isoWeekdayOf(date: string): number {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

/**
 * O gün koşan rotalar + sefer durumları. "Koşan" = aktif VE `weekdays` o günü içeriyor — süzgeç
 * TS'te, çünkü rota kümesi tek turda zaten elde (dizi-içerir süzgecini DB'ye taşımak, doğal
 * tavanlı bir küme için ikinci bir sorgu dili öğrenmek olurdu).
 */
export async function listCourierRoutes(
  db: SupabaseClient,
  input: { date: string; scope: WarehouseScope; days?: number },
): Promise<CourierRouteView[]> {
  /*
    ── LİSTE BİRDEN ÇOK GÜN TAŞIR (31.08) ────────────────────────────────────────────────────
    Kullanıcının senaryosu: *"araç iki-üç günlük yolculuğa çıkıyor ve rotalar tek günlük olduğu
    için yarının seferleri de bugünden yükleniyor."* Seçim ekranı (v3:17) rotaları güne göre
    grupluyor — tek günlük bir liste o ekranı hiç kuramazdı.

    Pencere VARSAYILAN OLARAK ÜÇ GÜN ve bu tasarımın kendi cümlesi: *"bugünün, yarının, sonraki
    günün"*. Sınırsız değil, çünkü bu bir katalog değil bir SEÇİM: kurye bugün yükleyeceği malı
    seçiyor, gelecek haftanın rotalarını değil.

    Günler AYRI turlarda okunuyor (`Promise.all`) ve bu bilinçli: her günün kendi sefer kayıtları,
    kendi durak sayacı ve kendi kapanışları var. Tek sorguya indirmek üç ayrı gerçeği tek haritada
    toplamak olurdu ve "hangi günün seferi" sorusu ancak satırdan geri türetilebilirdi.
  */
  const window = Math.max(1, input.days ?? 3);
  if (window > 1) {
    const dates = Array.from({ length: window }, (_, offset) => addDays(input.date, offset));
    const perDay = await Promise.all(dates.map((date) => listCourierRoutes(db, { date, scope: input.scope, days: 1 })));
    return perDay.flat();
  }

  const weekday = isoWeekdayOf(input.date);
  const [zones, runs, orders, warehouses] = await Promise.all([
    new DeliveryZoneService(db).list({ activeOnly: true }),
    new DeliveryRunService(db).listByDate(input.date),
    new OrderService(db).listRouteOrdersByDate(input.date),
    new WarehouseService(db).list(),
  ]);

  // Kapsam süzgeci gün süzgecinden ÖNCE değil, onunla birlikte: boş kapsam (`none`) boş liste
  // demektir — atanmamış kurye "her şeyi görür"e değil "hiçbir şey görmez"e düşer (fail-closed,
  // `warehouseScope` motorunun kendi kuralı).
  const today = zones.filter((zone) => zone.weekdays.includes(weekday) && canAccessWarehouse(input.scope, zone.warehouseId));
  if (today.length === 0) return [];

  const runByZone = new Map(runs.map((run) => [run.deliveryZoneId, run]));
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));

  /*
    YÜK SAYACI ÜÇ SAYI (v3:17 `"5 durak · 7 kutu · 2 tahsilat"`) — hepsi zone'a göre gruplanır ve
    hepsi TEK geçişte kurulur (N+1 yok). Durak sayısı tek başına yükü söylemiyordu: üç duraklık bir
    rota on bir kutu taşıyabiliyor ve kurye aracı doldurmadan önce hem hacmi hem nakit yükünü
    bilmek zorunda.

    Kutular AYRI bir sorgu (`listByOrders`) — sipariş satırında kutu sayısı yok ve olmamalı: kutu
    hazırlıkta doğar, sipariş yazılırken değil.
  */
  const stopCount = new Map<string, number>();
  const collectionCount = new Map<string, number>();
  const zoneOfOrder = new Map<string, string>();
  for (const order of orders) {
    if (!order.deliveryZoneId) continue;
    zoneOfOrder.set(order.id, order.deliveryZoneId);
    stopCount.set(order.deliveryZoneId, (stopCount.get(order.deliveryZoneId) ?? 0) + 1);
    /* Borcun kuralı motorun kendi kuralı: toplam − (tahsil − iade) > 0. Ödenmiş sipariş
       sayılmaz — kuryenin kapıda yapacağı iş yok. */
    if (order.orderedTotalCents - (order.amountCollectedCents - order.amountRefundedCents) > 0) {
      collectionCount.set(order.deliveryZoneId, (collectionCount.get(order.deliveryZoneId) ?? 0) + 1);
    }
  }
  const boxCount = new Map<string, number>();
  if (zoneOfOrder.size > 0) {
    for (const box of await new OrderBoxService(db).listByOrders([...zoneOfOrder.keys()])) {
      const zoneId = zoneOfOrder.get(box.orderId);
      if (zoneId === undefined) continue;
      boxCount.set(zoneId, (boxCount.get(zoneId) ?? 0) + 1);
    }
  }

  // Kapanış bayrağı + kurye adı + araç etiketi: yalnız seferi OLAN rotalar için.
  const dayRuns = today.map((zone) => runByZone.get(zone.id)).filter((run): run is DeliveryRun => Boolean(run));
  const closes = dayRuns.length > 0 ? await new DeliveryRunCloseService(db).listByRuns(dayRuns.map((r) => r.id)) : [];
  const closedRuns = new Set(closes.map((close) => close.deliveryRunId));
  const courierNames = await namesOf(db, dayRuns.map((run) => run.courierId));
  const vehicleLabels = await vehicleLabelsOf(db, dayRuns.map((run) => run.vehicleId));

  return today.map((zone) => toRouteView(zone, runByZone.get(zone.id) ?? null, {
    day: input.date,
    stopCount: stopCount.get(zone.id) ?? 0,
    boxCount: boxCount.get(zone.id) ?? 0,
    collectionCount: collectionCount.get(zone.id) ?? 0,
    warehouseName: warehouseName.get(zone.warehouseId) ?? null,
    closedRuns,
    courierNames,
    vehicleLabels,
  }));
}

function toRouteView(
  zone: DeliveryZone,
  run: DeliveryRun | null,
  ctx: {
    day: string;
    stopCount: number;
    boxCount: number;
    collectionCount: number;
    warehouseName: string | null;
    closedRuns: ReadonlySet<string>;
    courierNames: ReadonlyMap<string, string>;
    vehicleLabels: ReadonlyMap<string, string>;
  },
): CourierRouteView {
  return {
    day: ctx.day,
    zoneId: zone.id,
    zoneName: zone.name,
    warehouseId: zone.warehouseId,
    warehouseName: ctx.warehouseName,
    stopCount: ctx.stopCount,
    boxCount: ctx.boxCount,
    collectionCount: ctx.collectionCount,
    run: run
      ? {
          runId: run.id,
          referenceNo: run.referenceNo,
          zoneId: zone.id,
          zoneName: zone.name,
          vehicleId: run.vehicleId,
          vehicleLabel: run.vehicleId ? (ctx.vehicleLabels.get(run.vehicleId) ?? null) : null,
          deliveryDate: run.deliveryDate,
          departedAt: run.departedAt,
          returnedAt: run.returnedAt,
          closed: ctx.closedRuns.has(run.id),
          courierId: run.courierId,
          courierName: ctx.courierNames.get(run.courierId) ?? null,
        }
      : null,
  };
}

/** Kurye adları — sefer künyesinin "bu rota bugün Musa'da" cümlesi. */
async function namesOf(db: SupabaseClient, courierIds: readonly string[]): Promise<Map<string, string>> {
  const profiles = new UserProfileService(db);
  const map = new Map<string, string>();
  for (const id of new Set(courierIds)) {
    const profile = await profiles.getById(id);
    if (profile) map.set(id, profile.name);
  }
  return map;
}

/**
 * **KURYENİN SEÇEBİLECEĞİ ARAÇLAR** (31.08 · v3:16) — kendi deposuna künyeli, aktif olanlar.
 *
 * Kullanıcı kararı: *"kurye ait olduğu deponun ait olan araçlarını görüp seçebilsin. Şu an burayı
 * kompleksleştirmeyelim."* Tasarımın eski notu (*"araç seçimi masada yapılır"*) bununla düştü.
 *
 * ── KAPSAM ROTA LİSTESİYLE AYNI KAPIDAN ─────────────────────────────────────
 * Süzgeç `scope`, rota seçimininkiyle birebir aynı: kurye başka deponun rotasını göremiyorsa başka
 * deponun aracını da görmemeli — ikisi aynı sabahın iki sorusu. Depo-üstü kapsam (`all`) araçların
 * hepsini görür; kapsamsız profil (`none`) hiçbirini (fail-closed).
 *
 * `warehouseId` araçta NULLABLE ve künyesi *"aidiyet değil adres"* diyor: deposu yazılmamış araç
 * hiçbir kuryenin listesinde çıkmaz. Bu bilinçli — sahipsiz aracı herkese göstermek, kuryeyi
 * başka şehirdeki bir kamyonetin önüne gönderebilirdi (CLAUDE §1).
 *
 * Doğal tavanlı küme (filo operatörün elinde) → tek turda, sayfalama yok.
 */
export interface CourierVehicleView {
  vehicleId: string;
  plate: string;
  label: string | null;
}

export async function listCourierVehicles(
  db: SupabaseClient,
  input: { scope: WarehouseScope },
): Promise<CourierVehicleView[]> {
  if (input.scope.kind === 'none') return [];
  const vehicles = await new VehicleService(db).list({ activeOnly: true });
  return vehicles
    .filter((vehicle) => vehicle.warehouseId !== null && canAccessWarehouse(input.scope, vehicle.warehouseId))
    .map((vehicle) => ({ vehicleId: vehicle.id, plate: vehicle.plate, label: vehicle.label }));
}
