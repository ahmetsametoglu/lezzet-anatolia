/**
 * Açılış saatleri, aynı saatli ardışık günler birleşik ("Pzt–Cmt 08:00 - 12:00 · Paz kapalı"); sağlayıcının günleri "0"
 * pazartesiden başlar. Hiç saat yoksa `null`: bilinmiyor, "kapalı" değil.
 */
export function openingLines(times: Record<string, string[]> | null, locale: string, closed: string): string[] | null {
  if (!times || Object.values(times).every((slots) => slots.length === 0)) return null;
  const monday = Date.UTC(2024, 0, 1);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const nameOf = (i: number) => day.format(new Date(monday + i * 86_400_000));
  const hoursOf = (i: number) => {
    const slots = times[String(i)] ?? [];
    return slots.length > 0 ? slots.join(', ') : closed;
  };
  const lines: string[] = [];
  let from = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && hoursOf(i) === hoursOf(from)) continue;
    const range = from === i - 1 ? nameOf(from) : `${nameOf(from)}–${nameOf(i - 1)}`;
    lines.push(`${range} ${hoursOf(from)}`);
    from = i;
  }
  return lines;
}
