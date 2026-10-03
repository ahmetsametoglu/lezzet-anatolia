import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { HomeRecipeSchema } from './home-api.schema';
import { ProductSchema } from '../entities/product.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { RecipeItemSchema, RecipeSchema } from '../entities/recipe.schema';

/**
 * Tarif detay sözleşmesi — mobil `GET /api/v1/recipes/:slug` ucu ile Expo tarif ekranının ortak dili; satır fiyatı ve tükendi kararı
 * katalog kartının indirgemesinden (`sellingOf`, `stockStatusOf`) gelir ki aynı ürün tarifte başka fiyatlanmasın. Satıştan kalkmış
 * ürünün satırı taşınmaz (`DOMAIN §13`), tükenen ürün `soldOut` ile listede kalır.
 */

/**
 * Tarifin BİZİM ürün satırı — v3 `rc.rows` (tasarım 21, v3:1892-1899): ad + boy + fiyat + görsel +
 * stok + gezinme. Kart sözleşmesinin (`CatalogProductSchema`) daraltması DEĞİL: satır ürünün İLK
 * boyunu değil TARİFİN SEÇTİĞİ boyu taşır (kalem varyanta bağlıdır — `recipe_item` künyesi),
 * o yüzden alanlar boy düzeyinden okunur.
 */
export const RecipeRowSchema = z.object({
  /** Satıra basınca açılacak ürün (rota `/product/[slug]`). */
  productSlug: ProductSchema.shape.slug,
  /**
   * Tarifin bağlandığı boy — sepet satırının kimliği bundan kurulur (`${productSlug}-${variantId}`,
   * ürün detayının aynı şeması): tariften ve ürün sayfasından eklenen aynı boy TEK satırda birleşir.
   */
  variantId: ProductVariantSchema.shape.id,
  /** Ürün adı, seçili dilde çözülmüş (dil yedek zinciri SUNUCUDA — istemci dil bilmez). */
  name: z.string(),
  /** Boyun müşteriye görünen adı ("4 adet · 420 g"), seçili dilde. */
  variantLabel: z.string(),
  /**
   * Tarifin bu boydan İSTEDİĞİ adet (veri modelinin kendi tanımı: toplam = Σ qty × fiyat —
   * `recipe.schema.ts`). v3 kurucusunda bu eksen YOK (mock verisi hep 1'di); + ve "hepsini ekle"
   * bu adediyle ekler ki satırın +'sı ile alt barın toplamı birbirini yalanlamasın.
   */
  qty: RecipeItemSchema.shape.qty,
  /**
   * Birim fiyat (ham cent), biçim istemcinin işi; `null` bu kanalda fiyatı olmayan, satışa kapalı satırdır: + çizilmez, fiyat
   * parçası düşer. Sıfır yazılmaz (`CLAUDE §1`).
   */
  priceCents: z.number().int().nullable(),
  /**
   * İndirim öncesi referans, kart sözleşmesinin kuralıyla: alan yoksa indirim de yoktur ve sepet satırının `discounted` rozeti bundan
   * kurulur. Yer bilinmezken hiç dolmaz (teklif sözü).
   */
  wasCents: z.number().int().optional(),
  image: CatalogImageSchema,
  /**
   * Tükendi — YALNIZ gerçek tükenmede (`out_of_stock`) true; motor kararı, uç hesaplamaz.
   * Satır listede kalır (tekrar gelecek beklentisi), + yerine "Tükendi" yazılır (v3 `so` hâli).
   */
  soldOut: z.boolean(),
});
export type RecipeRow = z.infer<typeof RecipeRowSchema>;

/**
 * Tarif detayı — sayfanın TAMAMI tek turda (v3 `vRecipe`, tasarım 21): kahraman + künye + bizden
 * satırlar + evinizden maddeler + hazırlanış. Bölüm başına çağrı yok (ürün detayının sözü).
 */
export const RecipeDetailSchema = RecipeSchema.pick({ slug: true }).extend({
  name: z.string(),
  /** Seçili dilde tek metin; **`null` = hiç girilmemiş** (boş/boşluk da `null`) → paragraf düşer. */
  description: z.string().nullable(),
  /**
   * "35 dk" / "3–4 kişilik" — serbest metin, sayı değil, çünkü hesap yapılmaz ve birim çekimi dile bağlıdır (`serves` aralık
   * olabilir). `null` girilmemiş demektir: rozet parçası düşer, ikisi de boşsa rozet çizilmez.
   */
  duration: z.string().nullable(),
  serves: z.string().nullable(),
  image: CatalogImageSchema,
  /** Sıra tarifin editoryal kalem sırası (`recipe_item.sort_order`); müşteri sıralamaz. */
  rows: z.array(RecipeRowSchema),
  /**
   * "Evinizden" maddeleri — satır = madde (`splitLines`, tek kural iki yüzey). Bunlar bizim
   * ürünümüz DEĞİL, sepete eklenmez. **Boş dizi = bölüm çizilmez.**
   */
  pantry: z.array(z.string()),
  /** Hazırlanış: satır = adım, numarayı ekran verir; boş dizide bölüm çizilmez. */
  steps: z.array(z.string()),
});
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;

/**
 * Tarif liste sözleşmesi (Fikirler sekmesi, `GET /api/v1/recipes`): satır şeması vitrin kartının kendisidir (`HomeRecipeSchema`),
 * çünkü iki kart aynı okuma kapısından çıkar ve ayrı şema bir gün sessizce ayrışırdı. Küme operatörün kurduğu editoryal seçki olduğu
 * için tek turda gelir ve `nextCursor` yoktur; zarf nesnedir, çünkü çıplak dizi ucun anahtar değişikliğini yakalayamazdı.
 */
export const RecipeListSchema = z.object({ recipes: z.array(HomeRecipeSchema) });
export type RecipeList = z.infer<typeof RecipeListSchema>;
