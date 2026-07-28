// Takvimin SAF matematiği — komponentsiz, testli. Izgara kurma, ay adı, önayarlı aralıklar.
//
// Değer biçimi her yerde `YYYY-MM-DD`: bir TAKVİM GÜNÜ, an değil. Kupon "31 Temmuz'a kadar" derken
// bir gün kasteder; saat/dilim taşımak bu günü kaydırır.
//
// **Yerel gün, UTC değil.** `new Date('2026-07-31')` UTC gece yarısı olarak ayrıştırılır ve
// GMT+3'te ekranda 31 Temmuz görünse de GMT-5'te 30 Temmuz'a düşer. Bu yüzden ayrıştırma da
// biçimleme de yerel yapıcıdan geçer (`new Date(y, m, d)`) — parti son tarihleri bunun TERSİ bir
// karar kullanır (`shortDate` UTC okur) ve sebebi farklıdır: orası DB'de saklanan bir andır,
// burası kullanıcının seçtiği gün.

/** Haftanın günleri — pazartesi başlar (FR/TR takvim alışkanlığı). */
export const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'] as const;

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** `YYYY-MM-DD` → yerel Date (gün başı). Geçersiz metin `null` — uydurma tarih üretilmez. */
export function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date → `YYYY-MM-DD` (yerel alanlardan; `toISOString` UTC'ye kaydırırdı). */
export function toDay(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** "24 Tem 2026" — tetikleyicide görünen hâl. */
export function formatDay(iso: string | null | undefined): string {
  const date = parseDay(iso);
  if (!date) return '';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Temmuz 2026" — takvim başlığı. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** Aya ekleme/çıkarma; ay taşması yıla yansır. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export interface CalendarCell {
  /** `YYYY-MM-DD` — hücrenin günü. */
  day: string;
  /** Ayın günü (1–31). */
  label: number;
  /** Gösterilen ayın DIŞINDA mı (önceki/sonraki ayın dolgu günleri). */
  outside: boolean;
}

/**
 * Bir ayın 6×7 ızgarası — hep 42 hücre.
 *
 * Sabit yükseklik bilinçli: hücre sayısı aya göre değişseydi takvim açıkken ay değiştirmek
 * kutuyu zıplatırdı ve altındaki düğmeler kayardı. Komşu ayların günleri "outside" olarak gelir;
 * seçilebilirler (ayın sonundan başına geçmek tek tıklama olsun).
 */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  // Pazartesi 0 olacak şekilde kaydır: JS'te pazar 0'dır.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { day: toDay(date), label: date.getDate(), outside: date.getMonth() !== month };
  });
}

interface RangePreset {
  key: string;
  label: string;
  /** `today` DIŞARIDAN verilir: aynı açılışın tüm önayarları AYNI güne göre hesaplansın. */
  range: (today: Date) => { from: string; to: string };
}

/**
 * Önayarlı aralıklar (tasarım). "Özel…" burada YOK: o bir önayar değil, hiçbirine uymayan
 * seçimin adıdır — ekran onu etiket olarak gösterir, tıklanacak bir şey olarak değil.
 */
export const RANGE_PRESETS: RangePreset[] = [
  {
    key: 'today',
    label: 'Bugün',
    range: (today) => ({ from: toDay(today), to: toDay(today) }),
  },
  {
    key: 'days7',
    label: 'Son 7 gün',
    range: (today) => ({ from: toDay(addDays(today, -6)), to: toDay(today) }),
  },
  {
    key: 'days30',
    label: 'Son 30 gün',
    range: (today) => ({ from: toDay(addDays(today, -29)), to: toDay(today) }),
  },
  {
    key: 'thisMonth',
    label: 'Bu ay',
    range: (today) => ({
      from: toDay(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: toDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    }),
  },
  {
    key: 'lastMonth',
    label: 'Geçen ay',
    range: (today) => ({
      from: toDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: toDay(new Date(today.getFullYear(), today.getMonth(), 0)),
    }),
  },
];

/** Seçili aralık hangi önayara denk düşüyor — hiçbiri ise `null` ("Özel"). */
export function matchingPreset(from: string, to: string, today: Date): string | null {
  if (!from || !to) return null;
  for (const preset of RANGE_PRESETS) {
    const r = preset.range(today);
    if (r.from === from && r.to === to) return preset.key;
  }
  return null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
