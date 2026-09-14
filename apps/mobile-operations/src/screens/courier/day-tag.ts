import { dayLabel } from './courier-format';

/**
 * **GÜN ETİKETİ** — `"BUGÜN · 28 AĞUSTOS"` · `"YARIN · 29 AĞUSTOS"` · `"30 AĞUSTOS"`.
 *
 * ORTAK, çünkü iki ekran da aynı soruyu soruyor: araçtaki seferler (v3:16 `s.gunEt`) ve sefer
 * seçimi (v3:17 `r.gunEt`). Ayrı yazılsaydı biri bir gün "yarın" derken öteki tarihi yazardı ve
 * kurye iki ekranda aynı seferi iki farklı günde görürdü.
 *
 * ── TARİH DE YAZILIR (v3:16/17 · kullanıcı bulgusu 31.08) ───────────────────────────────────
 * Etiket yalnız "bugün"/"yarın" diyordu. Araç iki-üç günün seferini birden taşıyabildiği için
 * göreli sözcük yetmiyor: "sonraki" gün hiçbir şey söylemiyordu ve kurye hangi günün seferini
 * yüklediğini karttan okuyamıyordu. Tasarımın biçimi göreli sözcük **ve** tarih; uzak gün ise
 * yalnız tarih — orada "sonraki" diye bir gün yok, 30 Ağustos var.
 *
 * Tarih SUNUCUDAN geliyor, "bugün"ün kendisi CİHAZDAN: kurye rampada 23:50'de bakıyorsa yarının
 * seferi ona "yarın" demeli. İkisini de sunucuya sormak, cihazın saatiyle sunucunun saatinin
 * ayrıştığı bir gece yarısı üretirdi — ve o gece kurye yanlış seferi başlatırdı.
 *
 * Ay adı `dayLabel`den geliyor, `Intl`den DEĞİL: Hermes'in ICU kapsamı platforma göre değişiyor
 * ve `toLocaleDateString('tr-TR')` Android'de İngilizce ay adı döndürebiliyor (`courier-format`
 * künyesi). Burada `Intl` çağrılıyordu — sessiz bir arızaydı.
 */
export function dayTagOf(
  date: string,
  copy: { day: { vanRuns: { today: string; tomorrow: string } } },
): string {
  /* Yerel gün, `toISOString` DEĞİL: o UTC'ye çevirir ve Fransa'da yaz saatiyle akşam 22:00'den
     sonra "yarın" yazardı — kuryenin rampada olduğu saat tam olarak orası. */
  const localIso = (value: Date): string =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const label = dayLabel(date);
  /* Tarih okunamadıysa göreli sözcük yine yazılır, uydurma bir tarih YAZILMAZ (CLAUDE §1). */
  if (date === localIso(today)) return label === null ? copy.day.vanRuns.today : `${copy.day.vanRuns.today} · ${label}`;
  if (date === localIso(tomorrow)) {
    return label === null ? copy.day.vanRuns.tomorrow : `${copy.day.vanRuns.tomorrow} · ${label}`;
  }
  return label ?? date;
}
