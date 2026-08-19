import { z } from 'zod';
import { CategorySchema } from '../entities/category.schema';
import { CollectionSchema } from '../entities/collection.schema';
import { StockStatusEnum } from '../primitives/enums.schema';
import { ImageCropSchema } from '../primitives/image.schema';
import { ProductSchema } from '../entities/product.schema';
import { ProductVariantSchema } from '../entities/product-variant.schema';
import { StockSchema } from '../entities/stock.schema';

/**
 * Katalog SÖZLEŞME şemaları (21.6) — mobil `/api/v1/{categories,products,products/:slug}` uçlarının
 * ve onları tüketen Expo ekranının ORTAK dili.
 *
 * Terfi gerekçesi `auth.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak"): şema uçta
 * yaşarken istemci ya kendi tipini elle yazar (ikinci sözleşme) ya da hiç doğrulamaz. Buraya
 * taşındığı andan itibaren üreten ve tüketen AYNI şemayı çağırır — alan adı değişirse iki taraf
 * birden derleme anında kırılır.
 *
 * ── ALANLAR `@lezzet/application`IN VİTRİN SÖZLEŞMESİNİN AYNASIDIR ────────────
 * Kaynak `packages/application/src/catalog/storefront-types.ts` (`StorefrontProduct` ·
 * `StorefrontVariant` · `StorefrontProductDetail` · `StorefrontFamilyMember`). Uç, orkestrasyonun
 * döndürdüğü şekli **indirgemez, yeniden adlandırmaz, alan eklemez**: ikinci bir sözleşme icat
 * etmek, aynı ürünün webde ve mobilde farklı fiyatlanmasının en kısa yoludur. Zod burada bir
 * SÜZGEÇ ve bir KİLİTTİR — aynanın kırıldığı gün `apps/mobile-api/src/api/v1/catalog.ts`'teki
 * devralma iddiası (`z.input<…>` ile tiplenen yanıt gövdesi) derlemede patlar. Alanların ANLAMI
 * (özellikle `null`ların) da oradan gelir; buradaki yorumlar o anlamın tekrarı değil, uçta okunan
 * hâlidir.
 *
 * ── `TextSegment` KİLİDİ BURADA DEĞİL ────────────────────────────────────────
 * `TextSegmentSchema` web/mobil ortak parçası ama tipin sahibi `@lezzet/helper` ve **types hiçbir iç
 * pakete bağlanamaz**: `.dependency-cruiser.cjs` `types-is-pure` kuralı (`from: ^packages/types/`,
 * `to: ^@lezzet/(?!types$)`, severity error) bunu makineyle yasaklıyor — döngü olmasa bile
 * (ölçüldü: `@lezzet/helper`ın `package.json`'ında types bağımlılığı YOK, yani asıl engel döngü
 * değil bu kural). Şema burada YALIN durur.
 *
 * Kilit KAYBOLMADI, YERİ DEĞİŞTİ ve GENİŞLEDİ: `catalog.ts` yanıt gövdesini
 * `z.input<typeof CatalogProductDetailSchema>` ile tipliyor ve o gövde `StorefrontProductDetail`
 * — beyan metinleri `TextSegment[]` olarak orada tanımlı. `TextSegment` şekli değişirse atama
 * derlenmez. Ayrı bir `satisfies z.ZodType<TextSegment>` satırı bu yüzden yazılmadı: aynı şeyi
 * daha dar kapsamda ikinci kez iddia ederdi (ve `@lezzet/helper`ı yalnız o satır için mobile-api'ye
 * bağımlılık olarak tutmak gerekirdi — `knip` ölü bağımlılık olarak yakalıyordu).
 */

/**
 * Görselin çözülmüş hâli — anahtar değil, public URL + kırpma künyesi (`StorefrontImage` aynası).
 * Dışa verilir: vitrin sözleşmesi (`home-api.schema.ts`) aynı şekli okur — ikinci tanım açılmaz.
 */
export const CatalogImageSchema = z.object({
  /** `null` = görsel yok ya da R2 taban adresi ayarsız; istemci yer tutucu çizer. */
  url: z.string().nullable(),
  crop: ImageCropSchema,
});

