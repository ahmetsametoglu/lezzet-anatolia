import type { ReviewStatus } from '@lezzet/types';

/**
 * Ürün geri bildiriminin kuralları (17.1, 17.3) — DOMAIN §14.
 *
 * Toplama SQL'in işi (`product_rating` ham sayıları verir); burada **yorum** vardır: hangi kayıt
 * moderasyona girer, hangi geçiş meşrudur, iki farklı ölçü (yıldız + beğeni) tek puana nasıl
 * dönüşür, bir puan ne zaman güvenilir sayılır.
 */

// ─── Moderasyon ──────────────────────────────────────────────────────────────

/**
 * `pending → approved/rejected` ilk karardır; **yayınlanan geri çekilebilir** ve reddedilen
 * sonradan yayına alınabilir — moderatör fikir değiştirebilmeli.
 *
 * `pending`'e DÖNÜŞ yok: "karar verilmemiş" hâline geri gitmek verilmiş bir kararı silmektir;
 * kuyruk o metni ikinci kez gösterir ve aynı cümle yeniden okunur.
 */
const MODERATION_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['rejected'],
  rejected: ['approved'],
};

export type ModerationCheck = { allowed: true } | { allowed: false; reason: 'same_status' | 'not_allowed' | 'nothing_to_read' };

/**
 * **Moderasyon metnin işidir.** Bir yıldızı ya da bir beğeniyi "reddetmek" anlamsızdır: okunacak
 * bir şey yoktur. Metinsiz kayıt kuyruğa hiç düşmez ve moderasyon da kabul etmez —
 * `nothing_to_read`.
 *
 * `hasText` ayrı bir parametre, çünkü motor kaydı değil kararı bilir: çağıran metni okur, motor
 * kuralı söyler.
 */
export function canModerate(from: ReviewStatus, to: ReviewStatus, hasText: boolean): ModerationCheck {
  if (!hasText) return { allowed: false, reason: 'nothing_to_read' };
  if (from === to) return { allowed: false, reason: 'same_status' };
  return MODERATION_TRANSITIONS[from].includes(to) ? { allowed: true } : { allowed: false, reason: 'not_allowed' };
}

/**
 * Yeni kaydın doğduğu durum. Metin varsa kuyruğa, yoksa doğrudan yayına.
 *
 * Kuralın motorda olması şart: kapı bunu kendi hesaplasaydı, ikinci bir yazma yolu açıldığı gün
 * (WhatsApp'tan gelen yorum, personelin elle girdiği) metinsiz kayıtlar sessizce kuyruğa dolardı.
 */
export function initialFeedbackStatus(comment: string | null | undefined): ReviewStatus {
  return (comment?.trim().length ?? 0) > 0 ? 'pending' : 'approved';
}

// ─── Ürün skoru ──────────────────────────────────────────────────────────────

/**
 * **Güven eşiği: 3 beyan.** Altındaki ürünün skoru gösterilebilir ama bir yargı gibi
 * sunulmamalıdır — tasarımın deyişiyle "3 yorumla 'en kötü ürün' damgası vurulmaz".
 *
 * Yıldız ve beğeni birlikte sayılır: eşik "kaç kişi konuştu" sorusudur, hangi biçimde konuştuğu
 * değil.
 */
export const MIN_FEEDBACK_FOR_CONFIDENCE = 3;

/**
 * Beğeninin yıldız karşılığındaki tabanı ve aralığı — `%0 beğeni → 1`, `%100 beğeni → 5`.
 *
 * Parametrik ve tek yerde: iki farklı ölçüyü tek skora indirmenin bir "doğru"su yok, bir tercihi
 * var. Tercih burada yazılı olduğu için tartışılabilir ve değiştirilebilir; dört ekrana dağılmış
 * olsaydı ne tartışılır ne değiştirilebilirdi.
 */
const VOTE_SCORE_BASE = 1;
const VOTE_SCORE_RANGE = 4;

