import { z } from 'zod';
import { CategorySchema } from '../entities/category.schema';
import { CollectionSchema } from '../entities/collection.schema';
import { StockStatusEnum } from '../primitives/enums.schema';
import { ImageCropSchema } from '../primitives/image.schema';
import { ImageFrameSourcesSchema } from '../primitives/image-frames';
import { ProductSchema } from '../entities/product.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { StockSchema } from '../entities/stock.schema';

/**
 * Katalog sözleşme şemaları — mobil `/api/v1/{categories,products,products/:slug}` uçlarının ve Expo ekranının ortak dili;
 * alanlar `@lezzet/application` vitrin tiplerinin (`storefront-types.ts`) aynasıdır, uç şekli indirgemez, yeniden adlandırmaz.
 * Aynanın kilidi uçtadır: `catalog.ts` yanıt gövdesini `z.input<…>` ile tipler; types iç pakete bağlanamadığı (`types-is-pure`)
 * için `TextSegment` kilidi de oradan gelir.
 */

/**
 * Görselin çözülmüş hâli — anahtar değil, public URL + kırpma künyesi (`StorefrontImage` aynası).
 * Dışa verilir: vitrin sözleşmesi (`home-api.schema.ts`) aynı şekli okur.
 */
export const CatalogImageSchema = z.object({
  /** `null` = görsel yok ya da R2 taban adresi ayarsız; istemci yer tutucu çizer. */
  url: z.string().nullable(),
  crop: ImageCropSchema,
  /**
   * CDN türevleri — çerçeve başına, operatörün kadrajıyla kesilmiş ve genişlik merdivenine ölçeklenmiş adresler; telefon her
   * kutuya özgün dosyayı indirmesin diye taşınır. Seçim istemcide (`frameUrlFor`); `null` = CDN yok ya da kaynak ölçüsü
   * bilinmiyor, istemci `url`e düşer.
   */
  frames: ImageFrameSourcesSchema.nullable(),
});
export type CatalogImage = z.infer<typeof CatalogImageSchema>;

/**
 * Kategori kartı. `name` düz dizedir: dil yedek zinciri (seçili → TR → FR → DE) tek yerde, sunucuda çözülür
 * (`resolveLocalizedText`).
 */
