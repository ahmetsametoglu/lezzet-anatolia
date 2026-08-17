import 'server-only';
import { SettingsService, StorageAreaService, TemperatureLogService, VehicleService, serviceDb } from '@lezzet/database';
import type { TemperatureDeviation, TemperaturePoint, TemperaturePointKind } from './temperature-types';

/**
 * **Sıcaklık kaydının okuması** (10.6 · noktalar 19.28) — `design/pages/depo-imha-sayim.md §2`,
 * `design/project/Operasyon - Depo Imha Sayim.dc.html` ("Sıcaklık · bugün" şeridi).
 *
 * ── NOKTA KÜMESİ ARTIK BİR VARLIKTAN GELİYOR ────────────────────────────────
 * Tasarımın kuralı: *"ölçülmemiş nokta amber görünür kalır; gün sonunda hatırlatılır."* Bu cümle
 * noktaların ÖNCEDEN bilinmesini ister ve eski okuma bunu yapamıyordu: küme `listLocations()` ile
 * **daha önce kaydı geçmiş metinlerden** türüyordu, yani hiç ölçülmemiş bir dolap listede yoktu —
 * tam da hatırlatılması gereken nokta görünmüyordu. Dosyanın eski künyesi bu sınırı dürüstçe
 * yazmıştı ama sınır, vaadin kendisini yiyordu.
 *
 * İkinci bir liste tutmanın ("iki gerçek doğar") itirazı da düştü: nokta bugün bir VARLIK
 * (`storage_area` · `vehicle`, `0045`), yani ikinci liste değil TEK liste — kayıtlar ona bağlanıyor.
 *
 * ── SAPMANIN İKİ ÖLÇÜTÜ VAR VE SIRASI ÖNEMLİ ────────────────────────────────
 * **1) Beklenen aralık** (`target_min_c`/`target_max_c`) — noktanın tanımında yazılı, kesin.
 * **2) Kendi alışkanlığı** — aralık tanımlı değilse geçmiş ölçümlerinin ortancası ± tolerans.
 *
 * Aralık öncelikli, çünkü alışkanlık bir TAHMİNDİR: bozuk bir dolap her gün −8 okuyorsa alışkanlığı
 * −8'dir ve alışkanlık ölçütü onu "normal" ilan eder. Beklenen aralık bu tuzağa düşmez. Alışkanlık
 * yine de duruyor — aralığı olmayan noktalarda (raf, geçiş alanı) tek ölçüt odur.
 *
 * **Örneklem azken alışkanlık SUSAR** (`MIN_SAMPLES`): iki ölçümün ortancası bir alışkanlık değildir
 * ve ona dayanan uyarı yanlış alarmdır. Ölçemediğimizde "normal" demiyoruz, hiçbir şey demiyoruz.
 */

/** Ayar anahtarı — TEK yerde okunduğu için burada (`lib/settings-keys.ts` künyesinin kuralı). */
const TOLERANCE_KEY = 'temperature_deviation_tolerance_c';

/**
 * Son çare varsayılan (°C) — yalnız ayar satırı HİÇ yoksa okunur; **yürürlükteki kural bu değildir**,
 * `settings` satırıdır. 4° seçildi: dolap kapağının açık kalması ya da yoğun giriş-çıkış bir-iki
 * derece oynatır (uyarmaya değmez); dört derecelik sapma bir arızanın ya da yazım hatasının işareti.
 */
const FALLBACK_TOLERANCE_C = 4;

/** Alışkanlık kaç ölçümden sonra "alışkanlık" sayılır. Altındaysa uyarı ÜRETİLMEZ. */
const MIN_SAMPLES = 5;

/** Alışkanlığı kurmak için taranan geçmiş — birkaç nokta × birkaç hafta. Tek sorgu. */
const HISTORY_LIMIT = 300;

/** Bir günün ölçüm tavanı — nokta başına 1-2 giriş, birkaç nokta; 50 fazlasıyla yeter. */
const TODAY_LIMIT = 50;

