import type { CustomerType, PointsReason } from '@lezzet/types';
import { readableCode } from '../order/reference-no';

/**
 * Puan kuralları (17.4) — DOMAIN §14.
 *
 * Toplama defterin işi (`customer_points_balance`); burada **kim kazanır, ne kadar kazanır, ne
 * zaman kazanamaz** soruları yanıtlanır.
 *
 * **Ödül ≠ güven.** Müşteri katılımın ödülünü her hâlükârda alır; sinyalin kalitesi yalnız
 * ANALİZDEKİ ağırlığını etkiler (`signal-quality`). Bu ayrım burada da geçerli: kalitesiz bir
 * kaydırma puanını alır, ama iş kararını bozmaz.
 */

/**
 * **Kazanılabilir** sebepler — harcama (`redemption`) ve elle düzeltme (`manual`) dışarıda.
 * Tip olarak ayrı durur ki "puan yaz" kapısına yanlışlıkla bir harcama sebebi geçilemesin.
 */
export type EarnablePointsReason = Exclude<PointsReason, 'redemption' | 'manual'>;

/** Aksiyon başına puan — değerler `Setting`'ten gelir, burada yalnız hangi anahtarı okuyacağı yazılı. */
export const POINTS_SETTING_KEYS: Record<EarnablePointsReason, string> = {
  review: 'points_review',
  feedback_purchase: 'points_feedback_purchase',
  feedback_candidate: 'points_feedback_candidate',
  order: 'points_order',
  referral: 'points_referral',
  visit: 'points_visit',
};

/**
 * **Çevrimin** ayar anahtarları — kazanımınkilerle (`POINTS_SETTING_KEYS`) aynı evde, çünkü aynı
 * ailedendir: hepsi "puanın kuralı ayardan gelir, koda gömülmez" kararının parçası.
 *
 * Buraya taşınmalarının sebebi ölçülen bir ikilik: `apps/web/lib/settings-keys.ts` bu iki anahtarı
 * sabit olarak tutuyor, `apps/web/lib/feedback/points.ts` ise aynı dizeleri LİTERAL yazıyor. İki
 * kopya bugün aynı; üçüncüsünü (mobil kapısı) eklemek, bir gün ayrışacak üç yer demekti — ve
 * ayrıştıklarında hata vermezler, yalnız ekran motorun uygulamayacağı bir eşik söyler (29.07
 * denetiminin tam olarak bu olduğu yer). Web'inkiler bugün köprü; benimsemesi web şeridinin işi.
 *
 * Değerler burada YOK, yalnız anahtarlar: eşiği ve kuruş karşılığını operatör Ayarlar'dan
 * belirler. Varsayılanlar okuyan kapıda durur (`getNumber`ın ikinci argümanı).
 */
/** Kupona çevirmenin asgari puanı — eşiğin altındaki bakiye çevrilemez. */
export const POINTS_REDEEM_MIN_KEY = 'points_redeem_min';
/** Bir puanın CENT karşılığı — "500 puan = 5 €" cümlesi bu ikisinin çarpımıdır. */
export const POINTS_CENT_VALUE_KEY = 'points_cent_value';

/**
 * **Kaynak satırı OLMAYAN sebepler** — tekillikleri `ref_id` üzerinden kurulamaz.
 *
 * `points_entry_source_key` kısmi indeksi `ref_id is not null` ile sınırlı; ziyaretin işaret
 * edeceği bir satır yok. Bu küme, "puan yaz" kapısının `ref_id` beklememesi gerektiğini SÖYLER —
 * yoksa kapı sessizce `null` bir ref ile yazar ve tekillik hiçbir yerde tutulmaz.
 *
 * Bugün tek üyesi var; küme olarak yazılmasının sebebi ikinci üye çıktığında kapının değil bu
 * listenin değişmesi (`referral` bir gün kaynaksız hâle gelirse aynı yoldan geçer).
 */
export const SOURCELESS_POINTS_REASONS: readonly EarnablePointsReason[] = ['visit'];

export type EarnCheck = { allowed: true; points: number } | { allowed: false; reason: 'b2b' | 'daily_cap' | 'no_value' };

/**
 * Bu müşteri bu aksiyondan puan kazanabilir mi ve ne kadar.
 *
 * **B2B kazanmaz** (DOMAIN §14): toptancının zaten özel fiyatı var, oyunlaştırma son kullanıcı
 * içindir. Reddin sebebi ayrı taşınır çünkü ekranın söyleyeceği cümle farklı — "günlük sınırına
 * ulaştın" bir teşviktir, "bu program size açık değil" bir bilgilendirme.
 *
 * **Günlük tavan kısmi uygulanmaz:** kalan 3 puanken 5 puanlık bir aksiyon yapan müşteriye 3 puan
 * yazmak, ertesi gün aynı aksiyonu tekrarlayamayacağı için (tekillik) kalıcı bir kayıp olurdu.
 * Ya tamamı verilir ya hiç — ve müşteri yarın tam puanla döner.
 */
