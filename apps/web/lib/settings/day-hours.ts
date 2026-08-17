import {
  ORDER_CUTOFF_DEFAULT,
  ORDER_CUTOFF_KEY,
  PREP_CUTOFF_DEFAULT,
  PREP_CUTOFF_KEY,
} from '@lezzet/domain-core';
import type { SettingsService } from '@lezzet/database';

/**
 * **GÜNÜN EŞİK SAATLERİ** — dört anahtarın TEK KAYNAĞI (kullanıcı kararı 17.08).
 *
 * ── NEDEN BURADA, ÜÇ YERDE DEĞİL ────────────────────────────────────────────
 * Bu dört anahtarı üç yer birden okuyor: panelin gün akışı (`dashboard-page-read`), Ayarlar sözlüğü
 * (`settings-catalog`, fabrika değeri) ve rota kurulumu (`route-hours`, rota başına düzenleme).
 * Varsayılanlar bir dönem İKİ yerde ayrı yazılıydı — panelde `TIME_DEFAULTS`, sözlükte `fallback` —
 * ve ayrışsalardı panel bir saati, sistem başkasını uygulardı; hiçbir hata vermeden (`CLAUDE §1`).
 * Üçüncü kopyayı yazmak yerine ikisi buraya bağlandı.
 *
 * ── SIRA ANLAMLI, ALFABETİK DEĞİL ───────────────────────────────────────────
 * Liste günün akışına göre dizili: kesim → hazırlık → çıkış → kapanış. Rota ekranındaki zaman
 * doğrusu şeritleri bu sırayla çiziyor, panelin akış şeridi de bu sırayı bekliyor. Sırayı bozmak
 * iki ekranı birden yanlış okutur.
 *
 * ── DB KODU İSTEMCİYE GİRMEZ ────────────────────────────────────────────────
 * `SettingsService` yalnız `import type` ile geliyor ve okuma fonksiyonu servisi PARAMETRE olarak
 * alıyor. Sebebi ölçülmüş bir tuzak: bu dosyayı bir istemci komponenti de (rota rozetleri) ithal
 * ediyor; gövdede runtime bir `@lezzet/database` importu olsaydı supabase-js istemci paketine düşer
 * ve `node:crypto` ile derleme kırılırdı.
 */
export const DAY_HOURS = [
  {
    /**
     * **Anahtar ve fabrika değeri `domain-core`dan** — bu ikisini bir MOTOR okuyor (`delivery-days`:
     * kesim kuralı ve teslim günü hesabı), yani kararın sahibi orası. Burada yeniden yazılsaydı
     * ekran bir saati, sipariş akışı başkasını uygulardı (`CLAUDE §1`).
     *
     * Öteki ikisi (`route_departure_time` · `courier_close_time`) dize olarak duruyor ve bu bilinçli:
     * onları hiçbir motor okumuyor, yalnız ekran gösteriyor. Bir karar onlara bağlandığı gün onlar da
     * `domain-core`a taşınır.
     */
    key: ORDER_CUTOFF_KEY,
    /** Rota rayındaki zaman doğrusunun şerit etiketi — yer dar, tek kelime. */
    short: 'kesim',
    /** Rozetin tooltip başlığı; Ayarlar sözlüğündeki etiketle aynı işi yapar. */
    label: 'Sipariş kesimi',
    fallback: ORDER_CUTOFF_DEFAULT,
  },
  { key: PREP_CUTOFF_KEY, short: 'hazırlık', label: 'Depo hazırlık kapanışı', fallback: PREP_CUTOFF_DEFAULT },
  { key: 'route_departure_time', short: 'çıkış', label: 'Rota çıkışı', fallback: '14:00' },
  { key: 'courier_close_time', short: 'kapanış', label: 'Kurye kapanışı', fallback: '18:00' },
] as const;

export type DayHourKey = (typeof DAY_HOURS)[number]['key'];

/** Anahtarlar, GÜN SIRASIYLA. Döngüler bunu kullanır; `DAY_HOURS`'un sırasından türer. */
export const DAY_HOUR_KEYS: readonly DayHourKey[] = DAY_HOURS.map((hour) => hour.key);

/**
 * Anahtar → fabrika değeri.
 *
 * Migration'daki satırlarla AYNI olmak zorunda ve bunu `settings-catalog` nöbeti doğruluyor
 * (*"fallback verilen anahtar migration'da BULUNMALI"*). Sözlük bu tablodan besleniyor, yani
 * ayrışma yolu kapalı.
 */
