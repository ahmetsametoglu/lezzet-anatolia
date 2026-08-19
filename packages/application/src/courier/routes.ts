import {
  DeliveryRunCloseService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderService,
  UserProfileService,
  VehicleService,
  WarehouseService,
} from '@lezzet/database';
import type { DeliveryRun, DeliveryZone } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kuryenin ROTA SEÇİMİ (K1 · 18.08, `docs/feature/sefer.md`) — **uygulama katmanı orkestrasyonu**.
 *
 * Hedef akış kullanıcının cümlesi: *"arayüzden kurye ataması saçma — kurye giriş yapar, ROTAYI
 * seçer, aracını doldurur, o rotayı sürer."* Bu kapı seçim ekranının verisini kurar: o gün koşan
 * aktif rotalar, yükleri ve varsa açık seferin künyesi. Kuryeye SÜZÜLMEZ — seçilecek rotanın
 * durakları henüz kimsenin değil; sahiplik seferi başlatanın claim'iyle doğar.
 *
 * Rota kümesi doğal tavanlı (operatör elle kurar) → tek turda çekilir, sayfalama yok (CLAUDE §1).
 */

/** Seçim ekranındaki bir rota satırı — sözleşmedeki `CourierRouteSchema`nın aynası. */
export interface CourierRouteView {
  zoneId: string;
  zoneName: string;
  warehouseId: string;
  warehouseName: string | null;
  /** O güne yazılmış rota siparişi — kurye seçerken yükü görsün. */
  stopCount: number;
  run: {
    runId: string;
    referenceNo: string;
    zoneId: string;
    zoneName: string | null;
    vehicleId: string | null;
    /** Aracın ekranda okunan adı ("Küçük kamyonet") ya da plakası — sefer şeridinin künyesi. */
    vehicleLabel: string | null;
    departedAt: string | null;
    returnedAt: string | null;
    closed: boolean;
    courierId: string;
    courierName: string | null;
  } | null;
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
export async function listCourierRoutes(db: SupabaseClient, input: { date: string }): Promise<CourierRouteView[]> {
  const weekday = isoWeekdayOf(input.date);
  const [zones, runs, orders, warehouses] = await Promise.all([
    new DeliveryZoneService(db).list({ activeOnly: true }),
    new DeliveryRunService(db).listByDate(input.date),
    new OrderService(db).listRouteOrdersByDate(input.date),
    new WarehouseService(db).list(),
  ]);

  const today = zones.filter((zone) => zone.weekdays.includes(weekday));
  if (today.length === 0) return [];

  const runByZone = new Map(runs.map((run) => [run.deliveryZoneId, run]));
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));

  // Yük sayacı: günün rota siparişleri zone'a göre gruplanır (tek sorgu, N+1 yok).
  const stopCount = new Map<string, number>();
  for (const order of orders) {
    if (!order.deliveryZoneId) continue;
    stopCount.set(order.deliveryZoneId, (stopCount.get(order.deliveryZoneId) ?? 0) + 1);
  }

  // Kapanış bayrağı + kurye adı + araç etiketi: yalnız seferi OLAN rotalar için.
  const dayRuns = today.map((zone) => runByZone.get(zone.id)).filter((run): run is DeliveryRun => Boolean(run));
  const closes = dayRuns.length > 0 ? await new DeliveryRunCloseService(db).listByRuns(dayRuns.map((r) => r.id)) : [];
  const closedRuns = new Set(closes.map((close) => close.deliveryRunId));
  const courierNames = await namesOf(db, dayRuns.map((run) => run.courierId));
  const vehicleLabels = await vehicleLabelsOf(db, dayRuns.map((run) => run.vehicleId));

  return today.map((zone) => toRouteView(zone, runByZone.get(zone.id) ?? null, {
    stopCount: stopCount.get(zone.id) ?? 0,
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
    stopCount: number;
    warehouseName: string | null;
    closedRuns: ReadonlySet<string>;
    courierNames: ReadonlyMap<string, string>;
    vehicleLabels: ReadonlyMap<string, string>;
  },
): CourierRouteView {
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    warehouseId: zone.warehouseId,
    warehouseName: ctx.warehouseName,
    stopCount: ctx.stopCount,
    run: run
      ? {
          runId: run.id,
          referenceNo: run.referenceNo,
          zoneId: zone.id,
          zoneName: zone.name,
          vehicleId: run.vehicleId,
          vehicleLabel: run.vehicleId ? (ctx.vehicleLabels.get(run.vehicleId) ?? null) : null,
          departedAt: run.departedAt,
          returnedAt: run.returnedAt,
          closed: ctx.closedRuns.has(run.id),
          courierId: run.courierId,
          courierName: ctx.courierNames.get(run.courierId) ?? null,
        }
      : null,
  };
}

/** Araç etiketi: okunur ad varsa o, yoksa plaka — "hangi araçla" sorusu şeritte cevaplanır. */
async function vehicleLabelsOf(db: SupabaseClient, vehicleIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const vehicles = new VehicleService(db);
  const map = new Map<string, string>();
  for (const id of new Set(vehicleIds.filter((value): value is string => value !== null))) {
    const vehicle = await vehicles.getById(id);
    if (vehicle) map.set(id, vehicle.label ?? vehicle.plate);
  }
  return map;
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
