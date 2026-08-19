import {
  DeliveryRunCloseService,
  DeliveryRunService,
  DeliveryZoneService,
  OrderService,
  UserProfileService,
  VehicleService,
  serviceDb,
} from '@lezzet/database';
import type { DeliveryRun, KeysetCursor } from '@lezzet/types';

/**
 * GEÇMİŞ SEFERLER okuması (18.08, `docs/feature/sefer.md` Faz 5) — "geçmiş seferlere nereden
 * bakabiliyorum" sorusunun evi. Gün planı geçmişe siparişlerden TÜRETİP bakıyordu; burası kaydın
 * kendisini okur: kim sürdü, hangi araç, ne zaman çıktı/döndü, mutabakat ne dedi.
 *
 * KEYSET sayfalı (CLAUDE §1: sefer kümesi veriyle sınırsız büyür; imleç URL'e yazılmaz).
 */

/** Listenin bir satırı — seferin künyesi + kapanış özeti. */
export interface RunListRow {
  runId: string;
  referenceNo: string;
  date: string;
  zoneName: string | null;
  warehouseName: string | null;
  courierName: string | null;
  vehicleLabel: string | null;
  departedAt: string | null;
  returnedAt: string | null;
  /** Sefere bağlanmış sipariş sayısı — "kaç durak" sorusunun kaydı. */
  stopCount: number;
  /**
   * Kapanış özeti — `null` = sayım yapılmadı (sefer dönmüş olsa bile). Sayılar kapanış ANININ
   * fotoğrafı: sonradan çözülen askıdakiler bu sayıları değiştirmez, değiştirmemeli.
   */
  close: { deliveredCount: number; returnedCount: number; pendingCount: number; reconciled: boolean } | null;
}

export interface RunsPageView {
  rows: RunListRow[];
  /** `null` = liste bitti. İmleç istemcide durur, adrese yazılmaz (CLAUDE §1). */
  nextCursor: KeysetCursor | null;
}

const PAGE_SIZE = 30;

export async function readRunsPage(after?: KeysetCursor): Promise<RunsPageView> {
  const db = serviceDb();
  // Bir fazla satır: `nextCursor` ekstra sorgu olmadan belirlensin (Page sözleşmesinin deseni).
  const runs = await new DeliveryRunService(db).listRecent({ limit: PAGE_SIZE + 1, after });
  const page = runs.slice(0, PAGE_SIZE);
  if (page.length === 0) return { rows: [], nextCursor: null };

  const runIds = page.map((run) => run.id);
  const [zones, closes, orders] = await Promise.all([
    new DeliveryZoneService(db).list(),
    new DeliveryRunCloseService(db).listByRuns(runIds),
    // Durak sayısı KAYITTAN: sefere damgalanmış siparişler (delivery_run_id) — güne göre türetim değil.
    new OrderService(db).listByRuns(runIds),
  ]);
  const zoneName = new Map(zones.map((zone) => [zone.id, zone.name]));
  const closeByRun = new Map(closes.map((close) => [close.deliveryRunId, close]));
  const stopCount = new Map<string, number>();
  for (const order of orders) {
    if (!order.deliveryRunId) continue;
    stopCount.set(order.deliveryRunId, (stopCount.get(order.deliveryRunId) ?? 0) + 1);
  }
  const courierNames = await namesOf(db, page.map((run) => run.courierId));
  const vehicleLabels = await vehiclesOf(db, page.map((run) => run.vehicleId));

  const last = page[page.length - 1]!;
  return {
    rows: page.map((run) => toRow(run, { zoneName, closeByRun, stopCount, courierNames, vehicleLabels })),
    nextCursor: runs.length > PAGE_SIZE ? { value: last.deliveryDate, id: last.id } : null,
  };
}

function toRow(
  run: DeliveryRun,
  ctx: {
    zoneName: ReadonlyMap<string, string>;
    closeByRun: ReadonlyMap<string, { deliveredOrders: string[]; returnedOrders: string[]; pendingOrders: string[]; reconciled: boolean }>;
    stopCount: ReadonlyMap<string, number>;
    courierNames: ReadonlyMap<string, string>;
    vehicleLabels: ReadonlyMap<string, string>;
  },
): RunListRow {
  const close = ctx.closeByRun.get(run.id);
  return {
    runId: run.id,
    referenceNo: run.referenceNo,
    date: run.deliveryDate,
    zoneName: ctx.zoneName.get(run.deliveryZoneId) ?? null,
    // Depo adı rota satırından türetilmiyor (rota taşınmış olabilir); v1'de rota adı yeter,
    // depo gerekirse warehouse_id snapshot'ından okunur.
    warehouseName: null,
    courierName: ctx.courierNames.get(run.courierId) ?? null,
    vehicleLabel: run.vehicleId ? (ctx.vehicleLabels.get(run.vehicleId) ?? null) : null,
    departedAt: run.departedAt,
    returnedAt: run.returnedAt,
    stopCount: ctx.stopCount.get(run.id) ?? 0,
    close: close
      ? {
          deliveredCount: close.deliveredOrders.length,
          returnedCount: close.returnedOrders.length,
          pendingCount: close.pendingOrders.length,
          reconciled: close.reconciled,
        }
      : null,
  };
}

async function namesOf(db: ReturnType<typeof serviceDb>, ids: readonly string[]): Promise<Map<string, string>> {
  const profiles = await new UserProfileService(db).listByIds([...new Set(ids)]);
  return new Map(profiles.map((profile) => [profile.id, profile.name]));
}

async function vehiclesOf(db: ReturnType<typeof serviceDb>, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const vehicles = new VehicleService(db);
  const map = new Map<string, string>();
  for (const id of new Set(ids.filter((value): value is string => value !== null))) {
    const vehicle = await vehicles.getById(id);
    if (vehicle) map.set(id, vehicle.label ?? vehicle.plate);
  }
  return map;
}
