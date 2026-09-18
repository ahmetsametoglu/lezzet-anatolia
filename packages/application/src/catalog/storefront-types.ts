import type { TextSegment } from '@lezzet/helper';
import type { CartLineRoute } from '@lezzet/domain-core';
import type { ImageCrop, ImageFrameSources, KeysetCursor, Nutrition, ProductAllergen, PurchaseMode, StockStatus } from '@lezzet/types';
import type { ScopeCampaign } from './campaign';

/**
 * Vitrin veri sözleşmesi — katalog orkestrasyonunun dönüş şekli; burada yalnız iki yüzeyin birden okuduğu şekiller durur.
 * Çok dilli alanlar çözülmüş gelir ve DB satırının yalnız kartın gösterdiği kadarı taşınır ki maliyet, stok gibi iç bilgi sızmasın.
 */

/**
 * Yer bağlamı: `(null, null)` yer bilinmiyor, `(rota, kargo)` rota içi, `(null, kargo)` rota dışı — üç hâl iki alandan türer.
 * `warehouseId` yalnız rota deposudur; kargo deposunu da taşısaydı rota dışındaki müşteriye kapı teslimi işareti verilirdi.
 */
export interface PlaceWarehouses {
  /** **ROTA** deposu — aracın çıktığı yer. `null` = yer bilinmiyor YA DA rota dışı. */
  warehouseId: string | null;
  /** Ülkenin kargo çıkış deposu. `null` = yer bilinmiyor ya da o ülkeye kargo yok. */
  shippingWarehouseId: string | null;
}

/** Kart görselinin ortak künyesi — anahtar değil, çözülmüş URL + kırpma. */
export interface StorefrontImage {
  url: string | null;
  crop: ImageCrop;
  /** Çerçeve başına kadrajlı CDN türevleri; `null` = CDN yok ya da kaynak ölçüsü bilinmiyor, çağıran `url` + CSS ile aynı kareyi çizer. */
  frames: ImageFrameSources | null;
}

// Çerçeve kaynaklarının şekli `@lezzet/types` şemasından türer; adlar buradan da ihraç edilir ki tüketicilerin import yolu değişmesin.
export type { ImageFrameSource, ImageFrameSources } from '@lezzet/types';

/** Kategori kartı — anasayfa şeridi ve katalog girişleri. */
export interface StorefrontCategory {
  id: string;
  slug: string;
  name: string;
  image: StorefrontImage;
}

/**
 * Satın alma yolu: `quick` tek varyantlı ürün listeden eklenir, `options` çok varyantlıdır ve detaya götürür.
 * Tanım `@lezzet/types`ta (mobil sözleşme de aynı birliği kullanır); paketin dış API'si değişmesin diye buradan yeniden ihraç edilir.
 */
export type { PurchaseMode };

