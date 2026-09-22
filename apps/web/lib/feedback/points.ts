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
  POINTS_REDEEM_MAX_DEFAULT,
  POINTS_REDEEM_MAX_KEY,
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
 * Puan kapıları: motor karar verir, defter yazar, burası ikisini birleştirir. Puan verme sessiz başarısız olur, çünkü ödül
 * aksiyonu teşvik eder, ona şart koşmaz; tavana takılan müşterinin yorumu yine kaydedilmeli.
 */

/** Bir aksiyonun kaç puan ettiği ve puanın kuruş değeri; ekran ayarı kendisi okusaydı varsayılan iki yerde durup ayrışırdı. */
export async function pointsValueOf(reason: EarnablePointsReason): Promise<{ points: number; centValue: number }> {
  const settings = await pointsSettings();
  return { points: settings.values[reason] ?? 0, centValue: settings.centValue };
}

/** Puan ayarları tek turda — her aksiyonda ayrı ayar sorguları atmamak için. */
async function pointsSettings(): Promise<{ values: Record<string, number>; dailyCap: number; minimum: number; maximum: number; centValue: number }> {
  const settings = new SettingsService(serviceDb());
  // Varsayılanlar paketten, çünkü burada ayrı bir tablo tutulsaydı ayar satırı yokken ekran ile motor farklı sayı söylerdi.
  const [review, purchase, candidate, referral, neighbor, visit, dailyCap, minimum, maximum, centValue] = await Promise.all([
    settings.getNumber(POINTS_SETTING_KEYS.review, POINTS_DEFAULTS.review),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_purchase, POINTS_DEFAULTS.feedback_purchase),
    settings.getNumber(POINTS_SETTING_KEYS.feedback_candidate, POINTS_DEFAULTS.feedback_candidate),
    settings.getNumber(POINTS_SETTING_KEYS.referral, POINTS_DEFAULTS.referral),
    settings.getNumber(POINTS_SETTING_KEYS.neighbor, POINTS_DEFAULTS.neighbor),
    settings.getNumber(POINTS_SETTING_KEYS.visit, POINTS_DEFAULTS.visit),
    // Anahtar ve tavan varsayılanı motordan, literal değil; kopya bir gün motorun uygulamadığı bir eşiği gösterirdi.
    settings.getNumber(POINTS_DAILY_CAP_KEY, POINTS_DAILY_CAP_DEFAULT),
    settings.getNumber(POINTS_REDEEM_MIN_KEY, 500),
    settings.getNumber(POINTS_REDEEM_MAX_KEY, POINTS_REDEEM_MAX_DEFAULT),
    settings.getNumber(POINTS_CENT_VALUE_KEY, 1),
  ]);
  return {
    values: { review, feedback_purchase: purchase, feedback_candidate: candidate, referral, neighbor, visit },
    dailyCap,
    minimum,
    maximum,
    centValue,
  };
}

/**
 * Bir aksiyona puan yazar; kural `@lezzet/application`da, burası yalnız `serviceDb()` enjeksiyonu yapan köprü ki web'in dört
 * çağıranı istemciyi her seferinde yazmasın.
 */
export function awardPoints(input: { customerId: string; reason: EarnablePointsReason; refId?: string }): Promise<PointsEntry | null> {
  return awardPointsFor(serviceDb(), input);
}

/** Geri bildirim kaydına puan yazar, sebebi içerikten çözerek; kimliksiz kayıt puan doğurmaz, çünkü ödülün sahibi yok. */
export function awardFeedbackPoints(feedback: ProductFeedback): Promise<PointsEntry | null> {
  return awardFeedbackPointsFor(serviceDb(), feedback);
}

/**
 * Günlük ziyaret puanı: oy puanından ayrı bir geri getirme ödülü, çünkü oy puanını her ziyarette ödemek bastırmak istediğimiz
 * davranışı satın almak olurdu. İkinci geliş hata değil `null` döner ve ekran hiçbir şey demez.
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

/** Puanı kişisel kupona çevirir; karar motorda, puan düşümü ile kuponun doğuşu bölünemez olduğu için RPC'de. */
export async function redeemPoints(input: { customerId: string; points?: number }): Promise<RedemptionResult> {
  const db = serviceDb();
  const [profile, balance, settings] = await Promise.all([
    new UserProfileService(db).getById(input.customerId),
    getPointsBalance(input.customerId),
    pointsSettings(),
  ]);
  if (!profile) return { ok: false, reason: 'not_eligible' };

  // Puanı harcatmak kapılı yetkidir; çevirmenin iki gövdesi olduğu için kapı burada da durur, yoksa kural yalnız bir yolda geçerli olurdu.
  // BEKLEYEN(04.10): çevirmenin iki gövdesi tekleşmeli; o güne kadar bu kapı `application/customer/points.ts`teki eşiyle birlikte değişir.
  if (!canOpenHistory(anchorStateOf(profile))) return { ok: false, reason: 'not_eligible' };

  const check = canRedeem({
    customerType: profile.type,
    balance: balance.balance,
    requestedPoints: input.points,
    minimum: settings.minimum,
    maximum: settings.maximum,
    centValue: settings.centValue,
  });
  if (!check.allowed) {
    // `b2b` dışarı motor sözlüğüyle sızmaz: müşteri "programa dahil değilsiniz" cümlesini görür.
    return { ok: false, reason: check.reason === 'b2b' ? 'not_eligible' : check.reason };
  }

  // Kod çakışırsa yeni kodla üç kez denenir; benzersizliği veritabanı söyler.
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

/** Personelin elle puan düzeltmesi, iz kaydıyla; tavan ve B2B kuralı uygulanmaz, çünkü bu bir kazanım değil sebebi yazılı bir karardır. */
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

/** Getiren müşteriye puan köprüsü; ödül ödeme yolunda kendiliğinden doğar, bu kapı yalnız elle yeniden deneme içindir. */
export function awardReferralPoints(newCustomerId: string): Promise<PointsEntry | null> {
  return awardReferralPointsFor(serviceDb(), newCustomerId);
}

/** Operasyon puan tablosu; `since` verilirse o dönemin kazanılan eksi harcananı okunur, çünkü dönemin bir bakiyesi yoktur. */
export function listTopPointsBalances(limit?: number, since?: string): Promise<PointsBalance[]> {
  return new PointsBalanceService(serviceDb()).listTop(limit, since);
}
