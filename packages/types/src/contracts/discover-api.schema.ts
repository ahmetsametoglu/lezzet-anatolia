import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { ProductFeedbackSchema } from '../entities/product-feedback.schema';
import { FeedbackVoteEnum } from '../primitives/enums.schema';

/**
 * KEŞİF TURU SÖZLEŞMESİ (21.19) — mobil `/api/v1/discover` uçlarının ve onları tüketen keşif
 * ekranının (v3 `vKesif`) ORTAK dili. Terfi gerekçesi `feedback-api.schema.ts` ile aynı (02-mimari
 * §3.2 "sözleşme tek kaynak"): üreten ve tüketen aynı şemayı çağırır, alan adı değişirse iki taraf
 * birden DERLEME anında kırılır.
 *
 * ── ADAY ÜRÜN SATILABİLİR ÜRÜN DEĞİLDİR ─────────────────────────────────────
 * Kart `CatalogProductSchema`dan TÜRETİLMEDİ ve bu şemanın en önemli kararı bu. Katalog kartı fiyat,
 * stok hâli, `variantId` ve `purchaseMode` taşıyor; aday üründe bunların hiçbiri yok ve tasarımın
 * yasağı tam bu (`musteri-kesif.md §6`: *"aday ürünler satın alınabilir gibi sunulmaz — fiyat,
 * stok, sepete ekleme yoktur"*). Katalog kartını `.pick` ile daraltmak da yetmezdi: daraltma bir
 * gün geri açılabilir, ayrı bir şekil açılamaz. **Taşınmayan alan, yanlışlıkla gösterilemez.**
 *
 * ── KİMLİK ZARFA GİRMEZ ─────────────────────────────────────────────────────
 * Hiçbir gövde `customerId` almaz ve hiçbir cevap taşımaz: kimlik SUNUCUDA çözülür (Bearer varsa
 * müşteri, yoksa ziyaretçi — `feedback-api.schema.ts`in token kararıyla aynı ilke, kaynağı farklı).
 * İstemciden kimlik kabul etmek, başkasının adına oy yazdırmaktı.
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
 * `GET /discover` cevabı — turun tamamı tek turda.
 *
 * SATIR şeması yetmez, zarf da sözleşmedir (`CatalogCategoryListSchema` emsali): uç yarın
 * `{ items: [...] }` yazsa satır şeması bunu yakalamaz ve istemci derlemede değil çalışma zamanında
 * kırılırdı.
 *
 * **Boş deste GEÇERLİ bir cevaptır** ve `min(1)` bilerek YOK — davet akışının tersine (orada kartsız
 * davet 404). Aday ürün olmaması bir arıza değil normal bir hâl: operatör henüz aday açmamıştır ya
 * da müşteri hepsini oylamıştır. Ekranın bunun için ayrı bir hâli var (boş deste ≠ tamamlanan tur).
 *
 * Sayfalama YOK: aday kümesi veriyle değil operatörün eliyle büyür — doğal tavanı olan küme tek
 * turda çekilir (`CLAUDE §1`). Tavanı uygulama katmanı koyar (`DECK_SIZE`), istemci istemez.
 */
export const DiscoverDeckSchema = z.object({ cards: z.array(DiscoverCardSchema) });

/**
 * `POST /discover/vote` gövdesi — bir kartın kaydırılması.
 *
 * `dwellMs` KARTTA GEÇİRİLEN SÜRE ve isteğe bağlıdır: sinyal KALİTESİNİN girdisidir, puanın değil
 * (DOMAIN §14 "ödül ≠ güven") — ekran ölçer, motor değerlendirir. Ölçemeyen bir istemci alanı hiç
 * göndermez; **sıfır göndermez** (`CLAUDE §1`: ölçülemeyen değer sıfır değildir — 0 ms "kart hiç
 * görülmedi" demektir ve o kaydırmayı motor gürültü sayar).
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
   * Bu kaydırma için GERÇEKTEN yazılan puan. **`null` = girişsiz** — ödülün henüz sahibi yok ve bu
   * SIFIR DEĞİLDİR (`CLAUDE §1`): puan giriş dönüşünde talep kapısında doğar. `0` ise gerçekten
   * yazılmadı (günlük tavan · B2B · aynı ürüne ikinci oy) ve bu da doğru cevaptır.
   *
   * Ekranın bitiş cümlesi ("+N puan kazandınız") bu sayıların TOPLAMIDIR, kart sayısı × ayar değil:
   * ekranın vaat ettiği ile motorun yazdığı ayrışırsa müşteri gelmeyecek bir ödül için hareket eder
   * (29.07 denetiminin kapattığı arıza sınıfı).
   */
  pointsAwarded: z.number().int().nonnegative().nullable(),
});

/**
 * `POST /me/discover/claim` gövdesi — girişsizken yapılan turun hesaba bağlanması.
 *
 * Kimlikler İSTEMCİDEN gelir ama sunucuda üç kapıdan geçer (kimliksiz olmalı · `candidate`
 * bağlamında olmalı · oy taşımalı) — kural `@lezzet/application`ın talep kapısında, burada değil.
 *
 * Tavan bir turun kart sayısının birkaç katı: sınırsız bir liste hem cihazı şişirir hem tek istekte
 * yüzlerce satır okutur. Web'in tarayıcı deposu da aynı sayıda duruyor (`discover-store.ts` MAX).
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
