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
  neighbor: 'points_neighbor',
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
 * **Bir komşu davetinden kaç komşu ödül doğurabilir** — `neighbor_invite.max_uses`in kaynağı.
 *
 * Sayı SATIRDA yaşar (davet doğduğu gün dondurulur: ayar sonradan değişse de o gün paylaşılmış
 * davetin sözü değişmemeli — `0044_neighbor_invite.sql` künyesi). Ama satıra YAZILAN değerin bir
 * kaynağı olmalı ve o kaynak veritabanı varsayılanı olamaz: ekran müşteriye *"o güne en fazla 3
 * komşu"* diyecekse, o 3'ü motorun gerçekten uyguladığı yerden okumalı. Migration'daki `default 3`
 * artık bir yedek; yazan taraf bu sabiti AÇIKÇA geçiyor.
 *
 * **Neden bir sınır var:** davet "komşum" içindir, sosyal medya kampanyası için değil — ödülün
 * gerekçesi aracın o sokakta zaten duruyor olması, ve bir durağa sığdırılabilecek sipariş sayısı
 * sonsuz değil.
 */
export const NEIGHBOR_INVITE_MAX_USES = 3;

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

/**
 * **Günlük tavanın KAPSADIĞI sebepler** — kullanıcı onayı 11.08 (`BACKLOG-musteri §4`).
 *
 * Kural tek cümle: *tavan yalnız PARA ÖDENMEDEN yapılabilen eylemleri kapsar; parayla gelen
 * ödüller tavanın DIŞINDADIR.* Bedava yapılabilen yalnız iki şey var — siteye gelmek (zaten günde
 * bir) ve keşif turunda oy vermek (bizim yayınladığımız kart sayısı kadar). Ötekilerin hepsinin
 * arkasında **ödenmiş bir sipariş** durur: yorum ve alım-sonrası beğeni satın almayı şart koşuyor,
 * getiren ve komşu ödülleri de karşı tarafın parasının defterde görünmesini.
 *
 * ── NEDEN ŞART: TAVAN KIRPMAZ, TAMAMINI REDDEDER ────────────────────────────
 * `canEarnPoints` kısmi puan yazmıyor (aşağıdaki künye) — yani tavana takılan bir ödül HİÇ
 * yazılmıyor ve tekillik yüzünden yarın telafi de edilemiyor. Değer merdiveni 11.08'de yükselince
 * (getiren 500, komşu 100) tavan `100`da kaldığı için **davet ödülleri hiçbir zaman yazılamaz**
 * hâle gelirdi: 500 > 100. Ölçüm değil aritmetik — ve hata vermeden, sessizce.
 *
 * Tavanın içinde kalan azami bugün **18 puan** (giriş 10 + 4 aday kart × 2), yani tavanın SAYISI
 * bugünkü davranışı belirlemiyor — kapsamı belirliyor. `points_daily_cap` **270**
 * (kullanıcı kararı 15.08; daha önce 100'dü). Sayı bugün hiçbir ödülü reddetmiyor, ileride aday
 * kart sayısı ya da ziyaret puanı büyürse nefes payı bırakıyor. **Değer geçici** — kullanıcı
 * *"sonra bakalım gene"* dedi.
 *
 * **`earnedToday` de bu kümeyle sayılır**, tüm defterle değil: 500 puanlık bir getiren ödülü
 * pencereyi doldursaydı müşteri aynı gün keşif oyundan puan alamazdı — tavanın dışında tuttuğumuz
 * bir ödül, tavanın içindekileri yemiş olurdu.
 */
export const CAPPED_POINTS_REASONS: readonly EarnablePointsReason[] = ['visit', 'feedback_candidate'];

/** Bu sebep günlük tavana tabi mi (`CAPPED_POINTS_REASONS` künyesi). */
export function isCappedReason(reason: EarnablePointsReason): boolean {
  return CAPPED_POINTS_REASONS.includes(reason);
}

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
  /** Aksiyonun sebebi — tavanın uygulanıp uygulanmayacağını BU belirler (`CAPPED_POINTS_REASONS`). */
  reason: EarnablePointsReason;
  actionPoints: number;
  /** Müşterinin bugün **tavana tabi sebeplerden** kazandığı toplam puan. */
  earnedToday: number;
  dailyCap: number;
}): EarnCheck {
  if (!isPointsEligible(input.customerType)) return { allowed: false, reason: 'b2b' };
  if (input.actionPoints <= 0) return { allowed: false, reason: 'no_value' };
  // Parayla gelen ödül tavan görmez (kullanıcı onayı 11.08): kimse bize para ödeyerek bizi sömüremez.
  if (!isCappedReason(input.reason)) return { allowed: true, points: input.actionPoints };
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
