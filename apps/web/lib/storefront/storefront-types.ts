import type { TextSegment } from '@lezzet/helper';
import type { ImageCrop, KeysetCursor, Nutrition, ProductAllergen } from '@lezzet/types';

/**
 * Ürünün/varyantın YERE göre stok hâli (19.10) — dört cevap, dört ayrı cümle.
 *
 * Tek bir `soldOut` bayrağı bu soruyu artık cevaplayamıyor. 19.9 yeri sunucuya taşıyınca
 * `availableQty` depo süzgeçli hâle geldi ve `soldOut = availableQty <= 0` sessizce anlam
 * değiştirdi: "hiçbir depoda yok"tan "senin deponda yok"a. Sonuç bir GERİLEMEYDİ — posta kodunu
 * giren müşteri, kargoyla gönderebileceğimiz ürünü "Tükendi" ve pasif bir düğme olarak görüyordu.
 * Sistem müşteriyi tanıdıkça daha az satıyordu, ki C3 tam olarak bunu yasaklıyor: "tükendi" yalnız
 * ürün HİÇBİR depoda yokken söylenebilir.
 */
export type StockStatus =
  /** Yerel depoda var (yer bilinmiyorsa: ağda var). Normal satış. */
  | 'available'
  /** Yerelde yok ama kargo deposunda var ve ürün kargolanabilir → "📦 Kargoyla gönderilir". */
  | 'shipping'
  /** Ağda var ama ne yerelde ne kargoda — soğuk zincir başka bölgede. "Bölgenizde şu an yok." */
  | 'elsewhere'
  /** Hiçbir depoda yok. Tek meşru "Tükendi". */
  | 'out_of_stock';


/**
 * Vitrin görünüm tipleri — müşteri yüzeyinin TEK veri sözleşmesi (08.10).
 *
 * Sayfalar servisi doğrudan çağırmaz; `lib/storefront` üzerinden okur. **Tek yedek KATEGORİLER**
 * (`fixtures.ts`) ve o da yalnız katalog tamamen boşken devreye girer; ürün, fiyat, stok, fırsat
 * ve paketler gerçek okunuyor. Bir kaynak daha değişirse YALNIZ bu dizinin içi değişir — sayfa,
 * komponent ve `messages.json` dosyalarına dokunulmaz.
 *
 * (Künye bir süre "fiyat motoru 05.4, paket 05.5, indirim 05.6 henüz yok" diyordu; üçü de inmişti
 * ve aynı dizindeki `fixtures.ts` bugünü doğru anlatıyordu — sözleşme dosyası ile yedek dosyası
 * iki ayrı gerçeklik öğretiyordu, üstelik yeni ajanın İLK okuduğu bu dosya. Denetim M-Y1.)
 *
 * Alan seçimi bilinçli: DB satırının tamamı taşınmaz. Vitrin kartının gösterdiği kadarı taşınır —
 * fazlası tele gider, ayrıca "müşteriye sızmayacak bilgi" (maliyet, stok, parti) yanlışlıkla
 * görünür hale gelir (`design/pages/musteri-anasayfa.md §6`).
 *
 * Çok dilli alanlar BURADA ÇÖZÜLMÜŞTÜR: sözleşme `locale` alır, `name` düz string döner. Sayfa
 * dil yedek zincirini bilmez — `resolveLocalizedText` tek yerde, okuma katmanında çağrılır.
 */

/** Kart görselinin ortak künyesi — anahtar değil, çözülmüş URL + kırpma (FramedImage bunu bekler). */
export interface StorefrontImage {
  url: string | null;
  crop: ImageCrop;
}

/** Kategori kartı — anasayfa şeridi ve katalog girişleri. */
export interface StorefrontCategory {
  id: string;
  slug: string;
  name: string;
  image: StorefrontImage;
}

/**
 * Satın alma yolu — kart aksiyonunu belirler. `quick`: tek varyantlı, listeden doğrudan eklenir.
 * `options`: çok varyantlı, ekleme listeden YAPILAMAZ (varyant seçimi atlanamaz — `musteri-katalog.md §3`),
 * kart detaya götürür.
 */
