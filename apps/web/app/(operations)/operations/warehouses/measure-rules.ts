/**
 * **Soğuk zincirin karar kuralları** (19.30) — sapma ölçütü ve bir GÜNÜN hâli.
 *
 * Saf: veritabanı bilmez, `Date.now()` okumaz, girdiden çıktı üretir. Hem okuma yolu (takvim) hem
 * yazma yolu (ölçüm kaydı) buradan geçiyor — ikisi ayrı hesaplasaydı kayıtta "normal" denip
 * takvimde kırmızı görünen bir ekran çıkardı.
 *
 * **`domain-core`'da DEĞİL, sayfada** ve bunun bilinçli bir sebebi var: `domain-core`'un sözleşmesi
 * "saf karar, **testli**" (`CLAUDE §1`) ve bu turda yeni test yazılmıyor (kullanıcı kuralı 11.08).
 * Kuralın yeri bugün burası; testiyle birlikte `domain-core/stock/cold-chain.ts`'e taşınması
 * `19.30` altında yazılı.
 *
 * Bu dosya `/operations/temperature`ten geldi — o klasör kapandı (`22.29`), kuralları burada yaşıyor.
 */

/** Sapmanın iki ölçütü: tanımlı **aralık** (kesin) ve noktanın kendi **alışkanlığı** (tahmini). */
export type TemperatureDeviation = 'target' | 'habit';

/** Ayar anahtarı — alışkanlık ölçütünün toleransı (°C). */
export const TOLERANCE_KEY = 'temperature_deviation_tolerance_c';

/**
 * Son çare varsayılan (°C) — yalnız ayar satırı HİÇ yoksa okunur; yürürlükteki kural `settings`
 * satırıdır. 4° seçildi: dolap kapağının açık kalması bir-iki derece oynatır (uyarmaya değmez),
 * dört derecelik sapma bir arızanın ya da yazım hatasının işaretidir.
 */
export const FALLBACK_TOLERANCE_C = 4;

/** Alışkanlık kaç ölçümden sonra "alışkanlık" sayılır. Altındaysa uyarı ÜRETİLMEZ. */
const MIN_SAMPLES = 5;

/**
 * Sapma kararı — sıra önemli: **beklenen aralık** (kesin) → **alışkanlık** (tahmini).
 *
 * Aralık öncelikli çünkü alışkanlık bir tahmindir: bozuk bir dolap her gün −8 okuyorsa alışkanlığı
 * −8'dir ve alışkanlık ölçütü onu "normal" ilan eder. Beklenen aralık bu tuzağa düşmez.
 *
 * İkisi de yoksa `null` — "normal" demiyoruz, **ölçemediğimizi** söylüyoruz (`CLAUDE §1`).
 */
export function deviationOf(input: {
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
 * Ortanca — **ortalama DEĞİL, ve fark burada önemli.** Bir dolabın kapağı bir gün açık kalıp +5
 * okuduysa ortalama o noktanın "normal"ini yukarı çeker ve ertesi günkü gerçek arızayı normal
 * gösterir. Ortanca tek bir aykırı değerden etkilenmez; alışkanlık tam olarak budur.
 *
 * `MIN_SAMPLES` altındaysa `null`: cevabı bilmiyoruz ve bilmediğimizi söylüyoruz.
 */
export function medianOf(values: readonly number[]): number | null {
  if (values.length < MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const low = sorted[mid - 1];
  const high = sorted[mid];
  return low !== undefined && high !== undefined ? (low + high) / 2 : null;
}

/**
 * **Bir günün hâli** — takvimin tek karar noktası (19.30).
 *
 * Kullanıcının tarifi iki renkti ("aralıkta değilse farklı renk"); ölçüm üçüncü bir hâl olduğunu
 * gösterdi ve o üçüncüsü denetimde en ağırı: **hiç ölçülmemiş gün**. Sapma karar verilmiş bir
 * olaydır (birisi baktı, gördü, yazdı); boşluk cevapsız bir sorudur.
 *
 * Dördüncüsü de var ve o bir hâl değil bir SESSİZLİK: `idle`. Beklenmeyen bir ölçümün yokluğu
 * eksiklik değildir — oda sıcaklığı rafından günlük ölçüm beklenmez ve o günleri boyamak,
 * denetimi gerçek eksiklere kör eden bir gürültü üretirdi (`expected_daily_checks = 0`).
 *
 * `short` (beklenenden az) ayrı tutuluyor: "sabah alındı, akşam alınmadı" ile "hiç bakılmadı" aynı
 * şey değil — ilki yarım bir tur, ikincisi hiç yapılmamış bir tur.
 */
export type MeasureDayState = 'target' | 'habit' | 'short' | 'missing' | 'ok' | 'idle';

export function dayStateOf(input: {
  /** O günün ölçümleri; sırası önemsiz. */
  deviations: readonly (TemperatureDeviation | null)[];
  /** Noktadan o gün kaç ölçüm bekleniyordu. */
  expected: number;
  /** Gün noktanın ömrü İÇİNDE mi — tanımından önceki günler ölçülmemiş değil, henüz yoktu. */
  withinLifetime: boolean;
}): MeasureDayState {
  if (!input.withinLifetime || input.expected === 0) {
    // Beklenmeyen günde de ölçüm YAZILMIŞ olabilir (rafa merakla bakılmış); o zaman sessiz kalmıyoruz.
    return input.deviations.length === 0 ? 'idle' : worstOf(input.deviations);
  }
  if (input.deviations.length === 0) return 'missing';
  const worst = worstOf(input.deviations);
  if (worst !== 'ok') return worst;
  return input.deviations.length < input.expected ? 'short' : 'ok';
}

/** Günün EN AĞIR ölçümü kazanır: bir sapma, yanındaki üç normal ölçümle aklanmaz. */
function worstOf(deviations: readonly (TemperatureDeviation | null)[]): 'target' | 'habit' | 'ok' {
  if (deviations.includes('target')) return 'target';
  if (deviations.includes('habit')) return 'habit';
  return 'ok';
}

/**
 * Bir damganın GÜN anahtarı (`2026-08-17`).
 *
 * **UTC** — projenin gün kuralı (`format.ts`: *"gün bir tarihtir, yerel saate çevrilirse akşam bir
 * gün kayar"*). Sınırı yazıyoruz, saklamıyoruz: Fransa'da yerel saat UTC+1/+2 olduğu için gece
 * 01:00'den önce alınan bir ölçüm bir önceki güne düşer. Depo turu sabah ve akşam yapıldığından bu
 * pencere pratikte boş; doğru çözüm tesisin saat dilimini veride tutmaktır ve o alan bugün yok.
 */
export function dayKeyOf(iso: string): string {
  return iso.slice(0, 10);
}
