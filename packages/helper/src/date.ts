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
  return { from: parisInstant(year, month, day).toISOString(), to: parisInstant(year, month, day + 1).toISOString() };
}

/** Paris duvar saatinin (`YYYY-MM-DD hh:mm:ss`, kasa yazılımının biçimi) anı; yaz saatine geçiş gecesinde olmayan saat bir saat ileri kayar. */
export function fromParisLocalTime(local: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error(`Paris saati okunamadı: ${local}`);
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [number, number, number, number, number, number];
  return parisInstant(year, month, day, hour, minute, second);
}

/** Ofset tahmin edilen andan okunur ve bir kez daha düzeltilir: saat değişimine yakın saatte tahmin edilen anın ofseti farklıdır. */
function parisInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = wall - parisOffsetAt(wall);
  return new Date(wall - parisOffsetAt(first));
}

/** Bir anda Paris duvar saatinin UTC'den farkı (ms). */
function parisOffsetAt(at: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((candidate) => candidate.type === type)!.value);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wall - Math.floor(at / 1000) * 1000;
}