export type PurchaseMode = 'quick' | 'options';

/**
 * Ürün kartı. `priceCents` HAM değerdir — biçimlendirme görünüm katmanının işi (`format.ts`),
 * çünkü para gösterimi dile bağlıdır ve sözleşme dil-bağımsız veri taşımalıdır.
 *
 * İndirim alanları (`wasCents`, `limitLabel`) BURADA, ayrı bir "fırsat tipi"nde değil: katalogda
 * indirimli ve normal ürün aynı listede akar, kart ikisini de render eder. İndirimin SEBEBİ (tarih
 * yaklaşması, near-expiry) hiçbir zaman taşınmaz ki yanlışlıkla ekrana çıkamasın (`§6`).
 */
export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  image: StorefrontImage;
  /** Satılabilir birimin etiketi ("1 kg", "6 adet · 540 g") — varyanttan gelir. */
  unitLabel: string;
  /**
   * Listeden sepete eklenecek varyant (tek boylu üründe o boy, çok boyluda İLK boy).
   * `purchaseMode: 'options'` olduğunda kullanılmaz — çok boylu ürün listeden eklenmez, detaya gider.
   * Aktif varyantı olmayan üründe `null`: satılacak bir birim yok.
   */
  variantId: string | null;
  /** Teklif kalemi hangi partiye çıpalı — sepete o parti ile girer (DOMAIN §5). */
  stockId: string | null;
  /** Kilogram başına fiyat (ham cent) — INCO gereği raf fiyatının yanında; net ağırlık yoksa null. */
  comparisonCents: number | null;
  /** null = bu kanalda fiyatı yok → ürün SATIŞA KAPALI (DOMAIN §5); kart fiyat göstermez. */
  priceCents: number | null;
  /** İndirim öncesi fiyat — verilirse "Fırsat" rozeti + üstü çizili eski fiyat. */
  wasCents?: number;
  /**
   * Adet sınırı ("En fazla 5 adet" şablonuna girecek sayı); sınırsızsa null. Yalnız teklifte doğar:
   * teklif fiyatı partiye bağlıdır, o partide kalandan fazlası normal fiyata taşar (DOMAIN §5).
   */
  limitLabel: string | null;
  purchaseMode: PurchaseMode;
  /**
   * Tükendi. Ürün listede KALIR (tekrar gelecek beklentisi doğru kurulsun) ama sepete eklenemez;
   * kartın kendisi yine detaya tıklanabilir (`musteri-katalog.md §2`).
   */
  /** Yere göre stok hâli (19.10) — dört cevap, dört ayrı cümle. `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatus;
  soldOut: boolean;
}

/** Anasayfanın fırsat bölümü — indirim alanları zorunlu daraltma. */
export interface StorefrontOffer extends StorefrontProduct {
  wasCents: number;
  limitLabel: string | null;
}

/** Paket (bundle) kartı — tek fiyatlı hazır seçim. */
export interface StorefrontPackage {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: StorefrontImage;
  /** Kalem SAYISI (adet toplamı değil) — "8 ürün". */
  itemCount: number;
  priceCents: number;
  /** "6 kişilik" künyesi; girilmemişse rozet HİÇ basılmaz (tasarım). */
  serves: number | null;
  /**
   * Kalemlerin net ağırlık toplamı. Bir kalemin ağırlığı bilinmiyorsa **null** — eksiği 0 saymak
   * paketi olduğundan hafif gösterirdi; satır o zaman hiç basılmaz.
   */
  totalWeightG: number | null;
  /** Kargolanamayan (soğuk zincir) BİR kalem varsa paketin tamamı yalnız rota içi. */
  inRouteOnly: boolean;
  /** BİR kalem bile yetmiyorsa paket tükendi — paket bütün satılır, "yarısı var" hâli yok. */
  soldOut: boolean;
  /**
   * Kalemlerin EN YÜKSEK KDV oranı (%). Vitrin bunu göstermez (fiyat KDV dahil); checkout'ta
   * kargo KDV'sinin oransal bölünmesi için gerekiyor. Karışık oranlı bir pakette en yükseği
   * almak bilinçli: eksik hesaplamaktansa fazla hesaplamak vergi tarafında güvenli yön.
   */
  vatRate: number;
}

