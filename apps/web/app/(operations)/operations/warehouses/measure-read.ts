import 'server-only';
import { SettingsService, StorageAreaService, TemperatureLogService, VehicleService, type serviceDb } from '@lezzet/database';
import type { StorageArea, TemperatureLog, Vehicle } from '@lezzet/types';
import {
  FALLBACK_TOLERANCE_C,
  TOLERANCE_KEY,
  dayKeyOf,
  dayStateOf,
  deviationOf,
  medianOf,
  type TemperatureDeviation,
} from './measure-rules';
import type { MeasureDayView, MeasurePointView } from './warehouses-types';

/**
 * **Ölçüm noktaları + hijyen takvimi** (19.28 · takvim 19.30).
 *
 * ── NEDEN AYRI, SERVER-ONLY BİR DOSYA ───────────────────────────────────────
 * `warehouses-read.ts` saf görünüyor ama İSTEMCİ paketine giriyor (`closureConsequences`'ı kapatma
 * penceresi çağırıyor). Oraya bir servis importu konunca supabase-js de istemciye gitti ve derleme
 * `node:crypto` ile kırıldı — iki sayfa birden 500 döndü (ölçüldü 17.08). Sınır dosya adından
 * değil "kim import ediyor"dan doğuyor; DB okuyan her şey `server-only` bir dosyada durur.
 *
 * ── TEK OKUMA, ÜÇ AY ────────────────────────────────────────────────────────
 * Pencere hep 3 ay çekiliyor, ekran 1/2/3 ay arasında **istemcide** daraltıyor. Sebebi ölçüm:
 * 6 nokta × 92 gün ≈ 550 gün nesnesi, 56 satır kayıt (17.08) — yani aralık değiştikçe sunucuya
 * dönmek, kazandırdığından çok bekletirdi. Sayfalama da yok ve olmamalı: takvim sonsuz büyüyen bir
 * liste değil, TAVANI OLAN bir küme (`CLAUDE §1` — doğal tavanı olan küme tek turda çekilir).
 */

/** Takvimin penceresi (gün). 3 ay: denetmenin sorduğu aralık, ve ekranda üç ay kutusuna sığar. */
const CALENDAR_DAYS = 92;

export async function readMeasurePoints(
  db: ReturnType<typeof serviceDb>,
  warehouseId: string,
  now: Date,
): Promise<{ points: MeasurePointView[]; truncated: boolean }> {
  const days = dayWindow(now, CALENDAR_DAYS);
  const from = new Date(`${days[0]}T00:00:00.000Z`);

  /**
   * Noktalar **pasifiyle birlikte** geliyor (`activeOnly` verilmiyor): ekran onu işaretliyor,
   * süzmüyor — kullanımdan kalkmış bir dolabı gizlemek, geçmiş kayıtlarının sahibini görünmez
   * yapardı ve takvim tam da o geçmişi gösteriyor.
   */
  const [areas, vehicles, logs, toleranceC] = await Promise.all([
    new StorageAreaService(db).listByWarehouse(warehouseId),
    new VehicleService(db).list({ warehouseId }),
    new TemperatureLogService(db).listRange({ warehouseId, from, to: now }),
    new SettingsService(db).getNumber(TOLERANCE_KEY, FALLBACK_TOLERANCE_C),
  ]);

  const byPoint = groupByPoint(logs.rows);

  /**
   * Sıra ALANLAR sonra ARAÇLAR, her biri kendi `sortOrder`ında — depocunun turu mekânsaldır (önce
   * depoyu dolaşır, sonra araca bakar), alfabetik değil.
   */
  const points = [
    ...areas.map((area) => pointOf(areaBase(area), byPoint, { days, toleranceC })),
    ...vehicles.map((vehicle) => pointOf(vehicleBase(vehicle), byPoint, { days, toleranceC })),
  ];

  return { points, truncated: logs.truncated };
}

// ── Nokta künyeleri — iki tablo, tek görünüm ────────────────────────────────

/** İki tablonun ORTAK yüzü; ayrımı `kind` taşıyor (düzenleme formu ona göre değişiyor). */
type PointBase = Omit<MeasurePointView, 'days' | 'lastRecordedAt'>;

const areaBase = (area: StorageArea): PointBase => ({
  id: area.id,
  kind: 'area',
  name: area.name,
  label: null,
  areaKind: area.kind,
  targetMinC: area.targetMinC,
  targetMaxC: area.targetMaxC,
  expectedDailyChecks: area.expectedDailyChecks,
  createdAt: area.createdAt,
  isActive: area.isActive,
});

const vehicleBase = (vehicle: Vehicle): PointBase => ({
  id: vehicle.id,
  kind: 'vehicle',
  name: vehicle.plate,
  label: vehicle.label,
  areaKind: null,
  // Aracın beklenen aralığı bugün veride YOK ve uydurulmuyor: soğutuculu araçla sıradan araç aynı
  // tabloda, ayrım tutulmuyor. Sapma araçta alışkanlıktan ölçülür.
  targetMinC: null,
  targetMaxC: null,
  expectedDailyChecks: vehicle.expectedDailyChecks,
  createdAt: vehicle.createdAt,
  isActive: vehicle.isActive,
});

// ── Takvimin kurulması ──────────────────────────────────────────────────────

const keyOf = (kind: 'area' | 'vehicle', id: string): string => `${kind}:${id}`;

