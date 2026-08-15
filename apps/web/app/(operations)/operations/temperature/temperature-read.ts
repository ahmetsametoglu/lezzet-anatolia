import 'server-only';
import { SettingsService, TemperatureLogService, serviceDb } from '@lezzet/database';
import type { TemperaturePoint } from './temperature-types';

/**
 * **Sıcaklık kaydının okuması** (10.6) — `design/pages/depo-imha-sayim.md §2`,
 * `design/project/Operasyon - Depo Imha Sayim.dc.html` ("Sıcaklık · bugün" şeridi).
 *
 * ── NOKTA KÜMESİ GEÇMİŞTEN GELİR, BİR VARLIKTAN DEĞİL ───────────────────────
 * Tasarımın kuralı: *"ölçülmemiş nokta amber görünür kalır; gün sonunda hatırlatılır."* Bu cümle
 * noktaların ÖNCEDEN bilinmesini ister — ölçülmeyen nokta hiç yazılmamıştır ve yokluğundan
 * haberimiz olmaz.
 *
 * Cevap `listLocations(warehouseId)`: o depoda **daha önce kaydı geçmiş** noktaların kümesi. Bugün
 * kaydı olmayan nokta amber kalır. Ayrı bir `warehouse_temperature_point` varlığı açılMADI ve bu
 * bilinçli: kümenin tek kaynağı zaten kayıtların kendisi, ikinci bir liste tutmak iki gerçek
 * demektir — biri güncellenir, öteki unutulur.
 *
 * **Sınır açık ve ekranda yazılı:** hiç kaydı olmayan yepyeni bir dolap ilk ölçümüne kadar listede
 * görünmez. Form serbest metin kabul ettiği için ilk kayıt onu kümeye sokar.
 *
 * ── "SIRA DIŞI" NOKTANIN KENDİ GEÇMİŞİNE GÖRE ÖLÇÜLÜR ───────────────────────
 * Tasarımın örneği: *"−8° girildi — donuk gıda için beklenmedik yüksek."* Bu soruyu TEK bir global
 * aralık cevaplayamaz: aynı depoda derin dondurucu (−18°) ile soğuk oda (+3,5°) yan yana çalışıyor.
 * Onları kapsayan bir aralık (−25…+8) donmuş gıdadaki −8°'yi *normal* sayardı — yani tam olarak
 * uyarılması gereken hâli susturur, uyarıyı süs hâline getirirdi.
 *
 * Ölçüt bu yüzden noktanın KENDİ alışkanlığı: geçmiş ölçümlerinin ortancası ± tolerans. Derin
 * dondurucu her gün −18 civarı okuyorsa −8 on derece sapmadır ve söylenir; soğuk oda +3,6 okuyunca
 * hiçbir şey söylenmez. Kendini ayarlar, nokta başına ayar dosyası istemez.
 *
 * **Örneklem azken SUSAR** (`MIN_SAMPLES`): iki ölçümün ortancası bir alışkanlık değildir ve ona
 * dayanan uyarı yanlış alarmdır. Ölçemediğimizde "normal" demiyoruz, hiçbir şey demiyoruz —
 * ölçülemeyen değer sıfır değildir (`CLAUDE §1`).
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

export async function readTemperature(warehouseId: string): Promise<{ points: TemperaturePoint[] }> {
  const db = serviceDb();
  const service = new TemperatureLogService(db);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [known, todayPage, history, toleranceC] = await Promise.all([
    service.listLocations(warehouseId),
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
    if (latest.has(row.location)) continue;
    latest.set(row.location, { temperatureC: row.temperatureC, recordedAt: row.recordedAt });
  }

  const samples = new Map<string, number[]>();
  for (const row of history.rows) {
    const list = samples.get(row.location) ?? [];
    list.push(row.temperatureC);
    samples.set(row.location, list);
  }

  // Küme = geçmişte kaydı olanlar ∪ bugün ölçülenler. Birleşim şart: bugün İLK kez ölçülen bir
  // nokta iki listede de olmalı, sıra bir yarışa bağlı kalmasın.
  const names = [...new Set([...known, ...latest.keys()])].sort((a, b) => a.localeCompare(b, 'tr-TR'));

  const points: TemperaturePoint[] = names.map((name) => {
    const reading = latest.get(name);
    if (!reading) return { name, temperatureC: null, recordedAt: null, usualC: null, outOfRange: false };

    const usualC = medianOf(samples.get(name) ?? []);
    return {
      name,
      temperatureC: reading.temperatureC,
      recordedAt: reading.recordedAt,
      usualC,
      outOfRange: usualC !== null && Math.abs(reading.temperatureC - usualC) > toleranceC,
    };
  });

  return { points };
}

/**
 * Tek bir ölçüm o nokta için sıra dışı mı — **yazma yolunun sorusu** (`temperature-actions`).
 *
 * Okuma tarafıyla aynı ölçütü paylaşması ŞART: ikisi ayrı hesaplasaydı kayıt anında "normal" denip
 * şeritte amber görünen (ya da tersi) bir ekran çıkardı ve hangisinin doğru olduğu belirsiz kalırdı.
 *
 * `null` = **karar verilemedi** (o noktanın yeterli geçmişi yok) — "normal" ile aynı şey değil,
 * çağıran ikisini ayrı cümleye çeviriyor.
 */
export async function isUnusualReading(input: {
  warehouseId: string;
  location: string;
  temperatureC: number;
}): Promise<{ unusual: boolean; usualC: number } | null> {
  const db = serviceDb();
  const [page, toleranceC] = await Promise.all([
    new TemperatureLogService(db).list({ warehouseId: input.warehouseId, location: input.location, limit: HISTORY_LIMIT }),
    new SettingsService(db).getNumber(TOLERANCE_KEY, FALLBACK_TOLERANCE_C),
  ]);

  const usualC = medianOf(page.rows.map((row) => row.temperatureC));
  if (usualC === null) return null;
  return { unusual: Math.abs(input.temperatureC - usualC) > toleranceC, usualC };
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