/**
 * Paket içeriğinin TEK kalemi — "Pakette neler var?" kartı.
 *
 * **Fiyat TAŞIMAZ ve taşımamalı.** Paketin tek fiyat kuralı (`musteri-paket-detay.md §6`) kalem
 * kırılımını yasaklıyor: "toplam değeri X, sen Y ödüyorsun" gösterilmez, hediye kalem "0 €" olarak
 * görünmez. Sözleşmede alan hiç olmayınca ekran onu yanlışlıkla basamaz.
 */
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
 * Paket detayının okuma sonucu — kart sözleşmesinin üstüne içerik + güven künyesi.
 *
 * Künyenin üç satırı da KALEMLERDEN türer, operatörden ayrıca istenmez: ağırlık = ağırlık × adet
 * toplamı, süre = en kısa ömürlü kalem, alerjen = kalemlerin birleşimi. Hesaplanamayan satır
 * BASILMAZ (uydurulmaz) — bu yüzden hepsi null/boş olabilir.
 */
export interface StorefrontPackageDetail extends StorefrontPackage {
  items: StorefrontPackageItem[];
  /** Kalemlerin alerjen birleşimi (kod); görünen ad dile göre komponentte çözülür. Boşsa satır yok. */
  allergens: ProductAllergen[];
  /** En KISA raf ömrü — paketin tamamı en çabuk bozulan kalemine göre tüketilir. Bilinmiyorsa null. */
  shelfLifeDays: number | null;
}

/** Anasayfanın tek okuma sonucu — bölümler ayrı ayrı çağrılmaz (tek turda toplanır). */
export interface StorefrontHome {
  categories: StorefrontCategory[];
  /** Vitrin seçkisi. */
  featured: StorefrontProduct[];
  /** Boşsa fırsat bölümü HİÇ render edilmez (envanter: "teklif yoksa bu bölüm var olmamalı"). */
  offers: StorefrontOffer[];
  packages: StorefrontPackage[];
}

/**
 * Katalog sıralama seçenekleri (K18). Sözleşme dosyasında durur, okuma dosyasında değil: seçenek
 * listesi bir DEĞER olduğu için süzgeç bileşenleri onu import eder ve o bileşenler client ağacında
 * çalışır — `server-only` işaretli okuma modülünden gelseydi derleme kırılırdı.
 */
export type CatalogSort = 'featured' | 'priceAsc' | 'priceDesc';
export const CATALOG_SORTS: CatalogSort[] = ['featured', 'priceAsc', 'priceDesc'];

/**
 * Satılabilir varyant — detay sayfasındaki "Boy seçin" kartı (K22).
 *
 * Fiyat KART düzeyinde değil VARYANT düzeyinde taşınır: seçim değişince fiyat, kıyas fiyatı ve
 * butondaki toplam güncellenir; üçü de aynı satırdan gelmezse ekranda tutarsız kalırlar.
 */
