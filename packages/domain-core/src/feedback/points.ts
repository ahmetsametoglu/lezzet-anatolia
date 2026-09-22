import type { CustomerType, PointsReason } from '@lezzet/types';
import { readableCode } from '../order/reference-no';

/** Puan kuralları: kim, ne kadar, ne zaman kazanır. Ödül güvenden ayrıdır; kalitesiz bir kaydırma puanını alır ama analizdeki ağırlığı düşer. */

/**
 * Kazanılabilir sebepler; harcama, elle düzeltme ve sipariş dışarıda ki "puan yaz" kapısına bunlar geçilemesin. `order`
 * `PointsReason`da durur, çünkü defterdeki eski sipariş satırları kazanılmış puandır ve geçmiş ekranı onları adlandırmalı.
 */
export type EarnablePointsReason = Exclude<PointsReason, 'redemption' | 'manual' | 'order'>;

/** Aksiyon başına puan — değerler `Setting`'ten gelir, burada yalnız hangi anahtarı okuyacağı yazılı. */
export const POINTS_SETTING_KEYS: Record<EarnablePointsReason, string> = {
  review: 'points_review',
  feedback_purchase: 'points_feedback_purchase',
  feedback_candidate: 'points_feedback_candidate',
  referral: 'points_referral',
  neighbor: 'points_neighbor',
  visit: 'points_visit',
};

/** Çevrimin ayar anahtarları tek yerde durur, çünkü ayrışan kopyalar hata vermez, yalnız ekran motorun uygulamayacağı bir eşik söyler. */
/** Kupona çevirmenin asgari puanı — eşiğin altındaki bakiye çevrilemez. */
export const POINTS_REDEEM_MIN_KEY = 'points_redeem_min';
/** Tek kupona çevrilebilecek azami puan; fazlası bakiyede kalır ve bir sonraki basışta çevrilir. */
export const POINTS_REDEEM_MAX_KEY = 'points_redeem_max';
/** Ayar satırı yazılmamış kurulumun tavanı: 2000 puan = 20 €. */
export const POINTS_REDEEM_MAX_DEFAULT = 2000;
/** Bir puanın CENT karşılığı — "500 puan = 5 €" cümlesi bu ikisinin çarpımıdır. */
export const POINTS_CENT_VALUE_KEY = 'points_cent_value';
/** Günlük tavan — kapsamı `CAPPED_POINTS_REASONS`, sayısı ayardan. */
export const POINTS_DAILY_CAP_KEY = 'points_daily_cap';

/**
 * Günlük tavanın varsayılanı; `POINTS_DEFAULTS` sebep başına ödül tuttuğu için sebeplerin üstündeki bu sınır ayrı durur.
 * Migration'daki değer satırın kendisidir, bu sabit yalnız satır okunamazsa geçerlidir.
 */
export const POINTS_DAILY_CAP_DEFAULT = 270;

/**
 * Bir komşu davetinden en fazla kaç ödül doğar; değer davet satırına yazılıp o gün dondurulur ki paylaşılmış davetin sözü
 * değişmesin. Sınır var, çünkü ödülün gerekçesi aracın o sokakta zaten durmasıdır ve bir durağa sınırsız sipariş sığmaz.
 */
export const NEIGHBOR_INVITE_MAX_USES = 3;

/**
 * Kaynak satırı olmayan sebepler; tekillikleri `ref_id` üzerinden kurulamaz. Küme, "puan yaz" kapısının bu sebeplerde
 * `ref_id` beklememesini söyler, yoksa kapı `null` ref ile yazar ve tekillik tutulmaz.
 */
export const SOURCELESS_POINTS_REASONS: readonly EarnablePointsReason[] = ['visit'];

/**
 * Günlük tavanın kapsadığı sebepler: yalnız para ödenmeden yapılabilenler, çünkü tavan kırpmaz, tamamını reddeder ve büyük
 * ödüller tavanda kalsaydı hiç yazılamazdı. `earnedToday` de bu kümeyle sayılır ki tavan dışı ödül tavan içindekileri yemesin.
 */
export const CAPPED_POINTS_REASONS: readonly EarnablePointsReason[] = ['visit', 'feedback_candidate'];

/** Bu sebep günlük tavana tabi mi (`CAPPED_POINTS_REASONS` künyesi). */
export function isCappedReason(reason: EarnablePointsReason): boolean {
  return CAPPED_POINTS_REASONS.includes(reason);
}