/** Kaydın hangi noktaya yazıldığı — kısıt gereği ikisinden tam biri dolu (`0045`). */
function groupByPoint(rows: readonly TemperatureLog[]): Map<string, TemperatureLog[]> {
  const map = new Map<string, TemperatureLog[]>();
  for (const row of rows) {
    const key = row.storageAreaId
      ? keyOf('area', row.storageAreaId)
      : row.vehicleId
        ? keyOf('vehicle', row.vehicleId)
        : null;
    if (key === null) continue;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

function pointOf(
  base: PointBase,
  byPoint: ReadonlyMap<string, TemperatureLog[]>,
  ctx: { days: readonly string[]; toleranceC: number },
): MeasurePointView {
  const rows = byPoint.get(keyOf(base.kind, base.id)) ?? [];

  /**
   * Alışkanlık ÜÇ AYLIK pencereden çıkıyor — daha önce sabit sayıda satırdan (300) çıkıyordu ve o
   * sayı noktalar arasında bölüşülüyordu: çok noktalı bir tesiste her noktaya birkaç örnek düşerdi.
   * Pencere zaten okunduğu için bu ölçüt bedava geldi.
   */
  const usualC = medianOf(rows.map((row) => row.temperatureC));

  const readingsByDay = new Map<string, MeasureDayView['readings']>();
  for (const row of rows) {
    const key = dayKeyOf(row.recordedAt);
    const list = readingsByDay.get(key) ?? [];
    list.push({
      at: row.recordedAt,
      temperatureC: row.temperatureC,
      deviation: deviationOf({
        temperatureC: row.temperatureC,
        targetMinC: base.targetMinC,
        targetMaxC: base.targetMaxC,
        usualC,
        toleranceC: ctx.toleranceC,
      }),
    });
    readingsByDay.set(key, list);
  }

  // Noktanın DOĞUM günü: öncesindeki günler "ölçülmedi" değil, nokta henüz yoktu. Bu ayrım
  // olmasaydı her yeni dolap, tanımlandığı gün üç aylık kırmızı bir geçmişle doğardı.
  const bornOn = dayKeyOf(base.createdAt);

  const days: MeasureDayView[] = ctx.days.map((date) => {
    // Saat sırası: gün içindeki ölçümler tooltipte sabahtan akşama okunur.
    const readings = (readingsByDay.get(date) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    return {
      date,
      readings,
      expected: base.expectedDailyChecks,
      state: dayStateOf({
        deviations: readings.map((r) => r.deviation),
        expected: base.expectedDailyChecks,
        withinLifetime: date >= bornOn,
      }),
    };
  });

  /**
   * Son ölçüm **bu pencerede** — dışarısı sorulmuyor ve ekran da öyle yazıyor ("son 3 ayda ölçüm
   * yok"). Eskiden "hiç ölçülmedi" deniyordu ve bu, dört ay önce ölçülmüş bir dolap için YANLIŞTI:
   * ölçemediğimiz bir şeyi yokluk diye göstermek (`CLAUDE §1`).
   */
  const lastRecordedAt = rows.reduce<string | null>(
    (latest, row) => (latest === null || row.recordedAt > latest ? row.recordedAt : latest),
    null,
  );

  return { ...base, days, lastRecordedAt };
}

/**
 * Pencerenin gün anahtarları, eskiden yeniye. `count` gün + bugün.
 *
 * UTC üzerinden yürüyor (`dayKeyOf`'un kuralı) ve gün eklemek yerine milisaniye çıkarıyor: yaz
 * saati geçişinde yerel gün 23 ya da 25 saat sürer, UTC günü hep 24.
 */
function dayWindow(now: Date, count: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(new Date(todayUtc - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Tek bir ölçüm o nokta için sıra dışı mı — **yazma yolunun sorusu** (`measure-actions`).
 *
 * `null` = **karar verilemedi** (aralık tanımlı değil ve yeterli geçmiş yok) — "normal" ile aynı şey
 * değil; çağıran ikisini ayrı cümleye çeviriyor.
 */
export async function isUnusualReading(input: {
  db: ReturnType<typeof serviceDb>;
  warehouseId: string;
  kind: 'area' | 'vehicle';
  pointId: string;
  temperatureC: number;
}): Promise<{ deviation: TemperatureDeviation; usualC: number | null } | null> {
  const point = input.kind === 'area' ? await new StorageAreaService(input.db).getById(input.pointId) : null;

  const [page, toleranceC] = await Promise.all([
    new TemperatureLogService(input.db).list({
      warehouseId: input.warehouseId,
      ...(input.kind === 'area' ? { storageAreaId: input.pointId } : { vehicleId: input.pointId }),
      limit: HISTORY_LIMIT,
    }),
    new SettingsService(input.db).getNumber(TOLERANCE_KEY, FALLBACK_TOLERANCE_C),
  ]);

  const usualC = medianOf(page.rows.map((row) => row.temperatureC));
  const deviation = deviationOf({
    temperatureC: input.temperatureC,
    targetMinC: point?.targetMinC ?? null,
    targetMaxC: point?.targetMaxC ?? null,
    usualC,
    toleranceC,
  });
  return deviation === null ? null : { deviation, usualC };
}

/** Tek noktanın alışkanlığını kurmak için taranan geçmiş — yazma yolu tek nokta sorguluyor. */
const HISTORY_LIMIT = 300;
