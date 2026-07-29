import { readableCode } from '../order/reference-no';

/**
 * Alım-sonrası davet kuralları (17.2) ve dış değerlendirme köprüsü (17.6) — DOMAIN §14.
 *
 * Davetin **ne zaman** gideceği, **kime** gideceği ve akış sonunda müşterinin hangi yola çıkacağı
 * burada; gönderim ve kayıt uygulama katmanının işi.
 */

/**
 * Teslimden sonra kaç gün beklenir. **Parametrik varsayılan: 10 gün.**
 *
 * Donuk gıdada bu süre bir tahmin değil bir gerekçedir: müşteri ürünü teslim aldığı gün değil,
 * pişirip yediği gün değerlendirebilir. Çok erken sormak "daha açmadım" cevabını, çok geç sormak
 * unutulmuş bir deneyimi getirir.
 */
export const FEEDBACK_DELAY_DAYS = 10;

/**
 * Bu sipariş davet almalı mı ve zamanı geldi mi.
 *
 * **Yalnız teslim edilmiş sipariş:** yolda olan bir siparişin ürünleri henüz denenmedi. İptal ve
 * iade edilmiş siparişler de dışarıda — orada sorulacak şey memnuniyet değil, özürdür.
 *
 * `deliveredAt` yoksa sipariş hiç teslim edilmemiştir (`order_status_log`'dan türetilir).
 */
export function isDueForFeedback(input: {
  status: string;
  deliveredAt: string | null;
  now?: Date;
  delayDays?: number;
}): boolean {
  if (!input.deliveredAt) return false;
  if (input.status !== 'delivered' && input.status !== 'completed') return false;

  const now = input.now ?? new Date();
  const due = new Date(input.deliveredAt);
  due.setDate(due.getDate() + (input.delayDays ?? FEEDBACK_DELAY_DAYS));
  return now >= due;
}

/**
 * Davet bağlantısının anahtarı — **oturum yerine geçer**, o yüzden uzun VE kriptografik.
 *
 * 16 karakter, sipariş referansıyla aynı okunabilir alfabeden (~75 bit). Referanstan uzun olması
 * bilinçli — referans müşteriye okunur, bu ise yalnız bağlantıda taşınır.
 *
 * **Tehdit kaba kuvvet DEĞİL, öngörülebilirlik.** `readableCode` varsayılanı `Math.random` olsaydı
 * (öyleydi), kendi sipariş referansını ve kupon kodunu gören biri üretecin iç durumunu geri çözüp
 * komşu davetlerin token'ını türetebilirdi — yani başkasının siparişini okuyabilir, puanını
 * yakabilirdi. Uzunluk bu saldırıya karşı hiçbir şey yapmaz; üretecin kendisi değişmeliydi.
 *
 * Ömrü de vardır (`feedback_request.expires_at`, +90 gün): mail arşivinde kalan bir bağlantı
 * yıllar sonra açılamamalı.
 */
export function feedbackToken(random?: () => number): string {
  return readableCode(16, random);
}

/**
 * Akış sonunda müşteri hangi yola çıkar.
 *
 * **Memnun olmayan müşteri dış değerlendirmeye yönlendirilmez** (tasarım §6): onun yolu sorununu
 * iletebileceği talep girişidir. Bunun tersi — kötü deneyimi olan müşteriyi halka açık bir
 * değerlendirmeye itmek — hem ona hem bize zarar verir.
 *
 * Ölçüt beğeni ORANIDIR, tek bir yıldız değil: bir üründen hoşlanmamış olmak siparişten memnun
 * olmamak demek değildir.
 *
 * **Platform motorun umurunda değil.** Kural "memnunu davet et"tir; davetin Google İşletme
 * Profili'ne mi Trustpilot'a mı gittiği bir ayardır (`review_platform_url`). Motora vendor adı
 * gömmek, platform değişince kural dosyasını açtırırdı — oysa değişen şey yalnız adres.
 */
export type FeedbackOutcome = 'review_invite' | 'report_issue' | 'thanks';

/** Dış değerlendirme davetinin eşiği — beğenilerin en az bu oranı. Parametrik; tek yerde. */
export const REVIEW_INVITE_MIN_RATIO = 0.8;

export function feedbackOutcomeOf(input: {
  likeCount: number;
  dislikeCount: number;
  /** İşletmenin dış değerlendirme bağlantısı ayarlı mı; değilse davet hiç gösterilmez. */
  hasReviewLink: boolean;
  minRatio?: number;
}): FeedbackOutcome {
  const total = input.likeCount + input.dislikeCount;
  // Hiç değerlendirme yapmadan bitiren müşteri: ne övgü ne şikâyet — sade bir teşekkür.
  if (total === 0) return 'thanks';

  const ratio = input.likeCount / total;
  if (ratio < (input.minRatio ?? REVIEW_INVITE_MIN_RATIO)) return 'report_issue';
  // Memnun ama bağlantı ayarlı değil: uydurma bir adrese yönlendirmektense teşekkürle biter.
  return input.hasReviewLink ? 'review_invite' : 'thanks';
}
