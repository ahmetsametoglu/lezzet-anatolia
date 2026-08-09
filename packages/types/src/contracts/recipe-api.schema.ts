import { z } from 'zod';
import { CatalogImageSchema } from './catalog-api.schema';
import { HomeRecipeSchema } from './home-api.schema';
import { ProductSchema } from '../entities/product.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { RecipeItemSchema, RecipeSchema } from '../entities/recipe.schema';

/**
 * TARİF DETAY SÖZLEŞMESİ (21.14) — mobil `GET /api/v1/recipes/:slug` ucunun ve onu tüketen Expo
 * tarif ekranının ORTAK dili. Terfi gerekçesi `catalog-api.schema.ts` ile aynı (02-mimari §3.2
 * "sözleşme tek kaynak"): üreten ve tüketen aynı şemayı çağırır, alan adı değişirse iki taraf
 * birden DERLEME anında kırılır.
 *
 * ── FİYAT/STOK MOTORDAN GELİR, TARİFTEN DEĞİL ────────────────────────────────
 * Tarif İÇERİKTİR (`RecipeService` künyesi: servis karar vermez); satır fiyatı ve tükendi kararı
 * `@lezzet/application`ın vitrin indirgemesinden (`sellingOf` + `stockStatusOf`) okunur — katalog
 * kartının okuduğu kararların TAM AYNISI. Aynı ürün katalogda başka, tarifte başka fiyat
 * gösteremez. Yer bilinmezken (`UNKNOWN_PLACE`) davranış da katalogla birdir: teklif tutarı hiç
 * okunmaz, stok depo-üstü toplamdan cevaplanır.
 *
 * ── SATIR LİSTESİ TARİFİN KENDİ SIRASIDIR, AMA HERKES TAŞINMAZ ───────────────
 * Satıştan kalkmış (aday/pasif) ürünün satırı HİÇ taşınmaz (DOMAIN §13: katalogda görünmeyen ürün
 * linkle de satılamaz; detayı zaten 404). "Tükendi" o satırın hâli OLAMAZDI — tükendi "yeniden
 * gelecek" der, satıştan kalkan gelmeyecek. Tükenen ürün ise listede KALIR (katalogun aynı kuralı)
 * ve `soldOut` ile işaretlenir: satır soluk aksiyonsuz çizilir, ürüne tıklanabilir kalır.
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
  /** Boy etiketi ("700 g tepsi"), seçili dilde; tek boylu üründe boş olabilir. */
  variantLabel: z.string(),
  /**
   * Tarifin bu boydan İSTEDİĞİ adet (veri modelinin kendi tanımı: toplam = Σ qty × fiyat —
   * `recipe.schema.ts`). v3 kurucusunda bu eksen YOK (mock verisi hep 1'di); + ve "hepsini ekle"
   * bu adediyle ekler ki satırın +'sı ile alt barın toplamı birbirini yalanlamasın.
   */
  qty: RecipeItemSchema.shape.qty,
  /**
   * Birim fiyat (ham cent) — biçim istemcinin işi. **`null` = bu kanalda fiyatı yok → satır
   * SATIŞA KAPALI**: + çizilmez, fiyat parçası düşer. Sıfır YAZILMAZ (`CLAUDE §1`).
   */
  priceCents: z.number().int().nullable(),
  /**
   * İndirim öncesi referans — kart sözleşmesinin aynı kuralı: **alan hiç yoksa indirim de yoktur**.
   * Sepet satırının `discounted` rozeti bundan kurulur. Yer bilinmezken hiç dolmaz (teklif sözü).
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
   * "35 dk" / "3–4 kişilik" — SERBEST METİN, sayı değil (05.16: hesap yok, birim çekimi dile
   * bağlı; `serves` aralık olabilir). **`null` = girilmemiş** → rozet parçası düşer; ikisi de
   * boşsa rozet hiç çizilmez.
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
  /** Hazırlanış — satır = adım; NUMARAYI EKRAN verir (05.16). **Boş dizi = bölüm çizilmez.** */
  steps: z.array(z.string()),
});
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;

/**
 * TARİF LİSTE SÖZLEŞMESİ (Fikirler sekmesi) — `GET /api/v1/recipes`.
 *
 * ── KART İKİNCİ KEZ TANIMLANMADI ─────────────────────────────────────────────
 * Satır şeması `HomeRecipeSchema`ın KENDİSİDİR, daraltması ya da kopyası değil (CLAUDE §1 — tip
 * duplikasyonu da duplikasyondur): vitrin şeridindeki kart ile liste sayfasındaki kart AYNI kartlar
 * ve aynı okuma kapısından çıkıyorlar (`apps/mobile-api/src/lib/ideas.ts`). Ayrı bir
 * `RecipeCardSchema` açmak, iki şeklin bir gün sessizce ayrışmasına kapı bırakırdı. Adın "Home" ile
 * başlaması bir borçtur (kart artık iki yüzeyde): ad `HomeRecipe` kaldı çünkü onu ekran, fixture ve
 * uç birlikte okuyor — yeniden adlandırma ayrı bir iştir, kapsamı bu değil.
 *
 * ── SAYFALAMA YOK, TAVAN VAR (CLAUDE §1) ─────────────────────────────────────
 * Tarif kümesi operatörün elle kurduğu EDİTORYAL bir seçkidir, veriyle büyümez → keyset değil,
 * tek turda. `nextCursor` alanı bilerek yok: dolduramayacağı bir alan taşıyan sözleşme, ekranı
 * "devamı yok" ile "devamı bilinmiyor"u ayırt edemez hâlde bırakır. Uçtaki emniyet sınırı
 * (`RECIPE_LIST_LIMIT`) sayfalama DEĞİL, elle kurulan kümenin bir gün yüz satıra çıkmasına karşı
 * korumadır (web `RECIPE_PAGE_LIMIT` emsali).
 *
 * Zarf SATIR ŞEMASI DEĞİL, nesnedir (`CatalogCategoryListSchema` emsali): uç yarın anahtarı
 * değiştirse çıplak dizi bunu yakalayamazdı.
 */
export const RecipeListSchema = z.object({ recipes: z.array(HomeRecipeSchema) });
export type RecipeList = z.infer<typeof RecipeListSchema>;
