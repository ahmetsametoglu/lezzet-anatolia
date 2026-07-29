import { z } from 'zod';
import { dbNumericNullable } from './db-numeric';
import { FeedbackContextEnum, FeedbackVoteEnum, PreferredLanguageEnum, ReviewStatusEnum } from './enums.schema';

// ProductFeedback — müşterinin bir ürün hakkında bize VERMEYİ SEÇTİĞİ değerlendirme (17.1, 17.3;
// migration 0036). DOMAIN §14.
//
// Üç biçim tek varlıkta: yıldız · yazılı yorum · beğen/geç. Ayrımları biçimden ibarettir; müşteri,
// ürün, tarih, puan kazanımı, tekillik, skor katkısı ve silme yolu üçünde de aynıdır.
//
// **Analitikle karıştırılmamalı:** `AnalyticsEvent` müşteriyi tanımadan toplanan gezinme İZİdir;
// burası BEYAN. Puan kazandıran, kişiye bağlanan, "bir kez" kuralı olan bir kayıt anonim bir olay
// defterinde duramaz (DATA_MODEL "İZ ile BEYAN ayrı yaşar").

export const ProductFeedbackSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  /** `null` = giriş yapmamış ziyaretçinin keşif kaydırması; puan yalnız kimliklide doğar. */
  customerId: z.string().uuid().nullable(),
  /** Doğrulanmış alışveriş — `purchase` bağlamında kapı yazar. */
  orderId: z.string().uuid().nullable(),
  /** Alım-sonrası davetten geldiyse (17.2); davetin ilerlemesi buradan türetilir. */
  feedbackRequestId: z.string().uuid().nullable(),
  context: FeedbackContextEnum,
  rating: z.number().int().min(1).max(5).nullable(),
  vote: FeedbackVoteEnum.nullable(),
  comment: z.string().nullable(),
  /** Metnin dili — **çevrilmez**; metinsiz kayıtta boş. */
  language: PreferredLanguageEnum.nullable(),
  /** Kartta geçirilen süre — sinyal kalitesi (DOMAIN §14). Yalnız kaydırmada anlamlı. */
  dwellMs: z.number().int().nullable(),
  status: ReviewStatusEnum,
  moderatedAt: z.string().nullable(),
  moderatedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type ProductFeedback = z.infer<typeof ProductFeedbackSchema>;

/**
 * Giriş. `status` YOK: metinli kayıt `pending`, metinsiz `approved` doğar ve bu KURAL kapının
 * işidir — yazanın kendi yorumunu yayına alabilmesi, moderasyonu dışarıdan atlatmak olurdu.
 *
 * Üç biçimden **en az biri** gerekir (DB kısıtı da zorlar).
 */
export const ProductFeedbackInsertSchema = z
  .object({
    productId: z.string().uuid(),
    customerId: z.string().uuid().nullish(),
    orderId: z.string().uuid().nullish(),
    feedbackRequestId: z.string().uuid().nullish(),
    context: FeedbackContextEnum,
    rating: z.number().int().min(1).max(5).nullish(),
    vote: FeedbackVoteEnum.nullish(),
    comment: z.string().nullish(),
    language: PreferredLanguageEnum.nullish(),
    dwellMs: z.number().int().nonnegative().nullish(),
    status: ReviewStatusEnum.optional(),
  })
  .refine((v) => v.rating != null || v.vote != null || (v.comment?.trim().length ?? 0) > 0, {
    message: 'Değerlendirme boş olamaz: yıldız, beğeni ya da metin gerekir',
    path: ['comment'],
  });
export type ProductFeedbackInsert = z.infer<typeof ProductFeedbackInsertSchema>;

export const ProductFeedbackUpdateSchema = ProductFeedbackSchema.partial().required({ id: true });
export type ProductFeedbackUpdate = z.infer<typeof ProductFeedbackUpdateSchema>;

/**
 * `product_rating` görünümü — ürün skorunun **HAM** sayıları.
 *
 * Görünüm birleştirmez: "yıldız ortalaması + beğeni oranı → tek puan" formülü motorda tek yerde
 * durur (`productScoreOf`). Katsayı SQL'e gömülseydi ekranın gösterdiği skorla motorun hesapladığı
 * bir gün ayrışırdı.
 */
export const ProductRatingSchema = z.object({
  productId: z.string().uuid(),
  /** `null` olabilir: yalnız beğeni/metin gelmiş üründe yıldız ortalaması yoktur. */
  ratingAvg: dbNumericNullable,
  ratingCount: z.number().int(),
  likeCount: z.number().int(),
  dislikeCount: z.number().int(),
  /** Metin yazılmış kayıt sayısı — "kaç kişi puan verdi" ile "kaç kişi yazdı" farklı sorulardır. */
  commentCount: z.number().int(),
});
export type ProductRating = z.infer<typeof ProductRatingSchema>;

/**
 * `candidate_demand` görünümü — aday ürün talep panosu (13.4).
 *
 * `identifiedLikeCount` ayrı durur: "kaç beğeni" ile "kaç KİŞİ beğendi" farklı sorulardır ve
 * ziyaretçi kaydırması tekilleştirilemez (kimlik tutulmuyor). Panonun güven göstergesi bu farktan
 * ve `avgDwellMs`'ten çıkar — çok kısa süre toplu savurma işaretidir.
 */
export const CandidateDemandSchema = z.object({
  productId: z.string().uuid(),
  likeCount: z.number().int(),
  dislikeCount: z.number().int(),
  identifiedLikeCount: z.number().int(),
  avgDwellMs: dbNumericNullable,
});
export type CandidateDemand = z.infer<typeof CandidateDemandSchema>;
