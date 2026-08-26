import 'server-only';
import {
  POINTS_DEFAULTS,
  awardFeedbackPoints as awardFeedbackPointsFor,
  awardPoints as awardPointsFor,
  awardReferralPoints as awardReferralPointsFor,
} from '@lezzet/application';
import { PointsBalanceService, PointsEntryService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import {
  POINTS_CENT_VALUE_KEY,
  POINTS_DAILY_CAP_DEFAULT,
  POINTS_DAILY_CAP_KEY,
  POINTS_REDEEM_MIN_KEY,
  POINTS_SETTING_KEYS,
  anchorStateOf,
  canOpenHistory,
  canRedeem,
  redemptionCode,
  type EarnablePointsReason,
} from '@lezzet/domain-core';
import type { KeysetCursor, Page, PointsBalance, PointsEntry, ProductFeedback, RedemptionResult } from '@lezzet/types';

/**
 * Puan kapıları (17.4, 17.5) — motor karar verir, defter yazar, burası ikisini birleştirir.
 *
 * **Puan verme SESSİZ başarısız olur ve bu bilinçlidir.** Müşteri yorumunu yazdı, beğenisini
 * verdi; günlük tavana takıldıysa ya da B2B olduğu için kazanamıyorsa asıl işlem yine de
 * tamamlanmalı. "Puan verilemedi" diye bir yorumu geri çevirmek, değerli veriyi ödül mekaniğine
 * feda etmek olurdu — ödül aksiyonu teşvik eder, ona şart koşmaz (DOMAIN §14).
 */

/** Puan ayarları tek turda — her aksiyonda üç ayrı ayar sorgusu atmamak için. */
/**
 * Bir aksiyonun kaç puan ettiği + puanın kuruş değeri — EKRANIN sorusu (08.7 keşif bitiş kartı).
 *
 * Ayarı okumanın ikinci bir yolunu açmamak için buradan veriliyor: anahtar adı ve varsayılan tek
 * yerde (`pointsSettings`) yaşıyor. Ekran kendi `getNumber('points_feedback_candidate', 2)`
 * çağrısını yazsaydı varsayılan iki yerde durur ve biri bir gün ötekinden ayrılırdı — ekran
 * sistemin vermeyeceği bir sayı söylerdi (hesap kartındaki eşik ayrışmasının aynısı, 29.07).
 */
export async function pointsValueOf(reason: EarnablePointsReason): Promise<{ points: number; centValue: number }> {
  const settings = await pointsSettings();
  return { points: settings.values[reason] ?? 0, centValue: settings.centValue };
}

async function pointsSettings(): Promise<{ values: Record<string, number>; dailyCap: number; minimum: number; centValue: number }> {
  const settings = new SettingsService(serviceDb());
  // VARSAYILANLAR PAKETTEN (17.11): burada kendi tablosu vardı ve 11.08'in değer merdiveninden
  // (getiren 500, komşu 100) habersizdi — ayar satırı yazılmamış bir kurulumda ekran 50 der, motor
  // 500 yazardı. İki kopya bugün ayrışmıştı bile; 29.07 denetiminin kapattığı arıza sınıfının aynısı.
  const [review, purchase, candidate, referral, neighbor, visit, dailyCap, minimum, centValue] = await Promise.all([
    settings.getNumber(POINTS_SETTING_KEYS.review, POINTS_DEFAULTS.review),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_purchase, POINTS_DEFAULTS.feedback_purchase),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_candidate, POINTS_DEFAULTS.feedback_candidate),
    settings.getNumber(POINTS_SETTING_KEYS.referral, POINTS_DEFAULTS.referral),
    settings.getNumber(POINTS_SETTING_KEYS.neighbor, POINTS_DEFAULTS.neighbor),
    settings.getNumber(POINTS_SETTING_KEYS.visit, POINTS_DEFAULTS.visit),
    // Anahtar ve tavan varsayılanı MOTORDAN (`@lezzet/domain-core`), literal değil: burada
    // `'points_daily_cap', 100` yazıyordu ve kullanıcı tavanı 270'e çıkarınca sessizce geride
    // kaldı — motorun uygulamadığı bir eşiği gösteren bir kapı. `POINTS_SETTING_KEYS` zaten
    // buradan okunuyordu; kalan üç literal de köprü olmaktan çıktı (domain-core künyesi:
    // *"benimsemesi web şeridinin işi"*).
    settings.getNumber(POINTS_DAILY_CAP_KEY, POINTS_DAILY_CAP_DEFAULT),
    settings.getNumber(POINTS_REDEEM_MIN_KEY, 500),
    settings.getNumber(POINTS_CENT_VALUE_KEY, 1),
  ]);
  return {
    values: { review, feedback_purchase: purchase, feedback_candidate: candidate, referral, neighbor, visit },
    dailyCap,
    minimum,
    centValue,
  };
}

