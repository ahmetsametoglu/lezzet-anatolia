import { z } from 'zod';
import { ProductFeedbackSchema } from '../entities/product-feedback.schema';

/*
  Ürün yorumlarının okuma sözleşmesi: ürün detayındaki seçki ve "tüm yorumlar" ekranının sayfalı listesi; web ve native aynı şekli
  okur. Yazar adı sunucuda kısaltılır ve metin okuyucunun dilinde gelir, orijinali yanında durur.
*/

/** Ürün sayfasının telefon seçkisi; tasarım üç kart gösterir, fazlası alt alta benzer ürünleri ekranlarca iterdi. */
export const REVIEW_PREVIEW_SIZE = 3;

/** Tüm yorumlar ekranının sayfa boyu; seçkiden ayrı sayıdır, çünkü seçki bir tadımlık, liste okunacak bir küme. */
export const REVIEW_PAGE_SIZE = 10;

/** "Tüm yorumlar" ekranının yıldız süzgeçleri; `low` 3★ ve altıdır, çünkü 1★ ile 2★ ayrımı müşteriye bir şey söylemez. */
export const ReviewRatingFilterEnum = z.enum(['five', 'four', 'low']);
export type ReviewRatingFilter = z.infer<typeof ReviewRatingFilterEnum>;

/** Yayınlanmış yorum; `language` orijinalin dilidir, `null` = tespit henüz koşmadı. */
export const PublishedReviewSchema = ProductFeedbackSchema.pick({ id: true, rating: true, vote: true, language: true, createdAt: true }).extend({
  /** Ad ve soyadın baş harfi ("Hugo B."); soyadın tamamı yayımlanmaz. */
  authorName: z.string(),
  /** Okuyucunun dilinde gösterilecek metin; çeviri yoksa orijinal. */
  comment: z.string().nullable(),
  /** Gösterilen metin makine çevirisi mi; ekran "orijinali göster" bağlantısını buna göre çizer. */
  commentTranslated: z.boolean(),
  originalComment: z.string().nullable(),
});
export type PublishedReview = z.infer<typeof PublishedReviewSchema>;

const count = z.number().int().nonnegative();

/** Ürünün puan özeti: başlıktaki "★ 4,4 (5 değerlendirme)" ve tüm yorumlar ekranının dağılımı. */
export const ReviewSummarySchema = z.object({
  /** 1–5 birleşik puan; `null` = henüz beyan yok, sıfır puan değil. */
  average: z.number().nullable(),
  /** Skora katılan beyan sayısı (yıldız ve beğeni). */
  totalCount: count,
  /** Yayınlanmış yazılı yorum sayısı; "N yorumun tümü" bunu sayar. */
  commentCount: count,
  /** Yıldız dağılımı, indis 0 = 1★. */
  ratingBreakdown: z.tuple([count, count, count, count, count]),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

/** Ürün detayındaki seçki: özet ve en yeni yorumlar. */
export const ReviewPreviewSchema = z.object({
  summary: ReviewSummarySchema,
  items: z.array(PublishedReviewSchema),
});
export type ReviewPreview = z.infer<typeof ReviewPreviewSchema>;

/** Tüm yorumlar sayfası; imleç opaktır ve aynen geri verilir, `null` liste bitti demek. */
export const ReviewPageSchema = z.object({
  /** Okuyucunun dilinde ürün adı; ekran bağlantıyla doğrudan açılınca da hangi ürünün yorumları olduğunu söyler. */
  productName: z.string(),
  summary: ReviewSummarySchema,
  rows: z.array(PublishedReviewSchema),
  nextCursor: z.string().nullable(),
});
export type ReviewPage = z.infer<typeof ReviewPageSchema>;