/**
 * Kategori kartı. `name` DÜZ STRING: çok dilli metin SUNUCUDA çözülür (`resolveLocalizedText`),
 * çünkü dil yedek zinciri (seçili → TR → FR → DE) tek yerde yaşamalı — istemciye üç dili birden
 * gönderip orada çözdürmek zinciri ikinci kez yazdırırdı.
 */
export const CatalogCategorySchema = CategorySchema.pick({ id: true, slug: true }).extend({
  name: z.string(),
  image: CatalogImageSchema,
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

/**
 * `/categories` cevap zarfı — SATIR şeması yetmez, zarf da sözleşmedir: uç yarın
 * `{ items: [...] }` yazsa satır şeması bunu yakalayamaz ve istemci derlemede değil çalışma
 * zamanında (`invalid_response`) kırılırdı. Uç bu şemayla `parse` eder, istemci bununla okur —
 * iki taraf tek kaynaktan (ürünler tarafındaki `CatalogPageSchema` ile aynı desen).
 */
export const CatalogCategoryListSchema = z.object({ categories: z.array(CatalogCategorySchema) });

/**
 * **Etkin koleksiyon** — katalogun bir kesitine açılmış olduğunu söyleyen künye (21.64).
 * Kategori ikizinin (`CatalogCategorySchema`) kuralları aynen geçerli: `name` sunucuda ÇÖZÜLMÜŞ
 * tek dizedir, `slug` dil-bağımsızdır.
 *
 * **`id` ve `description` bilerek YOK.** Kategori satırında `id` var çünkü liste çiziliyor ve
 * anahtar gerekiyor; koleksiyon TEK bir bant, listelenmiyor. `description` da yok: mobilde
 * koleksiyon bir bant, web'deki gibi sayfa başlığı DEĞİL (kullanıcı kararı 16.08) — açıklamanın
 * çizileceği yer yok, ve gönderilip çizilmeyen alan bir gün "neden boş?" diye aranır.
 * İkisi de gerektiği gün `.pick`e eklenir; bugünden göndermek kullanılmayan sözleşme olurdu.
 */
export const CatalogCollectionSchema = CollectionSchema.pick({ slug: true }).extend({ name: z.string() });
export type CatalogCollection = z.infer<typeof CatalogCollectionSchema>;

/**
 * Satın alma yolu — kart aksiyonunu belirler. `quick`: tek boylu, listeden doğrudan sepete eklenir.
 * `options`: çok boylu, ekleme listeden YAPILAMAZ (boy seçimi atlanamaz) ve kart detaya götürür.
 *
 * **TEK KAYNAK** (`StockStatusEnum` ile aynı yol): `@lezzet/application` kendi tanımını taşımaz,
 * `PurchaseMode`'u buradan alıp re-export eder. İki ayrı birlik tanımı bir gün ayrışır ve ayrıştığı
 * gün kart iki yüzeyde farklı aksiyon gösterirdi.
 */
export const PurchaseModeEnum = z.enum(['quick', 'options']);
export type PurchaseMode = z.infer<typeof PurchaseModeEnum>;

/**
 * **Satış künyesi** — fiyat, indirim referansı, kıyas fiyatı, adet tavanı, çıpalı parti ve stok hâli.
 *
 * Kart ile boyun ORTAK gövdesi, çünkü ikisi de aynı indirgemenin (`sellingOf` + `stockStatusOf`)
 * çıktısıdır: kart ürünün İLK aktif boyundan okur, detaydaki boy kendinden. İki ayrı blok yazılsaydı
 * biri gün gelip ötekinden ayrışır ve aynı ürün listede indirimli, detayda normal görünürdü.
 */
const CatalogSellingSchema = z.object({
  /**
   * Ham cent — biçimlendirme İSTEMCİNİN işi (para gösterimi dile bağlı, sözleşme dil-bağımsız).
   *
   * **`null` = bu kanalda fiyatı yok → ürün SATIŞA KAPALI** (DOMAIN §5); istemci fiyat satırını
   * hiç çizmez ve aksiyonu pasifler. Sıfır YAZILMAZ (`CLAUDE §1`): ölçülemeyen değer sıfır değildir,
   * "0,00 €" bedava görünürdü.
   */
  priceCents: z.number().int().nullable(),
  /**
   * İndirim ÖNCESİ referans — verilirse "Fırsat" rozeti + üstü çizili eski fiyat. Yalnız yakın-SKT
   * teklifi normal fiyatı YENDİĞİNDE dolar; **alan hiç yoksa indirim de yoktur** (`null` değil,
   * yokluk — istemci `wasCents == null` ile de doğru okur ama sözleşme fazladan bir "indirim yok"
   * değeri taşımaz). İndirimin SEBEBİ (partinin tarihi) hiçbir zaman taşınmaz.
   */
  wasCents: z.number().int().optional(),
  /**
   * Kilogram başına fiyat (ham cent) — INCO gereği raf fiyatının yanında. **`null` = net ağırlık
   * girilmemiş ya da fiyat yok** → kıyas satırı çizilmez; "0 €/kg" yazmak yanlış bilgi olurdu.
   */
  comparisonCents: z.number().int().nullable(),
  /**
   * Teklifin adet tavanı ("En fazla 5 adet" şablonuna girecek sayı). **`null` = tavan yok** —
   * sınırsız demek değil, *bu satışta bir tavan doğmadı* demektir: tavan yalnız teklifte vardır
   * (teklif fiyatı bir partiye bağlıdır, o partide kalandan fazlası normal fiyata taşar, DOMAIN §5).
   */
  limitLabel: z.string().nullable(),
  /**
   * Teklif kazandıysa kalemin çıpalandığı parti — sepete o parti ile girer (DOMAIN §5).
   * **`null` = çıpa yok**: ya teklif kazanmadı ya ürün satışa kapalı.
   */
  stockId: StockSchema.shape.id.nullable(),
  /** Yere göre stok hâli — dört cevap, dört ayrı cümle (19.10). `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatusEnum,
  /**
   * Tükendi — YALNIZ `out_of_stock` hâlinde. Ürün listede KALIR (tekrar gelecek beklentisi doğru
   * kurulsun) ama sepete eklenemez; kart yine detaya tıklanabilir. "Senin bölgende yok" bunun
   * cevabı DEĞİLDİR — o `stockStatus`'ün `elsewhere`/`shipping` hâlidir.
   */
  soldOut: z.boolean(),
});

/**
 * Satılabilir boy — detaydaki "Boy seçin" kartı (`StorefrontVariant` aynası).
 *
 * Fiyat kart düzeyinde DEĞİL boy düzeyinde taşınır: seçim değişince fiyat, kıyas fiyatı ve butondaki
 * toplam birlikte güncellenir; üçü aynı satırdan gelmezse ekranda tutarsız kalırlar.
 */
export const CatalogVariantSchema = ProductVariantSchema.pick({ id: true, netWeightG: true })
  .merge(CatalogSellingSchema)
  .extend({
    /** Boy etiketi ("700 g tepsi"), seçili dilde; tek boylu üründe boş olabilir. */
    label: z.string(),
  });
export type CatalogVariant = z.infer<typeof CatalogVariantSchema>;

/**
 * Katalog kartı (`StorefrontProduct` aynası) — liste, "benzer ürünler" şeridi ve aile dışındaki her
 * ürün gösteriminin gövdesi.
 *
 * **Boy LİSTESİ burada YOK ve bu bilinçli**: katalog okuması (`getCatalogData`) kartı ürünün ilk
 * aktif boyuna indirger; boyların tamamı yalnız detayda anlamlıdır (seçim orada yapılır). Liste
 * cevabına boyları da koymak, hiç kullanılmayacak bir veriyi her sayfada tele vermek olurdu.
 * `shippable` de burada yok — kargolanabilirlik kararı `stockStatus` üzerinden zaten görünür
 * (`shipping` hâli yalnız kargolanabilir üründe doğar) ve etiketi detayda çizilir.
 */
export const CatalogProductSchema = ProductSchema.pick({ id: true, slug: true })
  .merge(CatalogSellingSchema)
  .extend({
    name: z.string(),
    image: CatalogImageSchema,
    /** Satılabilir birimin etiketi ("1 kg") — ilk aktif boydan; aktif boyu olmayan üründe boş. */
    unitLabel: z.string(),
    /**
     * Listeden sepete eklenecek boy (tek boyluda o boy, çok boyluda İLK boy).
     * `purchaseMode: 'options'` iken kullanılmaz. **`null` = aktif boy yok** → satılacak birim yok.
     */
    variantId: ProductVariantSchema.shape.id.nullable(),
    purchaseMode: PurchaseModeEnum,
    /**
     * **AKTİF boy sayısı** — kartın çeşit satırının kaynağı.
     *
     * `0` (aktif boyu yok) ve `1` (tek boy) → **satır çizilmez**: "1 seçenek" yazmak, olmayan bir
     * seçim varmış izlenimi verirdi. `> 1` ⇔ `purchaseMode === 'options'` (ikisi aynı kümeden türer).
     *
     * **Metin API'den GELMEZ, cihazda kurulur:** "N seçenek" bir i18n şablonudur ve dile göre çekim
     * alır (fr/de/tr ayrı) — sözleşme dil-bağımsız SAYI taşır, cümle ekranın sözlüğünde yaşar.
     * Boy LİSTESİ de taşınmaz: kart kaç seçenek olduğunu söyler, hangileri olduğunu değil (seçim
     * detayda yapılır).
     */
    variantCount: z.number().int().min(0),
  });
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

/**
 * Sayfa zarfı. `nextCursor` **opak bir dize**, keyset nesnesinin kendisi değil: istemci onu
 * yorumlamaz, bir sonraki isteğe `?cursor=` olarak aynen geri verir. Kodlama/çözme tek yerde
 * (`catalog.ts`) kalsın diye — nesne gönderseydik istemci de aynı kodlamayı yazmak zorunda kalırdı.
 *
 * `null` = liste bitti; istemci "daha fazla"yı kapatır (`Page<T>` sözleşmesiyle aynı anlam).
 */
/**
 * Kesitin kampanyası — vitrin bandı (`HomeBandSchema.campaign`) ile AYNI şekil, çünkü aynı gerçeği
 * taşıyorlar ve aynı türetmeden geçiyorlar (`customer-kit/campaign-label`). İki ayrı şekil olsaydı
 * aynı kampanya iki ekranda farklı yazılabilirdi.
 */
const CatalogCampaignSchema = z.object({
  label: z.string().nullable(),
  percent: z.number().nullable(),
  amountCents: z.number().int().nullable(),
  minBasketCents: z.number().int().nullable(),
});

export const CatalogPageSchema = z.object({
  products: z.array(CatalogProductSchema),
  /**
   * Süzgeçli sonuç sayısı ("24 ürün") — listeyle TUTARLI olmak zorunda.
   *
   * Künye eskiden *"sayaç RPC'si yalnız arama + kategori + durum tanıyor, bu uç da sadece o üçünü
   * sunuyor"* diyordu; ikisi de artık doğru değil. Uç `shippable`ı (21.20) ve `collection`ı (21.64)
   * da sunuyor, sayaç da RPC değil `productSvc.countMatching(filters)` — süzgeç nesnesinin TAM
   * AYNISINDAN geçiyor (`packages/application/src/catalog/catalog.ts`). Tutarlılık işte oradan
   * geliyor, süzgeç sayısının azlığından değil.
   *
   * Kural değişmedi: **sayaçtan habersiz bir süzgeç eklenirse bu alan sessizce yalan söyler.**
   * Raporlanan web arızası tam olarak buydu — çip açıkken liste 1 satır basarken başlık 131 diyordu.
   */
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  /**
   * Etkin koleksiyon, yoksa `null`. **Adı sunucudan gelmek ZORUNDA** — istemci elinde yalnız slug
   * var ve slug bir ad değil; üstelik ad dile göre çözülüyor (zincir sunucuda, `resolveLocalizedText`).
   * Gezinme parametresiyle taşımak (vitrin bandı adı zaten biliyor) kısa yoldu ama derin bağlantıda
   * ve dil değişiminde adsız kalırdı.
   */
  activeCollection: CatalogCollectionSchema.nullable(),
  /**
   * **Etkin süzgecin kampanyası** (08.44) — `null` = yok ya da süzgeç yok.
   *
   * Kategori/koleksiyon diye AYRILMAZ: sayfada aynı anda yalnız biri etkin olabiliyor (koleksiyon
   * görünümünde kategori çipleri gizleniyor), ekranın sorusu *"şu an baktığım kesitte kampanya var
   * mı"*. Süzgeç yokken `null` — kampanya bir KESİTE aittir, kesit seçilmeden söylenemez.
   *
   * **Tutar değil kural taşınır.** Kampanya ürün fiyatına yazılamaz (motor kazananı tüm sepet
   * üzerinden seçer); ekran bunu bir cümle olarak söyler, fiyatı değiştirmez. `label` `null` ise
   * operatör müşteri adı yazmamıştır, ekran adsız konuşur.
   */
  campaign: CatalogCampaignSchema.nullable(),
});
export type CatalogPage = z.infer<typeof CatalogPageSchema>;

/**
 * Vurgulu metin parçası — `TextSegment` (`@lezzet/helper`) ikizi.
 *
 * Zod helper'ın kendisinde yok (paket saf TS) ve types helper'ı BİLEMEZ (`types-is-pure`), o yüzden
 * şema burada yalın duruyor. Şeklin sapmadığını `apps/mobile-api` derlemede kanıtlar — bkz. dosya
 * başlığı.
 */
const TextSegmentSchema = z.object({ text: z.string(), strong: z.boolean() });

/**
 * Yasal beyan (INCO) — uzaktan satışta satın alma ÖNCESİ erişilebilir olmak zorunda, yani
 * sözleşmenin süsü değil yükü.
 *
 * `ingredients`/`storage` PARÇALARA ayrılmış gelir: operatörün `**vurgu**` işareti sunucuda
 * çözülür (`parseEmphasis`), ham metin cihaza gitmez — işaretin ekranda görünme ihtimali kapanır.
 * **`null` = o metin hiç girilmemiş** (boş/boşluk metin de `null` sayılır) → bölüm başlığı boşuna
 * açılmaz. Alerjenler KOD taşır (`gluten`); görünen ad istemcinin sözlüğünde çözülür.
 *
 * `nutrition` **`null` = hiçbir kalemi girilmemiş** — boş bir tablo çizdirmek "beyan var" izlenimi
 * verirdi, ki yoktur. Net ağırlık BURADA YOK: paketin ağırlığı boya göre değişir, beyanın kendisi
 * 100 g üzerinden sabittir → ağırlık boyun alanıdır (`CatalogVariantSchema.netWeightG`).
 */
const CatalogDeclarationSchema = ProductSchema.pick({ allergens: true, traces: true, nutrition: true }).extend({
  ingredients: z.array(TextSegmentSchema).nullable(),
  storage: z.array(TextSegmentSchema).nullable(),
});

/**
 * Ailedeki bir çeşit kartı (`StorefrontFamilyMember` aynası, 05.15) — görsel + aile içi etiket +
 * başlangıç fiyatı.
 *
 * Tükenmiş çeşitler listeye HİÇ girmez, o yüzden burada bir "tükendi" hâli yok. **Boş dizi = bölüm
 * çizilmez**: ailesiz üründe de, tek üyeye düşmüş ailede de.
 */
export const CatalogFamilyMemberSchema = ProductSchema.pick({ slug: true }).extend({
  /** **Aile içi etiket** ("Limonlu") — ürün adı ("Limonlu kek") DEĞİL. */
  label: z.string(),
  image: CatalogImageSchema,
  /**
   * **Başlangıç fiyatı** — çeşidin fiyatı olan EN UCUZ aktif boyu, kartta "…'dan" ekiyle yazılır.
   * *Künye 15.08'de düzeltildi: "ilk aktif boyu" yazıyordu ve `08.10`'dan beri yanlıştı — ölçüt
   * o gün `primaryVariantOf`a bağlandı (`application/catalog/product.ts:177` → `card.priceCents`).
   * Eki haklı çıkaran şey tam olarak budur: en ucuzun önüne "…'dan" yazmak tutulabilir bir sözdür.*
   * **`null` = fiyat çözülemedi** (kanal fiyatı girilmemiş) → ekran o kartta fiyat satırını çizmez.
   * Sıfır YAZILMAZ (`CLAUDE §1`) — bedava görünürdü.
   */
  fromPriceCents: z.number().int().nullable(),
  /** Şu an bakılan çeşit — kart ✓ ile işaretlenir, fiyat yerine "Bakıyorsunuz" yazılır. */
  isCurrent: z.boolean(),
});
export type CatalogFamilyMember = z.infer<typeof CatalogFamilyMemberSchema>;

/**
 * Ürün detayı (`StorefrontProductDetail` aynası) — sayfanın TAMAMI tek turda.
 *
 * **Kartı `.extend` ETMEZ ve bu bilinçli bir yapı kararıdır**: detayda fiyat ÜRÜNÜN değil BOYUN
 * alanıdır (seçim değişince fiyat değişir). Kartı genişletseydik sayfada iki fiyat kaynağı olurdu —
 * ürün düzeyindeki "başlangıç fiyatı" ile seçili boyunki — ve ikisi ilk çelişkide birbirini
 * yalanlardı. Kartın alanlarından burada duranlar (`unitLabel`, `purchaseMode`, `priceCents`)
 * `variants` listesinden okunur; boy sayısı satın alma yolunu söyler.
 *
 * **"İlk boy başlangıç fiyatıdır" varsayımı ÇÜRÜTÜLDÜ (`08.10`, commit `da91ea97`)** ve bu künyede
 * de yazılıydı — düzeltildi. `variants` listesi `sort_order`dadır, yani OPERATÖRÜN sırasıdır ve
 * fiyatı bilmez; başlangıç fiyatı ayrı bir ölçütle (`primaryVariantOf` — fiyatı olan en ucuz aktif
 * boy, depo boyutlu, fiyatsızlar sona) seçilir ve `primaryVariantId` ile gelir.
 *
 * **`reviews` alanı YOK ve olmayacak** (17.1): yorum/puan geri bildirim modülüne ait — moderasyon
 * durumu ve "kim yazabilir" kararı orada yaşıyor.
 */
export const CatalogProductDetailSchema = ProductSchema.pick({ id: true, slug: true, shippable: true }).extend({
  name: z.string(),
  /** Sayfanın dilinde tek metin; çeviri eksikse yedek dilden. **`null`** = açıklama hiç girilmemiş. */
  description: z.string().nullable(),
  image: CatalogImageSchema,
  /** İlk öğe KAPAKTIR; tek görselli üründe şerit çizilmez. */
  gallery: z.array(CatalogImageSchema),
  /** Breadcrumb ve "benzer ürünler" başlığı için; **`null` = ürünün kategorisi yok**. */
  category: CatalogCategorySchema.nullable(),
  /** Yalnız AKTİF boylar; tek boylu üründe seçim adımı hiç gösterilmez. Sıra `sort_order`dır —
      OPERATÖRÜN sırası; "en ucuz" ya da "en küçük" DEĞİL (bkz. `primaryVariantId`). */
  variants: z.array(CatalogVariantSchema),
  /**
   * Sayfanın SEÇİLİ AÇILACAĞI boy — ölçüt sunucudan gelir, ekran hesap yapmaz (web müşteri
   * yüzeyinin `08.10`'da aldığı kararın aynısı: `product-client.tsx:37`). Kartta yazan fiyat da
   * bu boyunkidir; alan taşınmazsa ekran `variants[0]`a düşer ve **kartla detay farklı fiyat
   * gösterir** — ölçülmüş belirti buydu (MB-20: kart 4,11 €, detay 6,80 € seçili açıldı).
   * **`null` = hiçbir boyun fiyatı yok** (ürün satışa kapalı); ekran ilk boya düşer.
   */
  primaryVariantId: z.string().uuid().nullable(),
  declaration: CatalogDeclarationSchema,
  /** Ailenin öteki çeşitleri; boşsa bölüm çizilmez (bkz. `CatalogFamilyMemberSchema`). */
  family: z.array(CatalogFamilyMemberSchema),
  /** Aynı kategoriden başka ürünler (seçim kuralı `pickSimilar`); boşsa bölüm çizilmez. */
  similar: z.array(CatalogProductSchema),
});
export type CatalogProductDetail = z.infer<typeof CatalogProductDetailSchema>;
