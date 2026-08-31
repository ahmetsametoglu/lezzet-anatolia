/**
 * **GÜN ETİKETİ** — "bugün" · "yarın" · "2 Eylül".
 *
 * ORTAK, çünkü iki ekran da aynı soruyu soruyor: araçtaki seferler (v3:16) ve sefer seçimi
 * (v3:17). Ayrı yazılsaydı biri bir gün "yarın" derken öteki tarihi yazardı ve kurye iki ekranda
 * aynı seferi iki farklı günde görürdü.
 *
 * Tarih SUNUCUDAN geliyor, "bugün"ün kendisi CİHAZDAN: kurye rampada 23:50'de bakıyorsa yarının
 * seferi ona "yarın" demeli. İkisini de sunucuya sormak, cihazın saatiyle sunucunun saatinin
 * ayrıştığı bir gece yarısı üretirdi — ve o gece kurye yanlış seferi başlatırdı.
 */
export function dayTagOf(date: string, copy: { day: { vanRuns: { today: string; tomorrow: string } } }): string {
  const iso = (value: Date): string => value.toISOString().slice(0, 10);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date === iso(today)) return copy.day.vanRuns.today;
  if (date === iso(tomorrow)) return copy.day.vanRuns.tomorrow;
  return new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}
