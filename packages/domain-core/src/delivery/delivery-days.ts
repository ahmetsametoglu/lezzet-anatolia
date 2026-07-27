/**
 * Teslimat kararları (07.2) — DOMAIN §6.
 *
 * İki karar burada yaşar:
 * 1. **Rota içi mi?** Adresin posta kodu aktif bir bölgeye düşüyorsa rota içi, düşmüyorsa kargo.
 *    Bu bilgi hiçbir yerde SAKLANMAZ (adreste `in_route` kolonu yok) — bölge sınırı admin tarafından
 *    değiştirilebildiği için saklanan değer ertesi gün yalan olur.
 * 2. **Hangi gün?** Bölgenin haftalık günlerinden yaklaşan somut tarihler; **kesim saatinden sonra
 *    gelen sipariş bir SONRAKİ güne** yazılır. Araç yüklenirken gelen sipariş o günün rotasına
 *    düşmez — sabah kavgası biter.
 *
 * Saf: takvim ve kural. Bölge satırlarını çağıran getirir.
 */

/** Motorun karar için gördüğü asgari bölge alanları (DB karşılığı `DeliveryZone`). */
export interface DeliveryZoneCandidate {
  id: string;
  postalCodes: readonly string[];
  /** Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar. */
  weekdays: readonly number[];
  isActive?: boolean;
}

/** Posta kodu karşılaştırması biçimden etkilenmemeli: "67 000" ile "67000" aynı yerdir. */
function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Posta kodunun düştüğü **aktif** bölge; yoksa `null` → rota dışı, yani kargo.
 * Birden çok bölge aynı kodu içeriyorsa ilki kazanır (çakışma admin hatasıdır, sessizce seçilir
 * ama liste sırası deterministiktir).
 */
export function findZoneForPostalCode(
  postalCode: string,
  zones: readonly DeliveryZoneCandidate[],
): DeliveryZoneCandidate | null {
  const wanted = normalizePostalCode(postalCode);
  return zones.find((zone) => zone.isActive !== false && zone.postalCodes.some((code) => normalizePostalCode(code) === wanted)) ?? null;
}

/** Rota içi mi — `findZoneForPostalCode`'un evet/hayır hâli (çağrı yerini okunur kılar). */
export function isInRoute(postalCode: string, zones: readonly DeliveryZoneCandidate[]): boolean {
  return findZoneForPostalCode(postalCode, zones) !== null;
}

/** "HH:MM" → gün içi dakika. Bozuk değer akışı kilitlemesin diye `null` döner. */
function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface UpcomingDatesInput {
  /** Bölgenin haftalık günleri (ISO 1–7). Boşsa teslimat günü yoktur. */
  weekdays: readonly number[];
  now: Date;
  /** Kesim saati, "HH:MM" (parametrik `Setting`). Geçersizse kesim uygulanmaz. */
  cutoffTime?: string;
  /** Kaç somut tarih önerilecek (varsayılan 3). */
  count?: number;
  /** En fazla kaç gün ileriye bakılır — sonsuz döngü emniyeti (varsayılan 28). */
  horizonDays?: number;
}

/**
 * Yaklaşan somut teslimat tarihleri (ISO `YYYY-MM-DD`), en yakından başlayarak.
 *
 * **Bugün, ancak kesim saatinden ÖNCEYSE** aday olur: 09:00'da verilen sipariş bugünün rotasına
 * yetişir, 17:00'de verilen yetişmez. Kesim saati geçtiyse bugün atlanır.
 *
 * Çağıran sonuca göre davranır (DOMAIN §6): **tek tarih varsa gösterilir (seçim yok), birden
 * fazlaysa müşteri seçer.**
 */
export function upcomingDeliveryDates(input: UpcomingDatesInput): string[] {
  const { weekdays, now, cutoffTime, count = 3, horizonDays = 28 } = input;
  if (weekdays.length === 0) return [];

  const allowed = new Set(weekdays);
  const cutoff = cutoffTime ? minutesOfDay(cutoffTime) : null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Kesim saati geçtiyse bugün aday değildir; geçmediyse bugün de sayılır.
  const startOffset = cutoff !== null && nowMinutes >= cutoff ? 1 : 0;

  const dates: string[] = [];
  for (let offset = startOffset; offset <= horizonDays && dates.length < count; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    // getDay(): 0=Pazar → ISO'da 7.
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    if (allowed.has(isoWeekday)) dates.push(toIsoDate(day));
  }
  return dates;
}

/** Yerel takvim günü — `toISOString()` UTC'ye kaydırdığı için gün atlatabilir, elle biçimlenir. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
