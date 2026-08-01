import type { Country } from '@lezzet/types';

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

/**
 * Motorun karar için gördüğü asgari bölge alanları (DB karşılığı `DeliveryZoneWithCodes`).
 *
 * Posta kodu artık `(ülke, kod)` ikilisidir (DOMAIN §17): `67000` hem Fransa'da hem Almanya'da
 * geçerlidir, ülkesiz bir kod eksik bir sorudur. Bir bölge İKİ ülkenin kodlarını kapsayabilir
 * (ADR-002 — Strasbourg rotası Kehl'i de alabilir), bu yüzden ülke bölgede değil kodda durur.
 */
export interface DeliveryZoneCandidate {
  id: string;
  postalCodes: readonly PostalCodeRef[];
  /** Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar. */
  weekdays: readonly number[];
  isActive?: boolean;
}

export interface PostalCodeRef {
  country: Country;
  postalCode: string;
}

/** Posta kodu karşılaştırması biçimden etkilenmemeli: "67 000" ile "67000" aynı yerdir. */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Bir yeri kapsayan **aktif** bölgelerin tamamı.
 *
 * Tekil değil ÇOĞUL döner ve bu bilinçlidir: "kaç bölge eşleşti" sorusunun cevabı kararın kendisi
 * kadar önemli. Bir kod iki aktif bölgede duruyorsa hangisinin geçerli olduğu BİLİNMEZ ve bunu
 * çözmek çağıranın işidir — rota günü sorarken sessizce birini seçmek kabul edilebilir, depo
 * seçerken değil (yanlış depo = mal başka şehirde). Tek kaynak burada, yorum orada.
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
 * Posta kodunun düştüğü **aktif** bölge; yoksa `null` → rota dışı, yani kargo.
 *
 * Çakışmada ilki döner: bu okumanın sorusu "hangi gün teslim edilir" ve iki bölgenin günleri
 * arasında seçim yapmak, sipariş yanlış depoya düşmesinden çok daha ucuz bir hatadır. Depo
 * çözümü aynı belirsizlikte HATA verir (`resolveWarehouseForPostalCode`) — soru farklı olduğu
 * için cevap da farklı.
 */
export function findZoneForPostalCode(
  place: PostalCodeRef,
  zones: readonly DeliveryZoneCandidate[],
): DeliveryZoneCandidate | null {
  return matchZones(place, zones)[0] ?? null;
}

/** Rota içi mi — `findZoneForPostalCode`'un evet/hayır hâli (çağrı yerini okunur kılar). */
export function isInRoute(place: PostalCodeRef, zones: readonly DeliveryZoneCandidate[]): boolean {
  return findZoneForPostalCode(place, zones) !== null;
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
