import { z } from 'zod';
import { dbNumericNullable } from './db-numeric';
import { FeedbackContextEnum, FeedbackVoteEnum, ReviewStatusEnum } from './enums.schema';
import { SourceLanguageSchema, TranslationBagSchema } from './user-text.schema';

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
  /**
   * Metnin GERÇEK dili — site dili değil, müşterinin yazdığı dil (Boşnakça da olabilir).
   * `null` = tespit henüz koşmadı. **Yalnız çeviri işi yazar** (20.2).
   */
  language: SourceLanguageSchema.nullable(),
  /** Makine çevirileri; kaynak dil torbada yoktur (orijinal `comment`'te durur). */
  translations: TranslationBagSchema.nullable(),
  /** Çeviri işi bu satıra baktı mı — **başarısızlıkta da dolar**, yoksa kuyruk tıkanır. */
  translatedAt: z.string().nullable(),
  /** Kartta geçirilen süre — sinyal kalitesi (DOMAIN §14). Yalnız kaydırmada anlamlı. */
  dwellMs: z.number().int().nullable(),
  status: ReviewStatusEnum,
  moderatedAt: z.string().nullable(),
  moderatedBy: z.string().uuid().nullable(),
  /**
   * "Bu ürün geldi" haberi bu kişiye verildi mi (17.8 zemini). `null` = verilmedi.
   *
   * Aday kaydırması bir TALEP BEYANIDIR ("bunu isterim"); ürün kataloğa girince o beyanı yapana
   * haber vermek, keşif turunun karşılığını ödediği andır. Ayrı bir "ilgi" tablosu açılmadı —
   * kim hangi ürünü istiyor bilgisi zaten bu satırda ve `product_feedback_customer_key` onu kişi
   * başına tek satıra indiriyor; ikinci bir tablo aynı gerçeği iki yerde tutardı.
   */
  notifiedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ProductFeedback = z.infer<typeof ProductFeedbackSchema>;

/**
 * Giriş. `status` VARDIR ve bilerek: metinli kayıt `pending`, metinsiz `approved` doğar; bu kararı
 * motor verir (`initialFeedbackStatus`) ve kapı taşır. Şemadan çıkarsaydık kararı servis vermek
 * zorunda kalırdı — servis karar vermez (STACK §4).
 *
 * **Kendi yorumunu yayına almanın yolu yine de kapalı:** `status='approved'` + metin + damgasız bir
 * satır `feedback_moderation_stamp` kısıtını ihlal eder. Yani güvence uygulamanın nezaketinde değil,
 * veritabanında.
 *
 * Üç biçimden **en az biri** gerekir (DB kısıtı da zorlar).
 *
 * **`language` girişte YOK ve bu bir düzeltmedir:** eskiden kapı müşterinin SİTE dilini yazıyordu.
 * O bir kanıt değil bir tahmindi ve tam da bu işin var oluş sebebinde (Fransız sayfasında yazılan
 * Boşnakça yorum) yanlıştı. Dili artık metne bakan taraf yazar (20.2).
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

