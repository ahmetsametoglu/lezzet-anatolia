import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { ProductFeedbackSchema } from '../entities/product-feedback.schema';
import { FeedbackVoteEnum } from '../primitives/enums.schema';

/**
 * Keşif uçlarının ve ekranının ortak sözleşmesi. Kart katalog kartından türetilmez: aday ürün satılamaz, taşınmayan fiyat ve stok
 * yanlışlıkla gösterilemez; kimlik sunucuda çözülür, gövdeye girmez.
 */

/**
 * Turun tek kartı — v3 `KS` destesinin alanları: ad + tanıtım + görsel.
 *
 * `name` DÜZ STRING: çok dilli metin sunucuda çözülür (`resolveLocalizedText`), çünkü dil yedek
 * zinciri (seçili → TR → FR → DE) tek yerde yaşamalı — katalog kartının aynı kuralı.
 */
export const DiscoverCardSchema = z.object({
  /** Oyun hedefi — `DiscoverVoteBodySchema.productId` bu listeden seçilir. */
  productId: ProductFeedbackSchema.shape.productId,
  name: z.string(),
  /**
   * Kısa tanıtım, seçili dilde. **`null` = hiç girilmemiş** (boş/boşluk da `null`) → kart yalnız ad
   * ve görselle durur; sunucu uydurma metin yazmaz, ekran da boş bir paragraf çizmez.
   */
  description: z.string().nullable(),
  /** Katalog/vitrin kartlarının AYNI görsel şekli (ikinci tanım açılmaz). */
  image: CatalogImageSchema,
});
export type DiscoverCard = z.infer<typeof DiscoverCardSchema>;

/**
 * `GET /discover` cevabı, turun tamamı tek turda; boş deste geçerlidir (aday yok ya da hepsi oylandı). Aday kümesi operatörün
 * elinde büyüdüğü için sayfalanmaz, tavanı uygulama katmanı koyar.
 */
export const DiscoverDeckSchema = z.object({
  cards: z.array(DiscoverCardSchema),
  /**
   * Kart başına keşif puanı ve bir puanın cent karşılığı; ziyaretçinin bitişi biriken puanı parasıyla teklif eder. `null` = ayar
   * okunamadı, teklif sayısız söylenir.
   */
  reward: z.object({ pointsPerCard: z.number().int().positive(), centValue: z.number().nonnegative() }).nullable(),
});
export type DiscoverReward = NonNullable<z.infer<typeof DiscoverDeckSchema>['reward']>;

/**
 * `POST /discover/vote` gövdesi. `dwellMs` sinyal kalitesinin girdisidir, puanın değil; ölçemeyen istemci alanı göndermez, sıfır
 * göndermez, çünkü 0 ms "kart hiç görülmedi" demektir.
 */
export const DiscoverVoteBodySchema = z.object({
  productId: ProductFeedbackSchema.shape.productId,
  vote: FeedbackVoteEnum,
  dwellMs: z.number().int().nonnegative().optional(),
});

/** Kaydırmanın cevabı — turun ilerlemesi ekranda, burada yalnız kaydın iki gerçeği. */
export const DiscoverSwipeSchema = z.object({
  /**
   * Kaydırma kimliği — **yalnız GİRİŞSİZ kaydırmada dolu.** Ziyaretçi bunları cihazında saklar ve
   * giriş dönüşünde talep kapısına getirir (`/me/discover/claim`). Girişli müşteride `null`: satır
   * zaten sahibinin üstünde ve talep kapısı kimlikli satırı kabul etmiyor — dönseydi istemci hiçbir
   * zaman kullanılamayacak bir liste biriktirir, sonra onu kapıya götürüp sessizce sıfır alırdı.
   */
  id: ProductFeedbackSchema.shape.id.nullable(),
  /**
   * Bu kaydırma için gerçekten yazılan puan; `null` = girişsiz, ödülün sahibi yok (sıfır değil), `0` = yazılmadı (günlük tavan,
   * B2B, ikinci oy). Bitişin sayısı bunların toplamıdır, kart sayısı × ayar değil.
   */
  pointsAwarded: z.number().int().nonnegative().nullable(),
  /**
   * Bu yazımdan sonraki bakiye; istemcide hesaplanamaz, çünkü bakiye turun dışında da değişir. Her oyda taşınır ki bitiş ayrı bir
   * okuma beklemesin; `null` = kimliksiz kaydırma.
   */
  balance: z.number().int().nullable(),
});

/**
 * `POST /me/discover/claim` gövdesi; kimlikler istemciden gelir ama kuralı uygulama katmanının talep kapısı uygular. Tavan bir
 * turun birkaç katı, sınırsız liste tek istekte yüzlerce satır okuturdu.
 */
export const DiscoverClaimBodySchema = z.object({
  swipeIds: z.array(ProductFeedbackSchema.shape.id).min(1).max(200),
});

/** Talep sonucu — kaç kaydırma bağlandı, karşılığında kaç puan YAZILDI. */
export const DiscoverClaimResultSchema = z.object({
  /** Hesaba bağlanan kaydırma sayısı; gönderilenden AZ olabilir (aynı ürün zaten oylanmışsa). */
  linked: z.number().int().nonnegative(),
  /** Gerçekten yazılan puan — tavana takılan ya da zaten ödenmiş olan buraya girmez. */
  points: z.number().int().nonnegative(),
});