/**
 * Bu müşteri TİPİ puan kazanabilir mi — tek soruluk yüklem (DOMAIN §14: puan yalnız B2C).
 *
 * `canEarnPoints`'ten ayrı çünkü sorular ayrı: o "bu AKSİYON şimdi puan verir mi" der ve günlük
 * tavanı, aksiyonun değerini bilmek zorundadır. Müşteri kartı ise defteri hiç okumadan önce yalnız
 * "bu kişide puan kavramı geçerli mi" diye sorar — şirket müşterisinde ekranda "0 puan" göstermek
 * "kazanabilir ama kazanmamış" demektir, oysa kazanamaz.
 *
 * Ayrı bir yüklem olmasa çağıran ya `type === 'company'` kontrolünü kopyalar (kural iki yerde) ya da
 * `canEarnPoints`'e uydurma bir aksiyon/tavan geçirirdi.
 */
export function isPointsEligible(customerType: CustomerType): boolean {
  return customerType !== 'company';
}

export function canEarnPoints(input: {
  customerType: CustomerType;
  actionPoints: number;
  /** Müşterinin bugün kazandığı toplam puan. */
  earnedToday: number;
  dailyCap: number;
}): EarnCheck {
  if (!isPointsEligible(input.customerType)) return { allowed: false, reason: 'b2b' };
  if (input.actionPoints <= 0) return { allowed: false, reason: 'no_value' };
  if (input.earnedToday + input.actionPoints > input.dailyCap) return { allowed: false, reason: 'daily_cap' };
  return { allowed: true, points: input.actionPoints };
}

export type RedeemCheck =
  | { allowed: true; pointsSpent: number; valueCents: number }
  | { allowed: false; reason: 'b2b' | 'below_minimum' | 'insufficient_balance' };

/**
 * Puan → kupon çevrimi yapılabilir mi ve karşılığı ne.
 *
 * **Müşteri kendi isteyince çevirir** (DOMAIN §14), otomatik değil: biriken puanı kendiliğinden
 * kupona çevirmek, müşterinin daha büyük bir ödül için biriktirme kararını elinden almaktır.
 *
 * Asgari eşik iki işe yarar: kuruşluk kuponlarla dolan bir indirim tablosunu ve "1 puanım var,
 * neden kullanamıyorum" sorusunu birlikte önler.
 */
export function canRedeem(input: {
  customerType: CustomerType;
  balance: number;
  /** Çevrilmek istenen puan; verilmezse tüm bakiye. */
  requestedPoints?: number;
  minimum: number;
  centValue: number;
}): RedeemCheck {
  if (input.customerType === 'company') return { allowed: false, reason: 'b2b' };

  const points = input.requestedPoints ?? input.balance;
  if (points < input.minimum) return { allowed: false, reason: 'below_minimum' };
  if (points > input.balance) return { allowed: false, reason: 'insufficient_balance' };

  return { allowed: true, pointsSpent: points, valueCents: points * input.centValue };
}

/**
 * Geri bildirim kaydının kaç puan ettiği — **içeriğe göre**, biçime göre değil.
 *
 * Metin yazmak kaydırmaktan daha zahmetlidir ve daha değerlidir; ödül bunu yansıtmalı. Müşteri
 * önce beğeni verip sonra yorum eklerse iki ayrı defter satırı doğar (`feedback_*` + `review`) ve
 * ikisi de bir kez verilir — tekillik `(müşteri, sebep, kaynak)` üzerindedir.
 */
export function feedbackPointsReason(input: {
  context: 'purchase' | 'candidate';
  hasText: boolean;
}): Extract<EarnablePointsReason, 'review' | 'feedback_purchase' | 'feedback_candidate'> {
  if (input.hasText) return 'review';
  return input.context === 'purchase' ? 'feedback_purchase' : 'feedback_candidate';
}


/**
 * Puan kuponunun kodu — `PUAN-7K4M2P`.
 *
 * Sipariş referansıyla **aynı alfabeyi** kullanır (`READABLE_ALPHABET`): müşteriye telefonda
 * okunacak her kod aynı karışmayan harflerden kurulmalı. Önek Türkçe ve kasıtlı: müşteri kodun
 * nereden geldiğini kodun kendisinden anlar.
 *
 * Benzersizlik BURADA garanti edilmez — veritabanı işi. Çakışmada çağıran yeniden üretir
 * (`generateReferenceNo` ile aynı sözleşme).
 */
export function redemptionCode(random: () => number = Math.random): string {
  return `PUAN-${readableCode(6, random)}`;
}