/** Ürün kartı. `priceCents` ham değerdir, biçim dile bağlı olduğu için görünümün işidir; indirimin sebebi hiç taşınmaz ki ekrana çıkamasın. */
export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  image: StorefrontImage;
  /** Satılabilir birimin etiketi ("1 kg", "6 adet · 540 g") — varyanttan gelir. */
  unitLabel: string;
  /** Listeden sepete eklenecek varyant: tek boylu üründe o boy, çok boyluda en ucuz boy; aktif varyantı olmayan üründe `null`. */
  variantId: string | null;
  /** Teklif kalemi hangi partiye çıpalı — sepete o parti ile girer (DOMAIN §5). */
  stockId: string | null;
  /**
   * Aktif varyant sayısı — kartın "3 seçenek" satırı; liste değil sayı taşınır, seçim detayda yapılır.
   * Ölçüt `purchaseMode` ile aynı kümedir (`variantCount > 1` ⇔ `options`); 0 ve 1'de satır çizilmez.
   */
  variantCount: number;
  /** Birim fiyat (ham cent) — raf fiyatının yanında; net miktar yoksa null. */
  comparisonCents: number | null;
  /** Kıyasın birimi — katıda `kg`, sıvıda `L`; sayı birimsiz taşınsa sıvı kilo başına yazılırdı. */
  comparisonUnit: 'kg' | 'L' | null;
  /** null = bu kanalda fiyatı yok → ürün SATIŞA KAPALI (DOMAIN §5); kart fiyat göstermez. */
  priceCents: number | null;
  /** İndirim öncesi fiyat — verilirse "Fırsat" rozeti + üstü çizili eski fiyat. */
  wasCents?: number;
  /** Adet sınırı ("En fazla 5 adet"); yalnız teklifte doğar, çünkü teklif fiyatı partiye bağlıdır. Sınırsızsa null. */
  limitLabel: string | null;
  purchaseMode: PurchaseMode;
  /** Ürün kargoya verilebilir mi — ürünün doğası, stoktan türetilmez; `stockStatus` başka soruyu cevaplar: "bu adrese gider mi". */
  shippable: boolean;
  /** Yere göre stok hâli — dört cevap, dört ayrı cümle. `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatus;
  /** Tükendi — yalnız `out_of_stock` hâlinde; ürün listede kalır ama sepete eklenemez. */
  soldOut: boolean;
  /**
   * Ürünün kapsam kampanyası (kart rozeti); `null` = kampanya yok ya da kesit başlığı zaten söylüyor.
   * Fiyata yazılmaz: kazanan indirim sepetin tamamından seçilir, birim fiyat vaadi sepet değişince yalan olurdu.
   */
  campaign: ScopeCampaign | null;
}

