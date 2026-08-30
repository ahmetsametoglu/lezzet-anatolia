/*
  TARİH SEÇİCİNİN SAF KURALI (Operasyon Mobil v3 · `00-ortak` — `sheetSkt`) — React'siz, testli.

  ── NİÇİN AYRI BİR SEÇİCİ, KLAVYE DEĞİL ─────────────────────────────────────
  SKT rampada, eldivenle, koliyi tutarken giriliyor ve klavyeyle yazılan tarih iki yerden
  bozulabiliyordu: yanlış tuş ("31.02") ve yanlış BİÇİM ("2.6.26" mi 6.2.26 mı). Seçicide ikisi de
  imkânsız — gün listesi ayın gerçek uzunluğu kadar, sıra sabit.

  ── KURALLAR BURADA, EKRANDA DEĞİL ──────────────────────────────────────────
  Ayın kaç gün çektiği, ay değişince günün kırpılması, yıl aralığı — üçü de tarih kuralıdır ve
  seçicinin nasıl çizildiğinden bağımsızdır. Ekranda dursaydı bir gün ikinci bir seçici açılır ve
  "31 Şubat" ihtimali onunla birlikte geri gelirdi.
*/

/** Seçicinin o anki hâli — üç sayı, henüz bir tarih olmak zorunda değil. */
export interface DateWheelValue {
  day: number;
  month: number;
  year: number;
}

/** Şubat 29'u da sayar: yıl seçici olduğu için artık yıl gerçekten gelebilir. */
export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Ay ya da yıl değişince GÜN kırpılır — 31 Ocak'tan Şubat'a geçen bir seçici "31 Şubat"ta
 * kalamaz. Kırpma sessizdir ve öyle olmalı: kullanıcının dokunduğu şey aydı, günü değiştirdiğini
 * ayrıca söylemek onu kendi hareketinden şüpheye düşürürdü — ekranda zaten yeni gün yazıyor.
 */
export function clampDay(value: DateWheelValue): DateWheelValue {
  const max = daysInMonth(value.month, value.year);
  return value.day <= max ? value : { ...value, day: max };
}

/** `{2026, 8, 30}` → `"2026-08-30"` — sözleşmenin taşıdığı biçim. */
export function toIsoDate(value: DateWheelValue): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

/** `"2026-08-30"` → seçicinin hâli; tanınmazsa `null` (uydurma bir tarihle açmaktansa bugünle). */
export function fromIsoDate(iso: string): DateWheelValue | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const value = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (value.month < 1 || value.month > 12) return null;
  if (value.day < 1 || value.day > daysInMonth(value.month, value.year)) return null;
  return value;
}

/**
 * Yıl sütununun aralığı: **bu yıldan başlar**, beş yıl ileri.
 *
 * Geçmiş yıl SUNULMAZ ve bu bir kısıtlama değil, seçicinin işini söylemesi: son kullanma tarihi
 * geleceğe bakar. Geçmiş tarihli mal gelirse (imhalık) o karar sayım/düzeltmenin işidir, kabulün
 * değil — burada geçmişi kolay yazılır kılmak, yanlışı kolaylaştırmak olurdu.
 */
export function yearRange(today: Date, span = 5): number[] {
  const first = today.getFullYear();
  return Array.from({ length: span + 1 }, (_, index) => first + index);
}

/** Gün sütunu — ayın gerçek uzunluğu kadar; "31 Şubat" listede hiç yok. */
export function dayRange(value: DateWheelValue): number[] {
  return Array.from({ length: daysInMonth(value.month, value.year) }, (_, index) => index + 1);
}

/**
 * Hızlı seçim çipleri (v3'ün `hizli` listesi).
 *
 * İlk çip **ölçülmüş** olandır: ürünün raf ömrü biliniyorsa "bugün üretilmiş" varsayımının tarihi
 * (bugün + raf ömrü) — depocunun elindeki koli çoğu zaman tazedir ve o tarih doğrudan doğru çıkar.
 * Ötekiler kısayoldur, veri değil: +3 ay · +6 ay · +1 yıl. Raf ömrü bilinmiyorsa ilk çip HİÇ
 * çizilmez — uydurma bir "beklenen SKT", depocuya doğrulanmış bir tarih gibi görünürdü.
 */
export function quickPicks(today: Date, shelfLifeDays: number | null): { label: string; value: DateWheelValue }[] {
  const picks: { label: string; value: DateWheelValue }[] = [];
  if (shelfLifeDays !== null && shelfLifeDays > 0) {
    picks.push({ label: `raf ömrü · ${shelfLifeDays} gün`, value: addDays(today, shelfLifeDays) });
  }
  picks.push({ label: '+3 ay', value: addMonths(today, 3) });
  picks.push({ label: '+6 ay', value: addMonths(today, 6) });
  picks.push({ label: '+1 yıl', value: addMonths(today, 12) });
  return picks;
}

function addDays(from: Date, days: number): DateWheelValue {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return { day: next.getDate(), month: next.getMonth() + 1, year: next.getFullYear() };
}

function addMonths(from: Date, months: number): DateWheelValue {
  // Ayın son gününden ay eklerken taşma olmasın diye 1'inden hesaplanır, sonra gün geri konur.
  const anchor = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const value = { day: from.getDate(), month: anchor.getMonth() + 1, year: anchor.getFullYear() };
  return clampDay(value);
}