/**
 * Nokta anahtarı — tür + kimlik. Yalnız kimlik yetmez: iki tablonun uuid'leri aynı uzayda değil ve
 * bir gün çakışmasalar bile kod okuyan için "bu hangi nokta" sorusu cevapsız kalırdı.
 */
const keyOf = (kind: TemperaturePointKind, id: string): string => `${kind}:${id}`;

/** Kaydın hangi noktaya yazıldığı — kısıt gereği ikisinden tam biri dolu (`0045`). */
const keyOfLog = (row: { storageAreaId: string | null; vehicleId: string | null }): string | null =>
  row.storageAreaId ? keyOf('area', row.storageAreaId) : row.vehicleId ? keyOf('vehicle', row.vehicleId) : null;

export async function readTemperature(warehouseId: string): Promise<{ points: TemperaturePoint[] }> {
  const db = serviceDb();
  const service = new TemperatureLogService(db);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [areas, vehicles, todayPage, history, toleranceC] = await Promise.all([
    new StorageAreaService(db).listByWarehouse(warehouseId, { activeOnly: true }),
    // Araçlar bu tesise KÜNYELENMİŞ olanlar: araç bir depoya ait değil ama ölçümü bir tesiste
    // alınır ve depocuya öteki tesisin aracını ölçtürmek yanlış kayıt davetidir.
    new VehicleService(db).list({ warehouseId, activeOnly: true }),
    service.list({ warehouseId, from: startOfDay, limit: TODAY_LIMIT }),
    // Alışkanlık taraması: bugün DAHİL (bugünkü ölçüm de o noktanın geçmişinin parçası) — ama
    // ortanca tek bir sapmadan etkilenmediği için bugünkü aykırı değer kendi ölçütünü kaydırmaz.
    service.list({ warehouseId, limit: HISTORY_LIMIT }),
    new SettingsService(db).getNumber(TOLERANCE_KEY, FALLBACK_TOLERANCE_C),
  ]);

  // Nokta başına SON ölçüm: liste en yeniden eskiye geldiği için ilk görülen kazanır. Gün içinde
  // ikinci kez ölçülen dolabın eski değerini göstermek, düzeltilmiş bir arızayı sürüyor sanmaktır.
  const latest = new Map<string, { temperatureC: number; recordedAt: string }>();
  for (const row of todayPage.rows) {
    const key = keyOfLog(row);
    if (key === null || latest.has(key)) continue;
    latest.set(key, { temperatureC: row.temperatureC, recordedAt: row.recordedAt });
  }

  const samples = new Map<string, number[]>();
  for (const row of history.rows) {
    const key = keyOfLog(row);
    if (key === null) continue;
    const list = samples.get(key) ?? [];
    list.push(row.temperatureC);
    samples.set(key, list);
  }

  /**
   * Sıra ALANLAR sonra ARAÇLAR, her biri kendi `sortOrder`ında.
   *
   * Karışık alfabetik sıra iki farklı fiziksel yeri tek listeye katardı; depocunun turu ise
   * mekânsaldır — önce depoyu dolaşır, sonra araca bakar. Sıra operatörün, çünkü tur da onun.
   */
  const points: TemperaturePoint[] = [
    ...areas.map((area) => ({
      id: area.id,
      kind: 'area' as const,
      name: area.name,
      areaKind: area.kind,
      targetMinC: area.targetMinC,
      targetMaxC: area.targetMaxC,
    })),
    ...vehicles.map((vehicle) => ({
      id: vehicle.id,
      kind: 'vehicle' as const,
      // Plaka kimliktir, etiket okunurluk: ikisi varsa ikisi de yazılır.
      name: vehicle.label ? `${vehicle.plate} · ${vehicle.label}` : vehicle.plate,
      areaKind: null,
      // Aracın beklenen aralığı BUGÜN YOK ve uydurulmuyor: soğutuculu araçla sıradan araç aynı
      // tabloda ve ayrımı veride tutulmuyor. Alışkanlık ölçütü araçta tek ölçüt olarak çalışır.
      targetMinC: null,
      targetMaxC: null,
    })),
  ].map((point) => {
    const key = keyOf(point.kind, point.id);
    const reading = latest.get(key);
    const usualC = medianOf(samples.get(key) ?? []);
    if (!reading) return { ...point, temperatureC: null, recordedAt: null, usualC, deviation: null };

    return {
      ...point,
      temperatureC: reading.temperatureC,
      recordedAt: reading.recordedAt,
      usualC,
      deviation: deviationOf({
        temperatureC: reading.temperatureC,
        targetMinC: point.targetMinC,
        targetMaxC: point.targetMaxC,
        usualC,
        toleranceC,
      }),
    };
  });

  return { points };
}

