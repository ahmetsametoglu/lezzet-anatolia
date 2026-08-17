import { normalizePostalCode } from '@lezzet/helper';
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

// Posta kodu normalizasyonu `@lezzet/helper`'a taşındı (denetim A2): aynı gövde üç katmanda
// yazılıydı ve biri ayrışsaydı aynı kod iki katmanda farklı depoya çözülürdü — sessizce.

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

/**
 * **Kesim kuralının okuduğu iki ayar** — anahtar ve fabrika değeri BURADA, çünkü kuralı uygulayan
 * dosya bu. Değerler bir dönem her çağıranın içinde ayrı yazılıydı (`'16:00'` üç yerde) ve
 * ayrışsalardı müşteriye söylenen gün ile sistemin uyguladığı gün farklılaşırdı — hiçbir hata
 * vermeden (`CLAUDE §1`).
 *
 * Öteki iki eşik (rota çıkışı · kurye kapanışı) burada YOK ve bu bilinçli: onları hiçbir motor
 * okumuyor, yalnız ekran gösteriyor. Bir gün bir karar onlara bağlanırsa buraya gelirler.
 */
export const ORDER_CUTOFF_KEY = 'order_cutoff_time';
export const PREP_CUTOFF_KEY = 'prep_cutoff_time';
export const ORDER_CUTOFF_DEFAULT = '16:00';
export const PREP_CUTOFF_DEFAULT = '11:00';

/**
 * **Kesim TESLİM gününün mü, bir ÖNCEKİ günün mü saati** (kullanıcı kuralı 17.08).
 *
 * Kural: kesim hazırlık kapanışından **sonraysa** önceki günün saatidir — o saatte gelen sipariş bu
 * günün hazırlığına yetişemez, demek ki bu güne teslim için kapanış dünden olmalı. Öncesindeyse (ve
 * **eşitse** — kullanıcı onayı: "sonra" kesin eşitsizlik) aynı günün saatidir.
 *
 * Yani "hangi gün" ayrı bir ayar DEĞİL, iki saatin karşılaştırmasından türüyor. Bunun iki faydası
 * ölçüldü: (1) operatörün girdiği her değer tutarlı bir yorum buluyor, çelişki yapısal olarak
 * imkânsızlaşıyor; (2) bugünkü kurulum hiç değişmiyor — seed'in rota kesimi 10:00, hazırlık 11:00,
 * yani aynı gün kalır.
 *
 * **Biri eksikse `false`:** karşılaştırma yapılamıyorsa eski davranış (aynı gün) sürer. Kuralı
 * yarım veriyle uygulamak, teslim gününü sessizce bir gün kaydırırdı.
 *
 * Dışa açık, çünkü aynı soruyu EKRAN da soruyor (rota şeridi kesim rozetini "önceki gün" diye
 * damgalıyor). İki yerde ayrı hesaplanırsa biri bir gün ayrışır ve ekran yanlış damga basar.
 */
export function cutoffBelongsToPreviousDay(cutoffTime?: string, prepCutoffTime?: string): boolean {
  const cutoff = cutoffTime ? minutesOfDay(cutoffTime) : null;
  const prep = prepCutoffTime ? minutesOfDay(prepCutoffTime) : null;
  if (cutoff === null || prep === null) return false;
  return cutoff > prep;
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
  /**
   * Hazırlık kapanışı, "HH:MM" — kesimin hangi güne ait olduğunu bu belirliyor
   * (`cutoffBelongsToPreviousDay`). Verilmezse kesim aynı günün saati sayılır (eski davranış).
   */
  prepCutoffTime?: string;
  /** Kaç somut tarih önerilecek (varsayılan 3). */
  count?: number;
  /** En fazla kaç gün ileriye bakılır — sonsuz döngü emniyeti (varsayılan 28). */
  horizonDays?: number;
}

/**
 * Yaklaşan somut teslimat tarihleri (ISO `YYYY-MM-DD`), en yakından başlayarak.
 *
 * **Kesim AYNI günün saatiyse** (hazırlık kapanışından önce) bugün, ancak kesimden önceyse aday
 * olur: 09:00'da verilen sipariş bugünün rotasına yetişir, 17:00'de verilen yetişmez.
 *
 * **Kesim ÖNCEKİ günün saatiyse** (hazırlıktan sonra — `cutoffBelongsToPreviousDay`) bugün HİÇ aday
 * olmaz: bu günün kesimi dün kapandı. Yarın ise ancak bugünün kesimi gelmediyse aday olur. Örnek —
 * kesim 16:00, hazırlık 11:00: Pazartesi 15:00'te Salı hâlâ açık, 17:00'de kapanır ve en erken gün
 * Çarşamba'ya (ya da rotanın bir sonraki gününe) kayar.
 *
 * Çağıran sonuca göre davranır (DOMAIN §6): **tek tarih varsa gösterilir (seçim yok), birden
 * fazlaysa müşteri seçer.**
 */