export type EarnCheck = { allowed: true; points: number } | { allowed: false; reason: 'b2b' | 'daily_cap' | 'no_value' };

/** Bu müşteri tipinde puan kavramı geçerli mi; şirket müşterisinde "0 puan" göstermek "kazanabilir ama kazanmamış" okunurdu. */
export function isPointsEligible(customerType: CustomerType): boolean {
  return customerType !== 'company';
}

/** Aksiyonun puanı: B2B kazanmaz, tavan kısmi uygulanmaz çünkü eksik yazılan puan tekillik yüzünden telafi edilemez. */
export function canEarnPoints(input: {
  customerType: CustomerType;
  /** Aksiyonun sebebi — tavanın uygulanıp uygulanmayacağını BU belirler (`CAPPED_POINTS_REASONS`). */
  reason: EarnablePointsReason;
  actionPoints: number;
  /** Müşterinin bugün **tavana tabi sebeplerden** kazandığı toplam puan. */
  earnedToday: number;
  dailyCap: number;
}): EarnCheck {
  if (!isPointsEligible(input.customerType)) return { allowed: false, reason: 'b2b' };
  if (input.actionPoints <= 0) return { allowed: false, reason: 'no_value' };
  // Parayla gelen ödül tavan görmez: kimse bize para ödeyerek bizi sömüremez.
  if (!isCappedReason(input.reason)) return { allowed: true, points: input.actionPoints };
  if (input.earnedToday + input.actionPoints > input.dailyCap) return { allowed: false, reason: 'daily_cap' };
  return { allowed: true, points: input.actionPoints };
}

export type RedeemCheck =
  | { allowed: true; pointsSpent: number; valueCents: number }
  | { allowed: false; reason: 'b2b' | 'below_minimum' | 'insufficient_balance' };

/**
 * Puan kupona çevrilebilir mi ve karşılığı ne. Müşteri kendi isteyince çevirir, çünkü biriken puanı kendiliğinden bozmak
 * daha büyük ödül için biriktirme kararını elinden alır; eşik kuruşluk kuponları önler.
 */
export function canRedeem(input: {
  customerType: CustomerType;
  balance: number;
  /** Çevrilmek istenen puan; verilmezse tüm bakiye. */
  requestedPoints?: number;
  minimum: number;
  /** Tek kuponun tavanı; büyük kupon tek siparişte kırpılıp yanmasın diye bakiye parça parça çevrilir. */
  maximum: number;
  centValue: number;
}): RedeemCheck {
  if (input.customerType === 'company') return { allowed: false, reason: 'b2b' };

  const points = Math.min(input.requestedPoints ?? input.balance, input.maximum);
  if (points < input.minimum) return { allowed: false, reason: 'below_minimum' };
  if (points > input.balance) return { allowed: false, reason: 'insufficient_balance' };

  return { allowed: true, pointsSpent: points, valueCents: points * input.centValue };
}

/** Bir basışın çevireceği puan ve karşılığı; eşiğin altındaki bakiyede eşiğin kendisi, çünkü düğme o hâlde neye ulaşılacağını söyler. */
export function nextRedemption(input: { balance: number; minimum: number; maximum: number; centValue: number }): {
  points: number;
  valueCents: number;
} {
  const points = input.balance >= input.minimum ? Math.min(input.balance, input.maximum) : input.minimum;
  return { points, valueCents: points * input.centValue };
}

/**
 * Geri bildirim kaydının kaç puan ettiği içeriğe göre belirlenir, çünkü yazmak kaydırmaktan değerlidir. Keşif kartı metin
 * taşısa da aday puanıdır, yoksa keşif akışına metin alanı eklendiği gün on kat puan dağıtan bir kapı açılırdı.
 */
export function feedbackPointsReason(input: {
  context: 'purchase' | 'candidate';
  hasText: boolean;
}): Extract<EarnablePointsReason, 'review' | 'feedback_purchase' | 'feedback_candidate'> {
  if (input.context === 'candidate') return 'feedback_candidate';
  return input.hasText ? 'review' : 'feedback_purchase';
}


/**
 * Puan kuponunun kodu (`PUAN-7K4M2P`); sipariş referansının karışmayan alfabesini kullanır, çünkü kod telefonda okunur.
 * Benzersizliği veritabanı söyler, çakışmada çağıran yeniden üretir.
 */
export function redemptionCode(random: () => number = Math.random): string {
  return `PUAN-${readableCode(6, random)}`;
}
