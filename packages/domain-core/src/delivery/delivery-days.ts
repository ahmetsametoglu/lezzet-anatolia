import { normalizePostalCode } from '@lezzet/address';
import type { Country } from '@lezzet/types';

/*
  Rota içi bilgisi saklanmaz, çünkü bölge sınırı değişince saklanan değer ertesi gün yanlış olur. Kesimden sonra gelen sipariş
  bir sonraki güne yazılır ki araç yüklenirken gelen sipariş o günün rotasına düşmesin.
*/

/**
 * Ülke bölgede değil kodda durur: aynı kod iki ülkede geçerli olabilir ve bir bölge iki ülkenin kodlarını kapsayabilir
 * (ADR-002).
 */
export interface DeliveryZoneCandidate {
  id: string;
  postalCodes: readonly PostalCodeRef[];
  /** ISO hafta günü: 1 Pazartesi … 7 Pazar. */
  weekdays: readonly number[];
  isActive?: boolean;
}

export interface PostalCodeRef {
  country: Country;
  postalCode: string;
}

/**
 * Çoğul döner: kod iki aktif bölgedeyse hangisinin geçerli olduğuna çağıran karar verir. Rota gününde ilki yeter, depo seçiminde
 * yetmez.
 */
export function matchZones<T extends DeliveryZoneCandidate>(place: PostalCodeRef, zones: readonly T[]): T[] {
  const wanted = normalizePostalCode(place.postalCode);
  return zones.filter(
    (zone) =>
      zone.isActive !== false &&
      zone.postalCodes.some((c) => c.country === place.country && normalizePostalCode(c.postalCode) === wanted),
  );
}

/**
 * Bölge yoksa `null`, yani kargo. Çakışmada ilki döner: yanlış rota günü ucuz bir hatadır, depo çözümü ise aynı belirsizlikte
 * hata verir.
 */
export function findZoneForPostalCode(
  place: PostalCodeRef,
  zones: readonly DeliveryZoneCandidate[],
): DeliveryZoneCandidate | null {
  return matchZones(place, zones)[0] ?? null;
}

export function isInRoute(place: PostalCodeRef, zones: readonly DeliveryZoneCandidate[]): boolean {
  return findZoneForPostalCode(place, zones) !== null;
}

/**
 * Kesim ayarlarının anahtarı ve fabrika değeri, kuralı uygulayan bu dosyada durur. Rota çıkışı ve kurye kapanışı burada yok:
 * onları motor değil yalnız ekran okuyor.
 */
export const ORDER_CUTOFF_KEY = 'order_cutoff_time';
export const PREP_CUTOFF_KEY = 'prep_cutoff_time';
export const ORDER_CUTOFF_DEFAULT = '16:00';
export const PREP_CUTOFF_DEFAULT = '11:00';

/**
 * Kesim hazırlık kapanışından sonraysa önceki günün saatidir: o saatte gelen sipariş bu günün hazırlığına yetişmez. Saatlerden
 * biri eksikse `false`, yarım veriyle kural teslim gününü sessizce kaydırırdı.
 */
export function cutoffBelongsToPreviousDay(cutoffTime?: string, prepCutoffTime?: string): boolean {
  const cutoff = cutoffTime ? minutesOfDay(cutoffTime) : null;
  const prep = prepCutoffTime ? minutesOfDay(prepCutoffTime) : null;
  if (cutoff === null || prep === null) return false;
  return cutoff > prep;
}

/** Bozuk değer akışı kilitlemesin diye `null` döner. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface UpcomingDatesInput {
  /** ISO 1–7; boşsa teslimat günü yoktur. */
  weekdays: readonly number[];
  now: Date;
  /** "HH:MM"; geçersizse kesim uygulanmaz. */
  cutoffTime?: string;
  /** Kesimin hangi güne ait olduğunu belirler; verilmezse kesim aynı günün saatidir. */
  prepCutoffTime?: string;
  count?: number;
  /** Sonsuz döngü emniyeti. */
  horizonDays?: number;
}

/**
 * Kesim aynı günün saatiyse bugün ancak kesimden önce aday olur; önceki günün saatiyse bugün hiç aday olmaz, çünkü bugünün
 * kesimi dün kapandı.
 */
export function upcomingDeliveryDates(input: UpcomingDatesInput): string[] {
  const { weekdays, now, cutoffTime, prepCutoffTime, count = 3, horizonDays = 28 } = input;
  if (weekdays.length === 0) return [];

  const allowed = new Set(weekdays);
  const cutoff = cutoffTime ? minutesOfDay(cutoffTime) : null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const passed = cutoff !== null && nowMinutes >= cutoff;
  // Önceki gün kuralında taban yarındır; bugünün kesimi de geçtiyse yarının kesimi kapanmıştır ve taban öbür güne kayar.
  const startOffset = cutoff === null ? 0 : cutoffBelongsToPreviousDay(cutoffTime, prepCutoffTime) ? (passed ? 2 : 1) : passed ? 1 : 0;

  const dates: string[] = [];
  for (let offset = startOffset; offset <= horizonDays && dates.length < count; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    // getDay(): 0=Pazar → ISO'da 7.
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    if (allowed.has(isoWeekday)) dates.push(toIsoDate(day));
  }
  return dates;
}

/**
 * Sefer, yani (bölge, tarih), hâlâ sipariş alıyor mu. `upcomingDeliveryDates`in tekil hâlidir ki davet ile ödeme aynı günü aynı
 * cevapla görsün; üç hâl, çünkü ekranın cümlesi üçünde ayrı.
 */
export type DeliveryRunWindow = 'open' | 'cutoff_passed' | 'past';

export function deliveryRunWindow(input: {
  deliveryDate: string;
  now: Date;
  cutoffTime?: string;
  /** Kesimin hangi güne ait olduğunu belirler. */
  prepCutoffTime?: string;
}): DeliveryRunWindow {
  const today = toIsoDate(input.now);
  if (input.deliveryDate < today) return 'past';

  // Kesim yoksa ya da bozuksa kural uygulanmaz; bozuk ayar akışı kilitlemesin.
  const cutoff = input.cutoffTime ? minutesOfDay(input.cutoffTime) : null;
  if (cutoff === null) return 'open';
  const nowMinutes = input.now.getHours() * 60 + input.now.getMinutes();

  if (!cutoffBelongsToPreviousDay(input.cutoffTime, input.prepCutoffTime)) {
    // Aynı gün kuralı: yalnız bugünün seferi kesime bakar.
    if (input.deliveryDate > today) return 'open';
    return nowMinutes < cutoff ? 'open' : 'cutoff_passed';
  }

  // Önceki gün kuralı: D gününün kesimi D−1'dedir; bugünün seferi kapanmıştır, yarınınki bugünün kesimine bakar.
  const tomorrow = toIsoDate(new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() + 1));
  if (input.deliveryDate === today) return 'cutoff_passed';
  if (input.deliveryDate === tomorrow) return nowMinutes < cutoff ? 'open' : 'cutoff_passed';
  return 'open';
}

/** `toISOString()` UTC'ye kaydırıp gün atlatabildiği için yerel gün elle biçimlenir. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