export const DAY_HOUR_FALLBACK: Record<DayHourKey, string> = Object.fromEntries(
  DAY_HOURS.map((hour) => [hour.key, hour.fallback]),
) as Record<DayHourKey, string>;

/**
 * `"SS:DD"` → gün başından dakika. Biçim bozuksa **`null`**.
 *
 * Sıfıra düşürmek bozuk bir değeri "gece yarısı" diye okuturdu (`CLAUDE §1`: ölçülemeyen değer sıfır
 * değildir) — gün akışında en başa oturur ve "kesim geçti" derdi.
 */
export function toMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Dakika → `"SS:DD"`.
 *
 * Çubuk (`input[type=range]`) dakika taşıyor, ayar satırı ise metin: dönüşüm tek yerde durmalı ki
 * ekranın gösterdiği saat ile veriye yazılan saat aynı olsun. İki haneli biçim şart —
 * `parseSettingValue` `"9:5"` gibi bir yazımı reddediyor (sıralanamaz, karşılaştırılamaz).
 */
export function toTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Bir rotanın bir eşiği: yürürlükteki saat + o saatin NEREDEN geldiği. */
export interface HourValue {
  time: string;
  /**
   * Bu rotaya YAZILI mı (istisna satırı), yoksa genel değer mi.
   *
   * Rozet bu ayrımı gösteriyor: dolu rozet = rotaya özel, çerçeveli = genelden miras. Ayrım
   * olmasaydı operatör kendi yazdığı saati genel değerden ayırt edemez, "genele dön" düğmesinin
   * ne zaman anlamlı olduğunu bilemezdi.
   */
  isException: boolean;
}

export type ZoneHours = Record<DayHourKey, HourValue>;

/**
 * Dört eşiği **rota başına** okur.
 *
 * ── SORGU SAYISI ROTAYLA ÇARPMAZ ────────────────────────────────────────────
 * Anahtar başına tek sorgu (`listByKey`), yani N rota × 4 anahtar için **4 sorgu**. Rota başına
 * `get()` çağırmak tipik bir N+1 tuzağıydı; burada satırların tamamı bir kez çekilip bellekte
 * eşleniyor.
 *
 * ── NEDEN `get()` DEĞİL ─────────────────────────────────────────────────────
 * `SettingsService.get()` yürürlükteki DEĞERİ verir ama nereden geldiğini söylemez. Rota ekranının
 * sorusu tam olarak o: bu saat bu rotaya mı yazılı, yoksa genelden mi geliyor. Cevap ancak kapsam
 * satırlarına bakarak verilebilir.
 *
 * **Kapsam zinciri burada YENİDEN uygulanmıyor** — okunan tek istisna ekseni `zone`, çünkü bu dört
 * anahtarın sözlükteki izni yalnız o (`ZONE_ONLY`, kullanıcı kararı 17.08: depo ekseni kaldırıldı).
 * Bir gün başka bir eksen açılırsa burası da genişletilmeli; o yüzden izin sözlükte tek yerde durur.
 */
export async function readDayHours(
  settings: SettingsService,
  zoneIds: readonly string[],
): Promise<{ byZone: Map<string, ZoneHours>; global: Record<DayHourKey, string> }> {
  const lists = await Promise.all(DAY_HOUR_KEYS.map((key) => settings.listByKey(key)));

  const global = { ...DAY_HOUR_FALLBACK };
  /** anahtar → (rota kimliği → o rotaya yazılı saat) */
  const byKey = new Map<DayHourKey, Map<string, string>>();

  DAY_HOUR_KEYS.forEach((key, index) => {
    const rows = lists[index] ?? [];

    // Genel satır yoksa fabrika değeri kalır: ayar hiç yazılmamış bir kurulumda ekran boş
    // kalmasın (`CLAUDE §4` — makul varsayılan, sorulmadan).
    const globalRow = rows.find((row) => row.scopeType === 'global');
    if (typeof globalRow?.value === 'string') global[key] = globalRow.value;

    byKey.set(
      key,
      new Map(
        rows
          .filter((row) => row.scopeType === 'zone' && row.scopeId && typeof row.value === 'string')
          .map((row) => [row.scopeId as string, row.value as string]),
      ),
    );
  });

  const byZone = new Map<string, ZoneHours>();
  for (const zoneId of zoneIds) {
    const hours = Object.fromEntries(
      DAY_HOUR_KEYS.map((key) => {
        const own = byKey.get(key)?.get(zoneId);
        return [key, own ? { time: own, isException: true } : { time: global[key], isException: false }];
      }),
    ) as ZoneHours;
    byZone.set(zoneId, hours);
  }

  return { byZone, global };
}