export interface StorefrontVariant {
  id: string;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş olabilir — gösterilecek bir boy adı yoktur. */
  label: string;
  /**
   * Net ağırlık (g). Besin tablosunun başlığı SEÇİLİ varyantınkini gösterir ("Net ağırlık: 700 g"):
   * beyan 100 g üzerinden sabittir ama paketin ağırlığı boya göre değişir, sabit kalırsa yanlış olur.
   */
  netWeightG: number | null;
  /** null = bu kanalda fiyatı yok → varyant seçilebilir ama satın alınamaz (DOMAIN §5). */
  priceCents: number | null;
  /** Teklif kazandıysa üstü çizilecek referans; yoksa tanımsız. */
  wasCents?: number;
  comparisonCents: number | null;
  /** Teklifin adet tavanı ("En fazla 5 adet"); tavan yoksa null. */
  limitLabel: string | null;
  /** Teklif kazandıysa çıpalı parti — sepete o parti ile girer (DOMAIN §5). */
  stockId: string | null;
  /** Yere göre stok hâli (19.10) — dört cevap, dört ayrı cümle. `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatus;
  soldOut: boolean;
}

/**
 * Yasal beyan (INCO) — uzaktan satışta satın alma ÖNCESİ erişilebilir olmak zorundadır, bu yüzden
 * sözleşmede opsiyonel bir süs değil, sayfanın taşıdığı asıl yüktür.
 *
 * Metinler `TextSegment[]` olarak gelir: operatörün `**vurgu**` işareti SUNUCUDA çözülür. Ham metni
 * tarayıcıya gönderip orada ayrıştırmak, işaretin kullanıcıya sızma ihtimalini açık bırakırdı.
 * Alerjen ve çapraz bulaşma listeleri KOD taşır (`gluten`), görünen ad dile göre komponentte çözülür.
 */
export interface StorefrontDeclaration {
  ingredients: TextSegment[] | null;
  allergens: ProductAllergen[];
  /** Çapraz bulaşma — cümle bu listeden i18n şablonuyla kurulur, serbest metin taşınmaz. */
  traces: ProductAllergen[];
  /** Beyan tablosu; hiçbir kalemi girilmemişse null (boş tablo gösterilmez). */
  nutrition: Nutrition | null;
  /** Net ağırlık BURADA DEĞİL: varyanta aittir (`StorefrontVariant.netWeightG`), seçime göre değişir. */
  storage: TextSegment[] | null;
}

/**
 * Ürün detay okumasının sonucu. Sayfanın tüm bölümleri TEK turda gelir — bölüm başına çağrı yok.
 *
 * **`reviews` alanı YOK ve olmayacak** — ama bölüm sayfada var ve gerçek veriyle çalışıyor (17.1).
 * Yorum/puan bu sözleşmeye değil geri bildirim modülüne ait: sayfa onları ayrı okuyor
 * (`lib/feedback/product-feedback`), çünkü moderasyon durumu ve "kim yazabilir" kararı orada
 * yaşıyor. Buraya alınsaydı vitrin sözleşmesi onay akışını bilmek zorunda kalırdı.
 *
 * (Künye bir süre "model henüz kurulmadı, bugün her ürünün yorum sayısı GERÇEKTEN sıfırdır"
 * diyordu — bu artık bayat değil YANLIŞtı: yorumlar okunuyor ve sıfır değil. Denetim M-Y4'ün
 * bulguda anılmayan ikinci satırı.)
 */
export interface StorefrontProductDetail {
  id: string;
  slug: string;
  name: string;
  /** Sayfa hangi dildeyse o dilde tek metin; çeviri eksikse yedek dilden gelir (sayfa bunu bilmez). */
  description: string | null;
  image: StorefrontImage;
  /** Galeri — ilk öğe kapak. Tek görselli üründe küçük görsel şeridi gösterilmez. */
  gallery: StorefrontImage[];
  /** Breadcrumb ve "benzer ürünler" başlığı için; kategorisiz üründe null. */
  category: StorefrontCategory | null;
  /** En az bir öğe. Tek varyantlı üründe seçim adımı HİÇ gösterilmez (`§2`). */
  variants: StorefrontVariant[];
  declaration: StorefrontDeclaration;
  /** false → "yalnız bölge içi kapıya teslim" uyarısı, sepete eklemeden ÖNCE görünür. */
  shippable: boolean;
  /** Aynı kategoriden başka ürünler; boşsa bölüm render edilmez. */
  similar: StorefrontProduct[];
}

/** Katalog okumasının sonucu — sayfa ve süzgeç bileşenlerinin paylaştığı şekil. */
export interface StorefrontCatalog {
  categories: StorefrontCategory[];
  /** Seçili kategori (yoksa tüm katalog) — başlık bandı ve çip seçimi bunu kullanır. */
  activeCategory: StorefrontCategory | null;
  products: StorefrontProduct[];
  /** Sonuç sayısı — "24 ürün" satırı. Süzgeçle birlikte değişir. */
  total: number;
  /** null ise liste bitti; istemci "daha fazla"yı kapatır. */
  nextCursor: KeysetCursor | null;
}