export function upcomingDeliveryDates(input: UpcomingDatesInput): string[] {
  const { weekdays, now, cutoffTime, prepCutoffTime, count = 3, horizonDays = 28 } = input;
  if (weekdays.length === 0) return [];

  const allowed = new Set(weekdays);
  const cutoff = cutoffTime ? minutesOfDay(cutoffTime) : null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const passed = cutoff !== null && nowMinutes >= cutoff;
  /**
   * Kaçıncı günden başlanacağı — kesimin AİT OLDUĞU güne göre.
   *
   * Aynı gün kuralında taban bugündür (kesim geçtiyse yarın). Önceki gün kuralında taban yarındır
   * (bugünün kesimi dün kapandı); bugünün kesimi de geçtiyse yarın kapanmış olur ve taban öbür güne
   * çıkar. Kesim hiç yoksa kural uygulanmaz, bugün de aday.
   */
  const startOffset = cutoff === null ? 0 : cutoffBelongsToPreviousDay(cutoffTime, prepCutoffTime) ? (passed ? 2 : 1) : passed ? 1 : 0;

  const dates: string[] = [];
  for (let offset = startOffset; offset <= horizonDays && dates.length < count; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    // getDay(): 0=Pazar → ISO'da 7.
    const isoWeekday = day.getDay() === 0 ? 7 : day.getDay();
    if (allowed.has(isoWeekday)) dates.push(toIsoDate(day));
  }
  return dates;
}

/**
 * Bir SEFER hâlâ sipariş kabul ediyor mu (17.10 — komşu daveti).
 *
 * Sefer = `(bölge, tarih)`. Ayrı bir kural DEĞİL, `upcomingDeliveryDates`in aynı kuralının tekil
 * hâli: bugünün seferi ancak kesim saatinden önce açıktır, gelecek günler açık, geçmiş günler
 * kapalı. İkisi ayrı yazılsaydı komşu daveti müşteriye "bu sefere yetişirsin" der, checkout aynı
 * günü listesinde hiç göstermezdi — ve fark yalnız kesim saati civarında görünürdü.
 *
 * Cevap üç hâlli, çünkü ekranın kuracağı cümle üçünde de ayrı: **`open`** davet çalışır ·
 * **`cutoff_passed`** bugün için geç kalındı (yarın başka bir sefer olabilir) · **`past`** sefer
 * geçmişte kaldı.
 */
export type DeliveryRunWindow = 'open' | 'cutoff_passed' | 'past';

export function deliveryRunWindow(input: {
  deliveryDate: string;
  now: Date;
  cutoffTime?: string;
  /** Hazırlık kapanışı — kesimin hangi güne ait olduğunu belirler (`upcomingDeliveryDates` ile aynı). */
  prepCutoffTime?: string;
}): DeliveryRunWindow {
  const today = toIsoDate(input.now);
  if (input.deliveryDate < today) return 'past';

  // Kesim saati yoksa (ya da bozuksa) kural uygulanmaz — `upcomingDeliveryDates`in davranışıyla
  // birebir; bozuk bir ayar akışı kilitlemez.
  const cutoff = input.cutoffTime ? minutesOfDay(input.cutoffTime) : null;
  if (cutoff === null) return 'open';
  const nowMinutes = input.now.getHours() * 60 + input.now.getMinutes();

  if (!cutoffBelongsToPreviousDay(input.cutoffTime, input.prepCutoffTime)) {
    // AYNI gün kuralı: yalnız bugünün seferi kesime bakar.
    if (input.deliveryDate > today) return 'open';
    return nowMinutes < cutoff ? 'open' : 'cutoff_passed';
  }

  /**
   * ÖNCEKİ gün kuralı: teslim günü D'nin kesimi D−1 günündedir.
   * · D = bugün → kesim dün kapandı, sefer artık sipariş almaz
   * · D = yarın → kesim BUGÜN; saat geçtiyse kapalı
   * · D > yarın → kesim henüz gelmedi
   */
  const tomorrow = toIsoDate(new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() + 1));
  if (input.deliveryDate === today) return 'cutoff_passed';
  if (input.deliveryDate === tomorrow) return nowMinutes < cutoff ? 'open' : 'cutoff_passed';
  return 'open';
}

/** Yerel takvim günü — `toISOString()` UTC'ye kaydırdığı için gün atlatabilir, elle biçimlenir. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