/**
 * Bir aksiyona puan yazar — **KÖPRÜ** (17.11). Kural `@lezzet/application/feedback/points`ta.
 *
 * ── KOPYAYDI, ÖLÇÜMLE KÖPRÜYE DÖNDÜ ─────────────────────────────────────────
 * Bu gövde 21.21'deki terfiden sonra da burada yazılı kalmaya devam etti: aynı beş adım (tekillik
 * nezaketi → profil → motor → yazım → `23505` yutma) hem burada hem paketteydi. Bedeli 12.08'de
 * ölçüldü ve **iki ayrı yerden birden** çıktı:
 *
 *   1. **Günlük tavan kuralı** (kullanıcı onayı 11.08: *parayla gelen ödüller tavanın dışındadır*)
 *      pakete yazıldı, buraya yazılmadı. Web'in yazdığı ziyaret/geri bildirim puanları eski kuralla
 *      koşmaya devam ederdi ve fark hiçbir yerde hata vermezdi.
 *   2. **Değer merdiveni** (getiren 500, komşu 100) pakette güncellendi, buradaki tablo `50`de
 *      kalmıştı — ekranın söylediği ile motorun yazdığı sayı ayrışırdı.
 *
 * `order-payment.ts`in 17.9'da yaşadığının aynısı. Kapı tek olunca ikisi de kendiliğinden düzeldi.
 *
 * **Köprü NEDEN duruyor:** `serviceDb()` enjeksiyonu — paket `db`yi çağırandan ister (test
 * edilebilir olsun diye); web'in dört çağıranı (ziyaret · keşif · ürün geri bildirimi · davet) her
 * seferinde onu yazmasın diye tek satırlık kapılar burada duruyor.
 */
export function awardPoints(input: { customerId: string; reason: EarnablePointsReason; refId?: string }): Promise<PointsEntry | null> {
  return awardPointsFor(serviceDb(), input);
}

/**
 * Geri bildirim kaydına puan yazar — sebebi **içerikten** çözerek (metin varsa yorum puanı).
 *
 * Kimliksiz kayıt (ziyaretçi kaydırması) puan doğurmaz: ödülün sahibi yok. Kural pakette;
 * burası köprü.
 */
export function awardFeedbackPoints(feedback: ProductFeedback): Promise<PointsEntry | null> {
  return awardFeedbackPointsFor(serviceDb(), feedback);
}

/**
 * **Günlük ziyaret puanı** (17.4 · müşteri şeridinin talebi) — günde bir kez, 10 puan (parametrik).
 *
 * Oy puanından AYRI bir enstrüman ve ayrılması şart: oy puanı ürün başına tek kalır (her ziyarette
 * yeniden ödemek, `signal-quality`'nin bastırmak için var olduğu davranışı satın almak olurdu),
 * bu ise geri getirme ödülüdür. Defter böylece dürüst kalıyor — "veri bedeli" ile "gelme bedeli"
 * ayrı satırlarda duruyor ve aday panosunu okuyan ikisini karıştırmıyor.
 *
 * **İkinci geliş sessizce boş döner** (`null`), hata değil: gün içinde ikinci ziyaret bir arıza
 * değil normal davranıştır. Ekran dönen değere bakar — doluysa "10 puan kazandın" der, boşsa hiçbir
 * şey demez.
 */
export function awardVisitPoints(customerId: string): Promise<PointsEntry | null> {
  return awardPoints({ customerId, reason: 'visit' });
}

// KÖPRÜ KALKTI (17.9): `rewardCompletedOrder` artık YOK — sipariş puanı kaldırıldı, getirenin
// ödülü de ödeme durumunun türetildiği yerde doğuyor (`application/order/payment.ts` → `finalize`).
// Ödül ortak paketin İÇİNDEN çağrıldığı için web'in bir köprüye ihtiyacı kalmadı; köprüyü
// bırakmak, hiç çağrılmayan bir kapıyı bakımda tutmak olurdu.

/** Müşterinin bakiyesi; hiç hareketi yoksa sıfır (null dolaştırılmaz). */
export async function getPointsBalance(customerId: string): Promise<PointsBalance> {
  const row = await new PointsBalanceService(serviceDb()).getByCustomer(customerId);
  return row ?? { customerId, balance: 0, earned: 0, spent: 0, redemptionCount: 0, lastActivityAt: new Date(0).toISOString() };
}

/** Müşterinin puan geçmişi — hesap sayfasındaki "kazandın / harcadın" listesi. */
export function listPointsHistory(customerId: string, cursor?: KeysetCursor, limit?: number): Promise<Page<PointsEntry>> {
  return new PointsEntryService(serviceDb()).listByCustomer(customerId, cursor, limit);
}

/**
 * **Puan → kişisel kupon** (17.5). Müşteri kendi isteyince çevirir, otomatik değil: biriken puanı
 * kendiliğinden bozmak, daha büyük bir ödül için biriktirme kararını elinden almaktır.
 *
 * Karar motorda, uygulama RPC'de: puan düşümü ve kuponun doğuşu bölünemez.
 */