/**
 * Sapma kararı — **tek yerde**, çünkü hem şerit hem kayıt anı aynı cevabı vermek zorunda. İkisi
 * ayrı hesaplasaydı kayıtta "normal" denip şeritte amber görünen bir ekran çıkardı.
 *
 * Sıra: beklenen aralık (kesin) → alışkanlık (tahmini). İkisi de yoksa `null` — "normal" demiyoruz,
 * ölçemediğimizi söylüyoruz.
 */
function deviationOf(input: {
  temperatureC: number;
  targetMinC: number | null;
  targetMaxC: number | null;
  usualC: number | null;
  toleranceC: number;
}): TemperatureDeviation | null {
  if (input.targetMinC !== null && input.targetMaxC !== null) {
    return input.temperatureC < input.targetMinC || input.temperatureC > input.targetMaxC ? 'target' : null;
  }
  if (input.usualC === null) return null;
  return Math.abs(input.temperatureC - input.usualC) > input.toleranceC ? 'habit' : null;
}

/**
 * Tek bir ölçüm o nokta için sıra dışı mı — **yazma yolunun sorusu** (`temperature-actions`).
 *
 * `null` = **karar verilemedi** (aralık tanımlı değil ve yeterli geçmiş yok) — "normal" ile aynı
 * şey değil; çağıran ikisini ayrı cümleye çeviriyor.
 */
export async function isUnusualReading(input: {
  warehouseId: string;
  kind: TemperaturePointKind;
  pointId: string;
  temperatureC: number;
}): Promise<{ deviation: TemperatureDeviation; usualC: number | null; targetMinC: number | null; targetMaxC: number | null } | null> {
  const db = serviceDb();
  const point = input.kind === 'area' ? await new StorageAreaService(db).getById(input.pointId) : null;

  const [page, toleranceC] = await Promise.all([
    new TemperatureLogService(db).list({
      warehouseId: input.warehouseId,
      ...(input.kind === 'area' ? { storageAreaId: input.pointId } : { vehicleId: input.pointId }),
      limit: HISTORY_LIMIT,
    }),
    new SettingsService(db).getNumber(TOLERANCE_KEY, FALLBACK_TOLERANCE_C),
  ]);

  const usualC = medianOf(page.rows.map((row) => row.temperatureC));
  const targetMinC = point?.targetMinC ?? null;
  const targetMaxC = point?.targetMaxC ?? null;
  const deviation = deviationOf({ temperatureC: input.temperatureC, targetMinC, targetMaxC, usualC, toleranceC });
  // Ölçüt HİÇ yoksa `null`: ne "sapma var" ne "yok" diyebiliriz.
  if (deviation === null && targetMinC === null && usualC === null) return null;
  return deviation === null ? null : { deviation, usualC, targetMinC, targetMaxC };
}

/**
 * Ortanca — **ortalama DEĞİL, ve fark burada önemli.** Bir dolabın kapağı bir gün açık kalıp +5
 * okuduysa ortalama o noktanın "normal"ini yukarı çeker ve ertesi günkü gerçek arızayı normal
 * gösterir. Ortanca tek bir aykırı değerden etkilenmez; alışkanlık tam olarak budur.
 *
 * `MIN_SAMPLES` altındaysa `null`: cevabı bilmiyoruz ve bilmediğimizi söylüyoruz.
 */
function medianOf(values: readonly number[]): number | null {
  if (values.length < MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const low = sorted[mid - 1];
  const high = sorted[mid];
  return low !== undefined && high !== undefined ? (low + high) / 2 : null;
}