export const CatalogCategorySchema = CategorySchema.pick({ id: true, slug: true }).extend({
  name: z.string(),
  image: CatalogImageSchema,
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

/**
 * `/categories` cevap zarfı — zarf da sözleşmedir: satır şeması zarfın değişmesini yakalayamaz ve istemci çalışma zamanında
 * (`invalid_response`) kırılırdı.
 */
export const CatalogCategoryListSchema = z.object({ categories: z.array(CatalogCategorySchema) });

/**
 * Etkin koleksiyon — katalogun bir kesitine açıldığını söyleyen künye; `name` sunucuda çözülmüş tek dizedir.
 * `id` ve `description` bilerek yok: koleksiyon mobilde listelenmeyen tek bir bant ve açıklamanın çizileceği yer yok.
 */
export const CatalogCollectionSchema = CollectionSchema.pick({ slug: true }).extend({ name: z.string() });
export type CatalogCollection = z.infer<typeof CatalogCollectionSchema>;

/**
 * Satın alma yolu — `quick`: tek boylu, listeden doğrudan sepete; `options`: çok boylu, boy seçimi atlanamaz, kart detaya götürür.
 * Tek kaynak burası: `@lezzet/application` `PurchaseMode`'u buradan alır; iki tanım ayrışırsa kart iki yüzeyde farklı davranırdı.
 */
export const PurchaseModeEnum = z.enum(['quick', 'options']);
export type PurchaseMode = z.infer<typeof PurchaseModeEnum>;

/**
 * Satış künyesi — kart ile boyun ortak gövdesi, çünkü ikisi de aynı indirgemenin (`sellingOf` + `stockStatusOf`) çıktısıdır.
 * Kart başlangıç boyundan (`primaryVariantOf`), detaydaki boy kendinden okur; ayrı bloklar aynı ürünü listede ve detayda
 * farklı gösterirdi.
 */
const CatalogSellingSchema = z.object({
  /**
   * Ham cent — biçimlendirme istemcinin işi, sözleşme dil bağımsız.
   * `null` = bu kanalda fiyatı yok, ürün satışa kapalı (DOMAIN §5): istemci fiyat satırını çizmez ve aksiyonu pasifler.
   */
  priceCents: z.number().int().nullable(),
  /**
   * İndirim öncesi referans — yalnız yakın-SKT teklifi normal fiyatı yendiğinde dolar, "Fırsat" rozeti ve üstü çizili fiyat çizilir.
   * Alan hiç yoksa indirim de yoktur; indirimin sebebi (partinin tarihi) taşınmaz.
   */
  wasCents: z.number().int().optional(),
  /** Kilogram başına fiyat (ham cent) — INCO gereği raf fiyatının yanında; `null` = net ağırlık ya da fiyat yok, kıyas satırı çizilmez. */
  comparisonCents: z.number().int().nullable(),
  /**
   * Teklifin adet tavanı ("En fazla 5 adet" şablonunun sayısı); `null` sınırsız değil, bu satışta tavan doğmadı demektir.
   * Tavan yalnız teklifte vardır: teklif fiyatı bir partiye bağlıdır, partide kalandan fazlası normal fiyata taşar (DOMAIN §5).
   */
  limitLabel: z.string().nullable(),
  /**
   * Teklif kazandıysa kalemin çıpalandığı parti — sepete o parti ile girer (DOMAIN §5).
   * **`null` = çıpa yok**: ya teklif kazanmadı ya ürün satışa kapalı.
   */
  stockId: StockSchema.shape.id.nullable(),
  /** Yere göre stok hâli — dört cevap, dört ayrı cümle; `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatusEnum,
  /**
   * Tükendi — yalnız `out_of_stock` hâlinde; ürün listede kalır ama sepete eklenemez, kart yine detaya açılır.
   * "Senin bölgende yok" bunun cevabı değildir, o `stockStatus`'ün `elsewhere`/`shipping` hâlidir.
   */
  soldOut: z.boolean(),
});

/**
 * Satılabilir boy — detaydaki "Boy seçin" kartı (`StorefrontVariant` aynası).
 * Fiyat boy düzeyinde taşınır ki seçim değişince fiyat, kıyas fiyatı ve düğmedeki toplam aynı satırdan güncellensin.
 */
export const CatalogVariantSchema = ProductVariantSchema.pick({ id: true, netWeightG: true })
  .merge(CatalogSellingSchema)
  .extend({
    /** Boy etiketi ("700 g tepsi"), seçili dilde; tek boylu üründe boş olabilir. */
    label: z.string(),
  });
export type CatalogVariant = z.infer<typeof CatalogVariantSchema>;

/**
 * Kampanyanın yüzey şekli — kesit başlığı, vitrin bandı (`HomeBandSchema.campaign`) ve kart rozeti aynı şekli kullanır, çünkü
 * aynı türetmeden geçiyorlar (`customer-kit/campaign-label`); ayrı şekillerde aynı kampanya iki ekranda farklı yazılabilirdi.
 */
const CatalogCampaignSchema = z.object({
  label: z.string().nullable(),
  percent: z.number().nullable(),
  amountCents: z.number().int().nullable(),
  minBasketCents: z.number().int().nullable(),
});

/**
 * Katalog kartı (`StorefrontProduct` aynası) — liste, benzer ürünler ve aile dışındaki her ürün gösteriminin gövdesi.
 * Boy listesi ve `shippable` bilerek yok: boy seçimi detayda yapılır, kargolanabilirlik `stockStatus`'ün `shipping` hâlinden görünür.
 */
export const CatalogProductSchema = ProductSchema.pick({ id: true, slug: true })
  .merge(CatalogSellingSchema)
  .extend({
    name: z.string(),
    image: CatalogImageSchema,
    /** Satılabilir birimin etiketi ("1 kg") — başlangıç boyundan; aktif boyu olmayan üründe boş. */
    unitLabel: z.string(),
    /**
     * Listeden sepete eklenecek boy (tek boyluda o boy, çok boyluda başlangıç boyu); `purchaseMode: 'options'` iken kullanılmaz.
     * `null` = aktif boy yok, satılacak birim yok.
     */
    variantId: ProductVariantSchema.shape.id.nullable(),
    purchaseMode: PurchaseModeEnum,
    /**
     * Aktif boy sayısı — kartın çeşit satırı; 0 ve 1'de satır çizilmez, çünkü "1 seçenek" olmayan bir seçim izlenimi verir.
     * "N seçenek" cümlesi cihazın sözlüğünde kurulur (dile göre çekim alır), sözleşme yalnız sayıyı taşır.
     */
    variantCount: z.number().int().min(0),
    /**
     * Ürünün kapsam kampanyası — kartın rozeti; alan yoksa rozet yok: ya kampanya yok ya da kesit başlığı onu zaten söylüyor
     * (ayrımı okuma yapar, `catalog.ts`). Fiyat değildir: motor kazananı sepetin tamamından seçtiği için kartta birim fiyat
     * vaat edilmez.
     */
    campaign: CatalogCampaignSchema.optional(),
  });
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

/**
 * Sayfa zarfı — `nextCursor` opak dizedir, istemci yorumlamadan `?cursor=` olarak geri verir; kodlama tek yerde (`catalog.ts`) kalır.
 * `null` = liste bitti (`Page<T>` ile aynı anlam).
 */
export const CatalogPageSchema = z.object({
  products: z.array(CatalogProductSchema),
  /**
   * Süzgeçli sonuç sayısı ("24 ürün") — sayaç listeyle aynı süzgeç nesnesinden geçer (`countMatching`).
   * Sayaçtan habersiz bir süzgeç eklenirse bu alan sessizce yanlış sayı söyler.
   */
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  /**
   * Etkin koleksiyon, yoksa `null`; adı sunucudan gelir, çünkü istemcide yalnız slug var ve ad dile göre çözülür.
   * Gezinme parametresiyle taşınsaydı derin bağlantıda ve dil değişiminde adsız kalırdı.
   */
  activeCollection: CatalogCollectionSchema.nullable(),
  /**
   * Etkin süzgecin kampanyası — aynı anda tek kesit etkin olabildiği için kategori/koleksiyon diye ayrılmaz; süzgeç yoksa `null`.
   * Tutar değil kural taşınır (motor kazananı sepetten seçer); `label` `null` ise operatör müşteri adı yazmamıştır, ekran adsız konuşur.
   */
  campaign: CatalogCampaignSchema.nullable(),
});
export type CatalogPage = z.infer<typeof CatalogPageSchema>;

/** Vurgulu metin parçası — `TextSegment` (`@lezzet/helper`) ikizi; types helper'ı bilemediği için yalın, şekil kilidi uçta. */
const TextSegmentSchema = z.object({ text: z.string(), strong: z.boolean() });

/**
 * Yasal beyan (INCO) — satın alma öncesi erişilebilir olmalı; metinler `**vurgu**` işareti sunucuda çözülmüş parçalar olarak gelir.
 * `null` metin ya da besin tablosu girilmemiş demektir, çünkü boş başlık ve boş tablo "beyan var" izlenimi verirdi;
 * net ağırlık boyun alanıdır.
 */
const CatalogDeclarationSchema = ProductSchema.pick({ traces: true, nutrition: true }).extend({
  allergens: ProductSchema.shape.allergens.unwrap(),
  ingredients: z.array(TextSegmentSchema).nullable(),
  storage: z.array(TextSegmentSchema).nullable(),
});

/**
 * Ailedeki bir çeşit kartı (`StorefrontFamilyMember` aynası) — tükenmiş çeşit listeye girmez.
 * Boş dizi = bölüm çizilmez: ailesiz üründe de, tek üyeye düşmüş ailede de.
 */
export const CatalogFamilyMemberSchema = ProductSchema.pick({ slug: true }).extend({
  /** **Aile içi etiket** ("Limonlu") — ürün adı ("Limonlu kek") DEĞİL. */
  label: z.string(),
  image: CatalogImageSchema,
  /**
   * Başlangıç fiyatı — çeşidin fiyatı olan en ucuz aktif boyu (`primaryVariantOf`); "…'dan" eki ancak böyle tutulabilir bir söz olur.
   * `null` = kanal fiyatı yok, ekran fiyat satırını çizmez.
   */
  fromPriceCents: z.number().int().nullable(),
  /** Şu an bakılan çeşit — kart ✓ ile işaretlenir, fiyat yerine "Bakıyorsunuz" yazılır. */
  isCurrent: z.boolean(),
});
export type CatalogFamilyMember = z.infer<typeof CatalogFamilyMemberSchema>;

/**
 * Ürün detayı (`StorefrontProductDetail` aynası) — sayfanın tamamı tek turda; kartı genişletmez, çünkü detayda fiyat ürünün değil
 * seçili boyun alanıdır ve iki fiyat kaynağı ilk çelişkide birbirini yalanlardı. Yorum/puan bilerek yok, geri bildirim modülüne ait.
 */
export const CatalogProductDetailSchema = ProductSchema.pick({ id: true, slug: true, shippable: true }).extend({
  name: z.string(),
  /** Sayfanın dilinde tek metin; çeviri eksikse yedek dilden. **`null`** = açıklama hiç girilmemiş. */
  description: z.string().nullable(),
  image: CatalogImageSchema,
  /** İlk öğe kapaktır; tek görselli üründe küçük görsel dizisi çizilmez. */
  gallery: z.array(CatalogImageSchema),
  /** Breadcrumb ve "benzer ürünler" başlığı için; **`null` = ürünün kategorisi yok**. */
  category: CatalogCategorySchema.nullable(),
  /** Yalnız aktif boylar, tek boyluda seçim adımı gösterilmez; sıra operatörünkü (`sort_order`), en ucuz değil (`primaryVariantId`). */
  variants: z.array(CatalogVariantSchema),
  /**
   * Sayfanın seçili açılacağı boy — ölçüt sunucudan gelir, ekran hesap yapmaz; kartta yazan fiyat da bu boyunkidir ve alan
   * olmasa ekran `variants[0]`a düşüp kartla farklı fiyat gösterirdi. `null` = hiçbir boyun fiyatı yok, ekran ilk boya düşer.
   */
  primaryVariantId: z.string().uuid().nullable(),
  declaration: CatalogDeclarationSchema,
  /** Ailenin öteki çeşitleri; boşsa bölüm çizilmez (bkz. `CatalogFamilyMemberSchema`). */
  family: z.array(CatalogFamilyMemberSchema),
  /** Aynı kategoriden başka ürünler (seçim kuralı `pickSimilar`); boşsa bölüm çizilmez. */
  similar: z.array(CatalogProductSchema),
  /**
   * Paylaşılacak tam web adresi (dil öneki ve dile göre çevrilmiş yol dahil) — sunucudan gelir, çünkü yol kuralı webin
   * (`localizedUrl`) ve mobilde kurmak o kuralın ikinci kopyası olurdu. Her ürünün slug'ı olduğu için zorunludur.
   */
  shareUrl: z.string().url(),
});
export type CatalogProductDetail = z.infer<typeof CatalogProductDetailSchema>;
