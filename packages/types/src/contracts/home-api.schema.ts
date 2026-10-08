import { z } from 'zod';
import { CatalogImageSchema, CatalogProductSchema } from './catalog-api.schema';
import { CartLineRouteEnum } from '../primitives/enums.schema';
import { RecipeSchema } from '../entities/recipe.schema';

/**
 * Mobil vitrin ucunun (`GET /api/v1/home`) sözleşmesi: yalnız müşteriden bağımsız bölümler taşınır, Bearer yalnız fiyatı kişiselleştirir.
 * `featured` kataloğun kendi sıralamasından ilk N'dir, web'in sinyalli seçkisi değil (BEKLEYEN(21.14): seçki terfi edince o kapıya döner).
 */

/** Bant türü kartın açacağı katalog süzgecini belirler; kategori ve koleksiyon tek şeritte durur. */
export const HomeBandKindEnum = z.enum(['category', 'collection']);
export type HomeBandKind = z.infer<typeof HomeBandKindEnum>;

/**
 * Vitrin BANDI — 6 slot = 4 kategori + 2 koleksiyon karışımı (sabitler uçta parametrik; eksik
 * veride dizi kısalır, uydurma dolgu yapılmaz).
 */
export const HomeBandSchema = z.object({
  kind: HomeBandKindEnum,
  /** Dil-bağımsız; iki türün de kendi tablosundan gelir (`category.slug` / `collection.slug`). */
  slug: z.string(),
  name: z.string(),
  /** Kategoride `tagline`, koleksiyonda `description`; `null` yazılmamış demektir ve yedek uydurulmaz, ada düşmek tekrar üretirdi. */
  subtitle: z.string().nullable(),
  /**
   * Kataloğun sayacağıyla aynı ölçüt (aktif ürün), yoksa müşteri "14 ürün" okuyup 9 görürdü. `positive`, çünkü ürünü kalmamış bant
   * boş katalog açan bir kapı olurdu ve hiç taşınmaz.
   */
  productCount: z.number().int().positive(),
  image: CatalogImageSchema,
  /**
   * Kesitte yürürlükteki kampanya; tutar değil kampanyanın kendisi taşınır, çünkü motor indirimi sepet üzerinden dağıtır ve birim fiyat
   * sözü verilemez. `label` `null` ise ekran adsız konuşur, `minBasketCents` doluysa cümle eşiği söyler.
   */
  campaign: z
    .object({
      label: z.string().nullable(),
      percent: z.number().nullable(),
      amountCents: z.number().int().nullable(),
      minBasketCents: z.number().int().nullable(),
    })
    .nullable(),
});
export type HomeBand = z.infer<typeof HomeBandSchema>;

/**
 * Katalog kartının indirimli daraltması, `wasCents` zorunlu; kartın fırsat sayılmasının tek ölçütü motorun teklifi kazandırmasıdır.
 * Yer bilinmezken teklif tutarı okunmaz ve dizi boş gelir.
 */
export const HomeOfferSchema = CatalogProductSchema.extend({ wasCents: z.number().int() });
export type HomeOffer = z.infer<typeof HomeOfferSchema>;

/**
 * Hazır paket kartı: `soldOut` ağ geneli ("hiç var mı"), `route` yere bağlıdır ("bana nasıl gelir"); iki eksen ayrı alandır, çünkü tek
 * bayrak öbür depodaki malı "tükendi" ilan ederdi. Gövde açıklamayı, içeriği ve paketin kalıcı teslim gerçeğini taşır.
 */
export const HomePackageSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** Paketin tek fiyatı (TTC, cent). */
  priceCents: z.number().int(),
  /** İçeriğin satır sayısı, adet toplamı değil; içeriksiz paket kart olamaz. */
  itemCount: z.number().int().positive(),
  image: CatalogImageSchema,
  /** Bir kalem bile hiçbir depoda yetmiyorsa paket tükendi; paket bütün satılır. */
  soldOut: z.boolean(),
  /** Bu adrese hangi yolla gelir, kararı motorun (`decideBundleAgainstWarehouse`); `null` = yer bilinmiyor. */
  route: CartLineRouteEnum.nullable(),
  /** Paketin açıklaması; girilmemişse boş. */
  description: z.string(),
  /** Soğuk ya da donuk bir kalem var mı; kargoya uygunluktan türetilmez, donuk ürün de kargolanabilir. */
  coldChain: z.boolean(),
  /** Kargolanamayan bir kalem paketin tamamını bölge içine kilitler; kartın alt satırı bunu yere bakmadan söyler. */
  inRouteOnly: z.boolean(),
  /** Kartın içerik satırı ve foto yığını; görsel tam çerçeve kümesi yerine tek küçük resim adresidir, liste cevabı hafif kalsın. */
  items: z.array(z.object({ name: z.string(), unitLabel: z.string(), qty: z.number().int().positive(), thumbUrl: z.string().nullable() })),
});
export type HomePackage = z.infer<typeof HomePackageSchema>;

/**
 * "Sofradan Fikirler" şeridinin içerik kartı, fiyat ve stok taşımaz. `duration` ve `serves` serbest metindir, çünkü sayı tutulmuyor ve
 * metinden sayı türetmek uydurmak olurdu.
 */
export const HomeRecipeSchema = RecipeSchema.pick({ slug: true }).extend({
  name: z.string(),
  /** Seçili dilde çözülmüş; **`null` = girilmemiş** (boş/boşluk da `null`) → rozet parçası düşer. */
  duration: z.string().nullable(),
  serves: z.string().nullable(),
  /** BİZİM ürünlerimizin satır sayısı ("1 ürün" — adet toplamı değil). */
  itemCount: z.number().int().min(0),
  /** "Evinizden" madde sayısı — satır = madde (`splitLines` kuralı). */
  pantryCount: z.number().int().min(0),
  image: CatalogImageSchema,
});
export type HomeRecipe = z.infer<typeof HomeRecipeSchema>;

/**
 * `/home` cevap zarfı — vitrinin müşteriden bağımsız bölümleri TEK turda (bölüm başına istek yok).
 * Boş dizi meşru cevaptır: ekran o bölümü HİÇ çizmez (web vitrininin aynı kuralı — boş hâl
 * gösterilmez).
 */
export const HomeSchema = z.object({
  bands: z.array(HomeBandSchema),
  offers: z.array(HomeOfferSchema),
  /** Vitrin seçkisi — kataloğun `featured` sırası (gerekçe başlıkta; kart sözleşmesi katalogla ortak). */
  featured: z.array(CatalogProductSchema),
  recipes: z.array(HomeRecipeSchema),
  packages: z.array(HomePackageSchema),
  /**
   * Keşif turunda bu kişiye kalan kart sayısı; `0` ise davet çizilmez, çünkü boş çıkan tura çağırmak olurdu. Davetin cümlesine girmez:
   * kazanç ayardan gelir ve sayıyla çarpılıp yazılsa ayar değişince ekran verilmeyen ödülü vaat ederdi.
   */
  discoverCards: z.number().int().min(0),
});
export type Home = z.infer<typeof HomeSchema>;
