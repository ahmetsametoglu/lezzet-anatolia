/**
 * Kaydırma sinyalinin kalitesi (17.3, 13.6) — DOMAIN §14 "ödül ≠ güven".
 *
 * **Müşteri katılımın ödülünü HER HÂLÜKÂRDA alır.** Kalite yalnız analizdeki ağırlığı etkiler.
 * Bu dosya o ayrımın kod karşılığı: puan hesabına hiç girmez (`points.ts`), yalnız aday panosunun
 * ve ürün skorunun "bu sinyale ne kadar güvenelim" sorusunu yanıtlar.
 *
 * Ölçüt üç sorudur:
 *   1. Karta bakıldı mı? (`dwell_ms`)
 *   2. Kişi ayırt ediyor mu, hep aynı yöne mi savuruyor?
 *   3. Kaç kaydırma yapılmış — az sayıda kaydırmada desen çıkarılamaz.
 */

/**
 * Bir kartın ciddiye alınabilmesi için asgari süre. **400 ms** — ürün adını okumaya ancak yeten,
 * "başparmakla savurmadan" ayıran eşik. Parametrik: gerçek kaydırma desenleri görüldükçe ayarlanır.
 */
export const MIN_DWELL_MS = 400;

/** Bu sürenin üstü "baktı, düşündü" sayılır; ağırlık burada tavanına ulaşır. */
export const FULL_DWELL_MS = 2000;

/** Desen çıkarmak için gereken asgari kaydırma sayısı — altında kişi "hep aynı" sayılamaz. */
export const MIN_SWIPES_FOR_PATTERN = 5;

/**
 * Tek bir kaydırmanın ağırlığı (0–1) — **yalnız süreye bakar.**
 *
 * `null` süre (ölçülememiş) 1 sayılır, 0 değil: veriyi ölçemediğimiz için müşteriyi cezalandırmak,
 * eski kayıtları ve ölçüm hatasını manipülasyonla aynı kefeye koymak olurdu.
 *
 * Eşiğin altı SIFIR, arası doğrusal: 400 ms'nin altında kart görülmemiştir.
 */
export function dwellWeight(dwellMs: number | null | undefined): number {
  if (dwellMs === null || dwellMs === undefined) return 1;
  if (dwellMs < MIN_DWELL_MS) return 0;
  if (dwellMs >= FULL_DWELL_MS) return 1;
  return (dwellMs - MIN_DWELL_MS) / (FULL_DWELL_MS - MIN_DWELL_MS);
}

/**
 * Kişinin genel güvenilirliği (0–1) — **ayırt ediyor mu?**
 *
 * Hep "beğendim" diyen de hep "geçtim" diyen de bilgi taşımaz: bir kişi her şeyi beğeniyorsa
 * hangi ürünü daha çok beğendiğini söyleyemez. Ölçü, azınlık yönün payıdır — %50/%50 tam güven,
 * %100/%0 sıfıra yakın.
 *
 * Az sayıda kaydırmada desen aranmaz (1 döner): üç kaydırmanın üçünü de beğenmiş olmak
 * şüphelenmek için sebep değildir.
 */
export function patternWeight(input: { likeCount: number; dislikeCount: number }): number {
  const total = input.likeCount + input.dislikeCount;
  if (total < MIN_SWIPES_FOR_PATTERN) return 1;

  const minority = Math.min(input.likeCount, input.dislikeCount);
  // Azınlık payı 0 → 0 ağırlık; 0.5 (tam denge) → 1 ağırlık.
  return Math.min(1, (minority / total) * 2);
}

/**
 * Bir kaydırmanın ANALİZDEKİ ağırlığı — süre × kişinin deseni.
 *
 * İkisi çarpılır çünkü ikisi de gerekli: uzun uzun bakıp hep aynı yöne savuran da, ayırt edip
 * milisaniyelerle geçen de tam güven vermez.
 */
export function swipeWeight(input: {
  dwellMs: number | null | undefined;
  swiperLikeCount: number;
  swiperDislikeCount: number;
}): number {
  return dwellWeight(input.dwellMs) * patternWeight({ likeCount: input.swiperLikeCount, dislikeCount: input.swiperDislikeCount });
}

/**
 * Aday ürünün **ağırlıklı** talep skoru ve güven göstergesi.
 *
 * Ham beğeni sayısı panoda yanıltıcıdır: 40 savurma beğenisi, 8 gerçek beğeniden büyük görünür.
 * `weightedLikes` bunu düzeltir; `trust` ise farkı ekrana taşır — tasarımın "sade bir güven
 * göstergesi" dediği şey (admin-geri-bildirim §2).
 */
export interface CandidateSignal {
  /** Ağırlıklandırılmış beğeni — sıralama bunu kullanır. */
  weightedLikes: number;
  /** Ham beğeni sayısı; ekran ikisini yan yana gösterebilir. */
  rawLikes: number;
  /** 0–1: ağırlıklının hama oranı. Düşükse "çok beğeni ama zayıf sinyal". */
  trust: number;
}

export function candidateSignalOf(swipes: readonly { vote: 'like' | 'dislike'; weight: number }[]): CandidateSignal {
  const likes = swipes.filter((s) => s.vote === 'like');
  const rawLikes = likes.length;
  const weightedLikes = likes.reduce((sum, s) => sum + s.weight, 0);
  return {
    weightedLikes: Math.round(weightedLikes * 100) / 100,
    rawLikes,
    trust: rawLikes === 0 ? 0 : Math.round((weightedLikes / rawLikes) * 100) / 100,
  };
}