/** Satılabilir varyant — detayın "Boy seçin" kartı; fiyat varyant düzeyinde taşınır ki seçim değişince fiyat, kıyas ve toplam aynı satırdan gelsin. */
export interface StorefrontVariant {
  id: string;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş olabilir — gösterilecek bir boy adı yoktur. */
  label: string;
  /** Net miktar ve BİRİMİ — seçili boyunki yazılır; katıda gram, sıvıda mililitre. */
  netQuantity: number | null;
  netUnit: 'g' | 'ml' | null;
  /** Paketteki adet — boy seçici adet anlamlıysa adeti, değilse gramajı yazar; `null` = tek parça, gösterim gramaja düşer. */
  piecesCount: number | null;
  /** Porsiyon türü — `item` ayrı ürünler, `slice` dilimler; gösterimdeki KELİMEYİ bu belirler. */
  portionKind: 'item' | 'slice' | null;
  /** null = bu kanalda fiyatı yok → varyant seçilebilir ama satın alınamaz (DOMAIN §5). */
  priceCents: number | null;
  /** Teklif kazandıysa üstü çizilecek referans; yoksa tanımsız. */
  wasCents?: number;
  comparisonCents: number | null;
  comparisonUnit: 'kg' | 'L' | null;
  /** Teklifin adet tavanı ("En fazla 5 adet"); tavan yoksa null. */
  limitLabel: string | null;
  /** Teklif kazandıysa çıpalı parti — sepete o parti ile girer (DOMAIN §5). */
  stockId: string | null;
  /** Yere göre stok hâli — dört cevap, dört ayrı cümle. `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatus;
  soldOut: boolean;
}

/**
 * Yasal beyan (INCO) — uzaktan satışta satın alma öncesi erişilebilir olmak zorunda; sayfanın asıl yüküdür.
 * Metinler `TextSegment[]` gelir: `**vurgu**` işareti sunucuda çözülür ki işaret kullanıcıya sızmasın; alerjenler kod taşır.
 */
export interface StorefrontDeclaration {
  ingredients: TextSegment[] | null;
  allergens: ProductAllergen[];
  /** Çapraz bulaşma — cümle bu listeden i18n şablonuyla kurulur, serbest metin taşınmaz. */
  traces: ProductAllergen[];
  /** Beyan tablosu; hiçbir kalemi girilmemişse null (boş tablo gösterilmez). */
  nutrition: Nutrition | null;
  /** Net miktar burada değil: varyanta aittir (`StorefrontVariant.netQuantity`), seçime göre değişir. */
  storage: TextSegment[] | null;
}

/** Ailedeki bir çeşit kartı: görsel + etiket + başlangıç fiyatı; tükenmiş çeşit listeye hiç girmez. */
export interface StorefrontFamilyMember {
  slug: string;
  /** **Aile içi etiket** ("Limonlu") — ürün adı ("Limonlu kek") DEĞİL. */
  label: string;
  image: StorefrontImage;
  /** Başlangıç fiyatı — çeşidin en ucuz aktif boyu; `null` = fiyat çözülemedi, sıfır yazılmaz ki bedava görünmesin. */
  fromPriceCents: number | null;
  /** Şu an bakılan çeşit — kart ✓ ile işaretlenir, fiyat yerine "Bakıyorsunuz" yazılır. */
  isCurrent: boolean;
}

/** Ürün detay okumasının sonucu — sayfanın tüm bölümleri tek turda gelir; yorumlar geri bildirim modülüne ait olduğu için burada yok. */
export interface StorefrontProductDetail {
  id: string;
  slug: string;
  name: string;
  /** İstenen dilde tek metin; çeviri eksikse yedek dilden gelir (çağıran bunu bilmez). */
  description: string | null;
  image: StorefrontImage;
  /** Galeri — ilk öğe kapak. Tek görselli üründe küçük görsel şeridi gösterilmez. */
  gallery: StorefrontImage[];
  /** Breadcrumb ve "benzer ürünler" başlığı için; kategorisiz üründe null. */
  category: StorefrontCategory | null;
  /** En az bir öğe. Tek varyantlı üründe seçim adımı HİÇ gösterilmez. */
  variants: StorefrontVariant[];
  /**
   * Açılışta seçili boy — liste kartının fiyatını okuduğu boy; ekran bunu kendisi hesaplamasın diye sunucu işaretler.
   * Sıra `variants`ın konusu; `null` = aktif boy yok, ekran seçim adımını çizmez.
   */
  primaryVariantId: string | null;
  declaration: StorefrontDeclaration;
  /** false → "yalnız bölge içi kapıya teslim" uyarısı, sepete eklemeden ÖNCE görünür. */
  shippable: boolean;
  /** Soğuk zincir gerekiyor mu — `product.storage_type`tan gelir, `shippable`den türetilmez; kargolanabilen üründe de soğuk zincir olabilir. */
  coldChain: boolean;
  /** Ailenin öteki çeşitleri — kardeş ürünün sayfasına götürür, varyant seçicisiyle karışmaz; boşsa bölüm çizilmez. */
  family: StorefrontFamilyMember[];
  /** Aynı kategoriden başka ürünler (`pickSimilar`); boşsa bölüm render edilmez. */
  similar: StorefrontProduct[];
}

/** Koleksiyonun katalog başlığındaki künyesi — ürün listesi değil üst bilgi; `description` ve `image` paylaşım kartı içindir. */
export interface StorefrontCollectionHead {
  id: string;
  slug: string;
  name: string;
  /** Boş olabilir — koleksiyona açıklama girmek zorunlu değil; ekran satırı sessizce atlar. */
  description: string;
  image: StorefrontImage;
}

/** Katalog okumasının sonucu — sayfa ve süzgeç bileşenlerinin paylaştığı şekil. */
export interface StorefrontCatalog {
  categories: StorefrontCategory[];
  /** Seçili kategori (yoksa tüm katalog) — başlık bandı ve çip seçimi bunu kullanır. */
  activeCategory: StorefrontCategory | null;
  /**
   * Seçili koleksiyon — kategoriden ayrı alan, çünkü koleksiyon editoryal kesittir ve o görünümde kategori çipleri gizlenir.
   * Slug verilmiş ama karşılığı yoksa `null`: ölü bağlantı 404 yerine tam kataloğa düşer.
   */
  activeCollection: StorefrontCollectionHead | null;
  products: StorefrontProduct[];
  /** Sonuç sayısı — "24 ürün" satırı. Süzgeçle birlikte değişir. */
  total: number;
  /** null ise liste bitti; çağıran "daha fazla"yı kapatır. */
  nextCursor: KeysetCursor | null;
  /** Etkin süzgecin kampanyası; süzgeç yokken `null`, çünkü kampanya bir kesite aittir ve kesit seçilmeden söylenemez. */
  campaign: ScopeCampaign | null;
}

/** Paket (bundle) kartı — tek fiyatlı hazır seçim; liste ve detay aynı künyeyi taşır. */
export interface StorefrontPackage {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: StorefrontImage;
  /** Kalem SAYISI (adet toplamı değil) — "8 ürün". */
  itemCount: number;
  /** Paketin içeriği — liste kartının çipleri ile detayın "Pakette neler var?" kartı aynı kalemleri okur. */
  items: StorefrontPackageItem[];
  priceCents: number;
  /** "6 kişilik" künyesi; girilmemişse rozet hiç basılmaz. */
  serves: number | null;
  /** Kalemlerin net ağırlık toplamı; bir kalemin ağırlığı bilinmiyorsa `null`, eksiği 0 saymak paketi hafif gösterirdi. */
  totalWeightG: number | null;
  /** Kargolanamayan BİR kalem varsa paketin tamamı yalnız rota içi. */
  inRouteOnly: boolean;
  /** Soğuk ya da donuk bir kalem var mı — `storage_type`tan gelir; kargoya uygunluktan türetilmez, donuk ürün de kargolanabilir. */
  coldChain: boolean;
  /**
   * Bir kalem bile yetmiyorsa paket tükendi; ölçüsü ağ geneli, çünkü "tükendi" ancak hiçbir depoda yoksa söylenir.
   * Yere bağlı hâl `route`ta; ikisi tek bayrakta birleşseydi öbür depodaki mal tükenmiş ilan edilirdi.
   */
  soldOut: boolean;
  /** Bu yerden hangi yolla gelir (motorun kararı); `null` = yer bilinmiyor. Paket bölünmez, yol paketin bütünü içindir. */
  route: CartLineRoute | null;
  /** Bu yerden şu an kaç paket yapılabilir (en zayıf kalemden); `null` = yer bilinmiyor. Söz değil sayı: gerçek kapı checkout'tur. */
  maxQty: number | null;
  /** Kalemlerin en yüksek KDV oranı (%) — checkout'ta kargo KDV'sinin bölünmesi için; eksik değil fazla hesaplamak vergide güvenli yön. */
  vatRate: number;
}

/** Paket içeriğinin tek kalemi. Fiyat taşımaz: paketin tek fiyat kuralı kalem kırılımını yasaklar, alan olmayınca ekran onu basamaz. */
export interface StorefrontPackageItem {
  variantId: string;
  /** Ürün detayına bağ — yasal beyan (alerjen/içindekiler) ORADA, paket sayfası yalnız özetler. */
  slug: string;
  name: string;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş. */
  unitLabel: string;
  qty: number;
  image: StorefrontImage;
}

/**
 * Paket detayı — kart sözleşmesinin üstüne güven künyesi; satırlar kalemlerden türer, hesaplanamayan satır basılmaz.
 * Sepetin `CartBundleSource`u bunun yapısal ikizidir: kapı hiçbir dönüştürme yazmadan geçer.
 */
export interface StorefrontPackageDetail extends StorefrontPackage {
  /** Kalemlerin alerjen birleşimi (kod); görünen ad dile göre komponentte çözülür. Boşsa satır yok. */
  allergens: ProductAllergen[];
  /** En KISA raf ömrü — paketin tamamı en çabuk bozulan kalemine göre tüketilir. Bilinmiyorsa null. */
  shelfLifeDays: number | null;
}