export async function redeemPoints(input: { customerId: string; points?: number }): Promise<RedemptionResult> {
  const db = serviceDb();
  const [profile, balance, settings] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    getPointsBalance(input.customerId),
    pointsSettings(),
  ]);
  if (!profile) return { ok: false, reason: 'not_eligible' };

  // ── KİMLİK KAPISI (04.10, DOMAIN §10) ─────────────────────────────────────────────────────────
  // Puanı harcatmak kapılı üç yetkiden biri. Kapı BURAYA da konuyor çünkü çevirmenin iki gövdesi
  // var (web'in bu yolu · `application/customer/points.ts` → mobil) ve tek yerde durursa kural
  // yalnız bir kapıda geçerli olurdu — yarısı kapalı bir kapı, kapı değildir.
  // BEKLEYEN(04.10): çevirmenin iki gövdesi tekleşmeli — ayrıntı ve yön 17.5'in durum notunda.
  // Tekleşene kadar bu kapı ile `application/customer/points.ts`teki eşi BİRLİKTE hareket eder.
  //
  // Ret kodu burada KABA (`not_eligible`): bu yolun sözlüğünde ayrı bir değer yok ve müşteri zaten
  // tek bir "şu an çevrilemiyor" cümlesi görüyor (`redeem_unavailable`). Bugünkü tek çağıran oturum
  // açmış müşteri, yani pratikte bu dal kapalı; ayrı bir kod uydurmak, kimsenin görmediği bir
  // sözlüğü büyütmek olurdu.
  if (!canOpenHistory(anchorStateOf(profile))) return { ok: false, reason: 'not_eligible' };

  const check = canRedeem({
    customerType: profile.type,
    balance: balance.balance,
    requestedPoints: input.points,
    minimum: settings.minimum,
    centValue: settings.centValue,
  });
  if (!check.allowed) {
    // `b2b` dışarı motor sözlüğüyle sızmaz: müşteri "programa dahil değilsiniz" cümlesini görür.
    return { ok: false, reason: check.reason === 'b2b' ? 'not_eligible' : check.reason };
  }

  // Kod motorda üretilir, benzersizliği veritabanı söyler. Çakışma astronomik ölçüde nadirdir
  // (26^6) ama imkânsız değil: çarpışmada yeni kodla yeniden denenir — `generateReferenceNo` ile
  // aynı sözleşme. Üç deneme sonrası ısrar etmenin anlamı yok, ortada başka bir sorun vardır.
  const entries = new PointsEntryService(db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await entries.redeem({
        customerId: input.customerId,
        points: check.pointsSpent,
        valueCents: check.valueCents,
        minimum: settings.minimum,
        code: redemptionCode(),
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== '23505') throw err; // unique ihlali değilse bizim sorunumuz değil
    }
  }
  throw new Error('redeemPoints: benzersiz kupon kodu üretilemedi');
}

/**
 * Personelin elle puan düzeltmesi (jest ya da hata telafisi) — **iz kaydıyla**.
 *
 * Sebep zorunlu ve DB de bunu zorlar: "neden 50 puan verildi" sorusunun cevabı altı ay sonra da
 * durmalı. Tavan ve B2B kuralı BURADA UYGULANMAZ; bu bir kazanım değil bir karardır ve kararı
 * veren insan zaten sebebini yazıyor.
 */
export async function adjustPointsManually(input: {
  customerId: string;
  points: number;
  note: string;
  staffId: string;
}): Promise<{ ok: true; data: PointsEntry } | { ok: false; reason: string }> {
  if (input.points === 0) return { ok: false, reason: 'zero_points' };
  if (input.note.trim().length === 0) return { ok: false, reason: 'note_required' };

  const entry = await new PointsEntryService(serviceDb()).insert({
    customerId: input.customerId,
    points: input.points,
    reason: 'manual',
    note: input.note.trim(),
    createdBy: input.staffId,
  });
  return { ok: true, data: entry };
}

/**
 * **Getiren müşteriye puan** (17.7) — **köprü**. Gövde `@lezzet/application`ın `feedback/points`i;
 * künye orada: `refId` YENİ müşterinin kimliğidir, getirenin değil.
 *
 * Bu köprü normal akışta ÇAĞRILMAZ — ödül ödeme yolunda kendiliğinden doğuyor (17.9). Duruyor,
 * çünkü elle düzeltme yolları (destek, operasyon) tek bir müşterinin ödülünü yeniden denemek
 * isteyebilir ve o zaman ikinci bir kapı açmak yerine bu kullanılır.
 */
export function awardReferralPoints(newCustomerId: string): Promise<PointsEntry | null> {
  return awardReferralPointsFor(serviceDb(), newCustomerId);
}

/**
 * Operasyon puan tablosu — kim ne kadar biriktirmiş (genel resim, istisna avı değil).
 *
 * `since` (ISO) verilirse **o dönemin DELTA'sı** okunur, cüzdan bakiyesi değil: 30 günlük pencerede
 * "bakiye" diye bir sayı yoktur, o dönemde kazanılan eksi harcanan vardır. Ekranın başlığı zaten
 * dönemi yazıyor (operasyon talebi 03.08 — seçici bu okuma olmadığı için hiç çizilememişti).
 */
export function listTopPointsBalances(limit?: number, since?: string): Promise<PointsBalance[]> {
  return new PointsBalanceService(serviceDb()).listTop(limit, since);
}
