import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { FeedbackRequestSchema } from '../entities/feedback-request.schema';
import { ProductFeedbackSchema } from '../entities/product-feedback.schema';
import { FeedbackVoteEnum } from '../primitives/enums.schema';

/**
 * Değerlendirme akışı sözleşmesi: mobil `/api/v1/feedback/:token` uçları ve onları tüketen ekran aynı şemayı çağırır. Davetin
 * kimlikleri zarfa girmez, çünkü her eylem belirteçle yapılır ve kimlik sunucuda ondan çözülür.
 */

/** Akıştaki tek kart: siparişteki bir ürün; aynı ürünün iki boyu tek karttır. */
export const FeedbackCardSchema = z.object({
  /** Oy ve yorum yazımının hedefi. */
  productId: ProductFeedbackSchema.shape.productId,
  /** Seçili dilde çözülmüş ad; dil yedek zinciri sunucuda. */
  name: z.string(),
  image: CatalogImageSchema,
  /** Ürünün siparişteki boyları ve adetleri ("6 adet · 225 g · ×1"). */
  detail: z.string(),
  /** Müşterinin bu davetten önceki cevabı; yarıda bırakılan akış bununla sürer. */
  existing: z
    .object({
      vote: ProductFeedbackSchema.shape.vote,
      rating: ProductFeedbackSchema.shape.rating,
      comment: ProductFeedbackSchema.shape.comment,
    })
    .nullable(),
});
export type FeedbackCard = z.infer<typeof FeedbackCardSchema>;

/** `GET /feedback/:token` cevabı: davet açıldığında ekranın gördüğü her şey, tek turda. */
export const FeedbackInviteSchema = z.object({
  customerName: z.string().nullable(),
  orderReferenceNo: z.string().nullable(),
  /** Ham ISO; biçimleme ekranın işi. */
  orderedOn: z.string().nullable(),
  /** Kartsız davet uçtan çıkmaz; boş bir akış müşteriye "bozuk" der. */
  cards: z.array(FeedbackCardSchema).min(1),
  /** Türetilir, saklanmaz; sayaç tutulsaydı bir gün gerçekle ayrışırdı. */
  progress: z.object({
    rated: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** Akışı bitirmenin puanı. Puan sayıları ayardan gelir; ekrana gömülseydi ayar değişince sistemin vermeyeceği sayıyı söylerdi. */
  completionPoints: z.number().int().nonnegative(),
  /** Oylanan her ürünün puanı. */
  votePoints: z.number().int().nonnegative(),
  /** Yorum yazılan her ürünün puanı. */
  reviewPoints: z.number().int().nonnegative(),
  /** Puan getiren yorumun en az kelime sayısı; ekran uyarıyı bununla kurar, kararı yazım ucu verir. */
  reviewMinWords: z.number().int().positive(),
  /** Doluysa davet tamamlanmış: akış kurulmaz, puan ikinci kez verilmez. */
  completedAt: FeedbackRequestSchema.shape.completedAt,
  pointsAwarded: FeedbackRequestSchema.shape.pointsAwarded,
});
export type FeedbackInvite = z.infer<typeof FeedbackInviteSchema>;

/** `POST /feedback/:token/vote` gövdesi. */
export const FeedbackVoteBodySchema = z.object({
  productId: ProductFeedbackSchema.shape.productId,
  vote: FeedbackVoteEnum,
});

/**
 * `POST /feedback/:token/review` gövdesi: bir ürünün yıldızı ve yorumu. Gönderilmeyen alana dokunulmaz; boş gövde `review_empty`,
 * alt sınırın altındaki yorum `comment_too_short` döner.
 */
export const FeedbackReviewBodySchema = z.object({
  productId: ProductFeedbackSchema.shape.productId,
  rating: ProductFeedbackSchema.shape.rating.optional(),
  comment: z.string().nullish(),
});

/** Yazım uçlarının başarı cevabı. */
export const FeedbackAckSchema = z.object({ recorded: z.literal(true) });

/**
 * Akış sonunu motor söyler (`feedbackOutcomeOf`), çünkü "memnun mu" beğeni oranına bakan bir eşiktir. Değerler motorun birliğiyle
 * aynıdır; uç gövdeyi `z.input` ile tiplediği için sapma derlemede yakalanır.
 */
export const FeedbackOutcomeEnum = z.enum(['review_invite', 'report_issue', 'thanks']);

/** `POST /feedback/:token/complete` cevabı. */
export const FeedbackCompletionSchema = z.object({
  outcome: FeedbackOutcomeEnum,
  /** Bu çağrının yazdığı puan, yani bitirme primi; ikinci tamamlamada 0. */
  pointsAwarded: z.number().int().nonnegative(),
  /**
   * Bu davete yazılmış toplam puan: oylar, yorumlar ve bitirme primi. Kaynağı defterdir, çünkü hangi kaydın puan doğurduğuna
   * tavan, B2B kuralı ve kaynak tekilliği karar verir ve ekran bunları bilmez.
   */
  invitePointsTotal: z.number().int().nonnegative(),
  balance: z.number().int(),
  /** Yalnız `review_invite` sonucunda dolu; dış değerlendirme adresi ve düğmede yazacak ad ayardan. */
  reviewUrl: z.string().nullable(),
  reviewPlatform: z.string().nullable(),
});
export type FeedbackCompletion = z.infer<typeof FeedbackCompletionSchema>;