/** Ürün skorunun ekrana giden hâli — sayı değil, **ne kadar güvenilir olduğu bilinen** bir sayı. */
export interface ProductScore {
  /** 1–5 birleşik puan; hiç beyan yoksa null (sıfır DEĞİL — "puan yok" ile "sıfır puan" ayrıdır). */
  average: number | null;
  /** Yarım yıldıza yuvarlanmış gösterim değeri (4.3 → 4.5). Beyan yoksa null. */
  stars: number | null;
  /** Yıldız verenlerin ortalaması — beğenilerden bağımsız; operasyon ikisini ayrı da okuyabilmeli. */
  ratingAvg: number | null;
  ratingCount: number;
  likeCount: number;
  dislikeCount: number;
  /** Beğenenlerin oranı (0–1); hiç kaydırma yoksa null. */
  likeRatio: number | null;
  /** Skora katılan toplam beyan sayısı — güven eşiğinin ölçütü. */
  totalCount: number;
  confident: boolean;
  /**
   * **YAZILI** yorum sayısı — `ratingCount` ile karıştırılması canlı bir hataydı (müşteri şeridi,
   * 04.08): ürün sayfasındaki "{N} yorumun tümü" bağı `ratingCount` gösteriyordu, oysa form yıldız
   * ya da metin kabul ediyor. 20 yıldız + 2 yazılı yorumu olan üründe bağ "20 yorumun tümü" diyor,
   * panel 2 yorum gösteriyordu. Görünüm sayıyı zaten üretiyordu; motor onu çıktıya taşımıyordu.
   */
  commentCount: number;
  /** Yıldız dağılımı — indis 0 = 1★ … indis 4 = 5★. Panelin histogramı. */
  ratingBreakdown: readonly [number, number, number, number, number];
}

export interface RawProductRating {
  ratingAvg: number | null;
  ratingCount: number;
  likeCount: number;
  dislikeCount: number;
  /** Yazılı yorum sayısı. Eski çağıranlar için opsiyonel — verilmezse 0 sayılır. */
  commentCount?: number;
  /** Yıldız dağılımı, indis 0 = 1★. Opsiyonel: yalnız ham dört sayıyı veren çağıranlar kırılmasın. */
  ratingBreakdown?: readonly number[];
}

/**
 * İki ölçüyü tek puana indirir: **sayı-ağırlıklı ortalama.**
 *
 * Yıldız daha ağır bir beyandır (oturup verilir) ama sayıca azdır; beğeni hafiftir (tek dokunuş)
 * ama çoktur. Sabit bir ağırlık vermek ikisinden birini haksız yere ezerdi — 5 yorumlu 60 beğenili
 * bir üründe sonucu beğeniler belirlemeli, 40 yorumlu 3 beğenili bir üründe yıldızlar. Sayı-ağırlık
 * bunu kendiliğinden yapar.
 *
 * Yalnız biri varsa sonuç odur; hiçbiri yoksa `null` — "henüz bir şey söylenmedi".
 */
export function productScoreOf(input: RawProductRating): ProductScore {
  const voteCount = input.likeCount + input.dislikeCount;
  const likeRatio = voteCount > 0 ? input.likeCount / voteCount : null;
  const ratingAvg = input.ratingCount > 0 ? input.ratingAvg : null;
  const voteScore = likeRatio === null ? null : VOTE_SCORE_BASE + VOTE_SCORE_RANGE * likeRatio;

  const totalCount = input.ratingCount + voteCount;
  const average =
    totalCount === 0
      ? null
      : ((ratingAvg ?? 0) * input.ratingCount + (voteScore ?? 0) * voteCount) / totalCount;

  return {
    average: average === null ? null : Math.round(average * 100) / 100,
    stars: average === null ? null : Math.round(average * 2) / 2,
    ratingAvg,
    ratingCount: input.ratingCount,
    likeCount: input.likeCount,
    dislikeCount: input.dislikeCount,
    likeRatio: likeRatio === null ? null : Math.round(likeRatio * 100) / 100,
    totalCount,
    confident: totalCount >= MIN_FEEDBACK_FOR_CONFIDENCE,
    commentCount: input.commentCount ?? 0,
    // Beş haneye SABİTLENİR: kaynak eksik ya da fazla verirse ekran indis kaydırmasıyla yanlış
    // histogram çizerdi ve yanlışlığı görünmezdi (çubuklar hep bir şey gösterir).
    ratingBreakdown: [0, 1, 2, 3, 4].map((i) => input.ratingBreakdown?.[i] ?? 0) as [number, number, number, number, number],
  };
}

/** Hiç beyanı olmayan ürünün skoru — kart "henüz değerlendirilmedi" der; `undefined` dolaşmaz. */
export const EMPTY_PRODUCT_SCORE: ProductScore = {
  average: null,
  stars: null,
  ratingAvg: null,
  ratingCount: 0,
  likeCount: 0,
  dislikeCount: 0,
  likeRatio: null,
  totalCount: 0,
  confident: false,
  commentCount: 0,
  ratingBreakdown: [0, 0, 0, 0, 0],
};
