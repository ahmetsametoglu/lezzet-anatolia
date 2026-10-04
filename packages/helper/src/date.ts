/**
 * Takvim günü farkı: `to` ile `from` arasında kaç gün var. İki uç UTC gün başına indirilir, çünkü ham milisaniyeyi bir günün
 * milisaniyesine bölmek "kaç 24 saat geçti"yi verir ve aynı parti sabah eşikte, akşam eşik dışında görünürdü.
 */
export function daysBetween(from: Date | string, to: Date | string): number {
  return dayIndex(to) - dayIndex(from);
}

/** Bir tarihin UTC gün numarası — saat/dakika/dilim gürültüsü karara girmesin diye. */
function dayIndex(value: Date | string): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/** İşletme günü Paris takvimindedir; kasanın gün sonu ve günlük raporlar bu saatle döner. */
export const BUSINESS_TIME_ZONE = 'Europe/Paris';

/** Bir anın Paris'teki takvim günü (`YYYY-MM-DD`). */
export function parisDateOf(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(at);
}

/** Bir anın Paris'teki duvar saati, gece yarısından beri dakika olarak. */
export function parisMinutesOf(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)!.value);
  return part('hour') * 60 + part('minute');
}

/** Takvimde `days` gün sonrası (`YYYY-MM-DD`, eksi değer geri gider); saat dilimi gerektirmeyen takvim aritmetiği. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Paris takviminde bir günün UTC sınırları, yarı açık `[from, to)`; yaz saatine geçilen gün 23 saattir. */
export function parisDayRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { from: parisMidnight(year, month, day).toISOString(), to: parisMidnight(year, month, day + 1).toISOString() };
}

/** Paris'te yerel gece yarısının anı; Paris UTC+1 ya da +2'dir ve saat değişimi gece yarısına düşmez. */
function parisMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)!.value);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  return new Date(guess - (wall - guess));
}
