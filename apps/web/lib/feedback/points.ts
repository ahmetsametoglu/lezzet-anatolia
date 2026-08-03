import 'server-only';
import { PointsBalanceService, PointsEntryService, SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import {
  POINTS_SETTING_KEYS,
  canEarnPoints,
  canRedeem,
  feedbackPointsReason,
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
  const [review, purchase, candidate, order, referral, visit, dailyCap, minimum, centValue] = await Promise.all([
    settings.getNumber(POINTS_SETTING_KEYS.review, 20),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_purchase, 5),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_candidate, 2),
    settings.getNumber(POINTS_SETTING_KEYS.order, 10),
    settings.getNumber(POINTS_SETTING_KEYS.referral, 50),
    settings.getNumber(POINTS_SETTING_KEYS.visit, 10),
    settings.getNumber('points_daily_cap', 100),
    settings.getNumber('points_redeem_min', 500),
    settings.getNumber('points_cent_value', 1),
  ]);
  return {
    values: { review, feedback_purchase: purchase, feedback_candidate: candidate, order, referral, visit },
    dailyCap,
    minimum,
    centValue,
  };
}

/**
 * Bir aksiyona puan yazar — **kazanamıyorsa sessizce geçer** (`null` döner).
 *
 * Aynı kaynaktan ikinci kez puan verilmez: defterdeki tekillik `(müşteri, sebep, kaynak)`
 * üzerinde ve veritabanı seviyesinde. Burada da bakılır ama o bir NEZAKET — asıl güvence indekste,
 * çünkü ikinci bir yazma yolu açıldığı gün buradaki kontrol atlanabilir.
 */
export async function awardPoints(input: {
  customerId: string;
  reason: EarnablePointsReason;
  /**
   * Kaynak satır. **Kaynaksız sebeplerde verilmez** (`SOURCELESS_POINTS_REASONS`) — ziyaretin
   * işaret edeceği bir satır yok ve `ref_id`ye tarihten türetilmiş sentetik bir uuid yazmak, o
   * kolonun sözleşmesini ("kaynak satır") okuyan herkesi yanıltırdı.
   */
  refId?: string;
}): Promise<PointsEntry | null> {
  const db = serviceDb();
  const entries = new PointsEntryService(db);

  // Tekillik iki AYRI indekste duruyor, çünkü iki ayrı soru: kaynaklı sebepte "bu satırdan zaten
  // verildi mi" (`points_entry_source_key`), kaynaksızda "bugün zaten verildi mi"
  // (`points_entry_visit_day`). Buradaki kontroller ikisinin de NEZAKETİ — asıl güvence veritabanında,
  // çünkü ikinci bir yazma yolu açıldığı gün buradaki kontrol atlanabilir.
  const zatenVar = input.refId
    ? await entries.hasEntryFor(input.customerId, input.reason, input.refId)
    : await entries.hasEntryOnUtcDate(input.customerId, input.reason);
  if (zatenVar) return null;

  const [profile, settings] = await Promise.all([new UserProfileService(db).getById(input.customerId), pointsSettings()]);
  if (!profile) return null;

  const check = canEarnPoints({
    customerType: profile.type,
    actionPoints: settings.values[input.reason] ?? 0,
    earnedToday: await entries.earnedToday(input.customerId),
    dailyCap: settings.dailyCap,
  });
  // B2B, tavan ya da değersiz aksiyon — hiçbiri asıl işlemi durdurmaz.
  if (!check.allowed) return null;

  try {
    return await entries.insert({ customerId: input.customerId, points: check.points, reason: input.reason, refId: input.refId });
  } catch (error) {
    // **Yarışta da sessiz.** Yukarıdaki `hasEntryFor` ile bu yazım arasında kilit yok: müşteri
    // "Gönder"e iki kez basarsa iki istek de "puan yok" görür, biri yazar, öteki tekillik ihlaliyle
    // (`23505`) düşer. Bu istisna yukarı çıksaydı yorum KAYDEDİLMİŞKEN ekrana hata gelirdi —
    // dosyanın baştaki sözünün tam tersi. İkinci yazımın engellenmesi zaten doğru sonuçtur.
    if ((error as { code?: string })?.code === '23505') return null;
    throw error;
  }
}

/**
 * Geri bildirim kaydına puan yazar — sebebi **içerikten** çözerek (metin varsa yorum puanı).
 *
 * Kimliksiz kayıt (ziyaretçi kaydırması) puan doğurmaz: ödülün sahibi yok.
 */
export function awardFeedbackPoints(feedback: ProductFeedback): Promise<PointsEntry | null> {
  if (!feedback.customerId) return Promise.resolve(null);
  const reason = feedbackPointsReason({
    context: feedback.context,
    hasText: (feedback.comment?.trim().length ?? 0) > 0,
  });
  return awardPoints({ customerId: feedback.customerId, reason, refId: feedback.id });
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

/** Müşterinin bakiyesi; hiç hareketi yoksa sıfır (null dolaştırılmaz). */
export async function getPointsBalance(customerId: string): Promise<PointsBalance> {
  const row = await new PointsBalanceService(serviceDb()).getByCustomer(customerId);
  return row ?? { customerId, balance: 0, earned: 0, spent: 0, lastActivityAt: new Date(0).toISOString() };
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
 * **Getiren müşteriye puan** (17.7). Yeni müşteri `referredBy` doluysa getirene bir kez yazılır.
 *
 * `refId` YENİ müşterinin kimliğidir, getirenin değil: tekillik "aynı kişiyi iki kez getiremezsin"
 * demeli. Getirenin kimliğini kaynak yapsaydık, ikinci bir davet hiç puan doğurmazdı.
 *
 * Çağrı yeri kayıt akışıdır (04); zemin burada hazır durur.
 */
export async function awardReferralPoints(newCustomerId: string): Promise<PointsEntry | null> {
  const profile = await new UserProfileService(serviceDb()).getById(newCustomerId);
  if (!profile?.referredBy) return null;
  return awardPoints({ customerId: profile.referredBy, reason: 'referral', refId: newCustomerId });
}

/** Operasyon puan tablosu — kim ne kadar biriktirmiş (genel resim, istisna avı değil). */
export function listTopPointsBalances(limit?: number): Promise<PointsBalance[]> {
  return new PointsBalanceService(serviceDb()).listTop(limit);
}
