import type { TextSegment } from '@lezzet/helper';
import type { ImageCrop, KeysetCursor, Nutrition, ProductAllergen, StockStatus } from '@lezzet/types';

/**
 * **Vitrin veri sözleşmesi** — katalog orkestrasyonunun DÖNÜŞ şekli (terfi 21.6).
 *
 * Kaynağı `apps/web/lib/storefront/storefront-types.ts`ti; artık sahibi bu paket, web kopyası
 * geçiş köprüsüdür. Buraya taşınan yalnız **iki yüzeyin birden okuyacağı** şekil: kategori, ürün
 * kartı, varyant, beyan, aile, benzer, katalog sayfası. Anasayfa (`StorefrontHome`) ve paket
 * (`StorefrontPackage*`) tipleri terfi etmedi — orkestrasyonları da web'de kaldı (bkz. 21.6 Durum).
 *
 * Alan seçimi bilinçli: DB satırının tamamı taşınmaz. Vitrin kartının gösterdiği kadarı taşınır —
 * fazlası tele gider, ayrıca "müşteriye sızmayacak bilgi" (maliyet, stok, parti) yanlışlıkla
 * görünür hale gelir (`design/pages/musteri-anasayfa.md §6`).
 *
 * Çok dilli alanlar BURADA ÇÖZÜLMÜŞTÜR: sözleşme `locale` alır, `name` düz string döner. Çağıran
 * dil yedek zincirini bilmez — `resolveLocalizedText` tek yerde, okuma katmanında çağrılır.
 *
 * `StockStatus` bu dosyada DEĞİL `@lezzet/types`ta (terfi 21.6-F): dört hâl bir domain sözlüğüdür,
 * vitrin ayrıntısı değil — kargo/rota kararını okuyan her yüzey aynı dört kelimeyi kullanmalı.
 */

/**
 * **Yer bağlamı** (19.10) — okumanın "nereye bakıyorum" ekseni; iki depo, tek nesne.
 *
 * Ayrı konumsal parametreler yerine nesne: üçüncü bir alan eklendiğinde çağıranların imzası
 * kaymaz, ve daha önemlisi ikisini birlikte geçmek zorunlu hâle gelir. `warehouseId` tek başına
 * geçilseydi "yerelde yok = tükendi" hatası ilk unutan çağırandan geri dönerdi.
 *
 * **Bu tip yer ÇÖZÜMÜNÜN sonucudur, çözümün kendisi değil** (`web/lib/delivery/read-place.ts` —
 * posta kodu → bölge → depo). O orkestrasyon 21.6'nın (B) parçasıdır ve HENÜZ TERFİ ETMEDİ; ettiği
 * gün bu paketin `delivery/` klasörüne gelir ve tip orada kalmaya devam eder — yani ev değişmez,
 * yalnız üreticisi de yanına taşınır. Web'in `PlaceWarehouses`'ı bugün yapısal ikizidir.
 */
export interface PlaceWarehouses {
  /** Yerin çözdüğü depo. `null` = yer bilinmiyor → okuma ağ-geneline düşer. */
  warehouseId: string | null;
  /** Ülkenin kargo deposu. `null` = yer bilinmiyor ya da o ülkeye kargo yok. */
  shippingWarehouseId: string | null;
}

/** Kart görselinin ortak künyesi — anahtar değil, çözülmüş URL + kırpma. */
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
 * Ürün kartı. `priceCents` HAM değerdir — biçimlendirme görünüm katmanının işi, çünkü para
 * gösterimi dile bağlıdır ve sözleşme dil-bağımsız veri taşımalıdır.
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
  /** Yere göre stok hâli (19.10) — dört cevap, dört ayrı cümle. `soldOut` bunun daraltılmışı. */
  stockStatus: StockStatus;
  /**
   * Tükendi — YALNIZ `out_of_stock` hâlinde. Ürün listede KALIR (tekrar gelecek beklentisi doğru
   * kurulsun) ama sepete eklenemez; kartın kendisi yine detaya tıklanabilir (`musteri-katalog.md §2`).
   */
  soldOut: boolean;
}

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
 * istemciye gönderip orada ayrıştırmak, işaretin kullanıcıya sızma ihtimalini açık bırakırdı.
 * Alerjen ve çapraz bulaşma listeleri KOD taşır (`gluten`), görünen ad dile göre ekranda çözülür.
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
 * Ailedeki bir çeşit kartı (05.15).
 *
 * Çizim: görsel + etiket + **başlangıç fiyatı** ("14,90 €'dan"); bakılan çeşitte fiyatın yerini
 * "Bakıyorsunuz" alır ve karta ✓ rozeti düşer.
 *
 * Tükenmiş çeşitler listeye HİÇ girmez (brief §1b), o yüzden bir "tükendi" hâli yok.
 */
export interface StorefrontFamilyMember {
  slug: string;
  /** **Aile içi etiket** ("Limonlu") — ürün adı ("Limonlu kek") DEĞİL. */
  label: string;
  image: StorefrontImage;
  /**
   * **Başlangıç fiyatı** — çeşidin ilk aktif varyantı, kartta "…'dan" ekiyle yazılır.
   * `null` = fiyat çözülemedi (kanal fiyatı girilmemiş); ekran o kartta fiyat satırını çizmez.
   * Sıfır YAZILMAZ (`CLAUDE §1`): ölçülemeyen değer sıfır değildir, bedava görünürdü.
   *
   * Bakılan çeşitte de dolu gelir — "Bakıyorsunuz" metnine geçme kararı EKRANIN
   * (`isCurrent`), verinin değil.
   */
  fromPriceCents: number | null;
  /** Şu an bakılan çeşit — kart ✓ ile işaretlenir, fiyat yerine "Bakıyorsunuz" yazılır. */
  isCurrent: boolean;
}

/**
 * Ürün detay okumasının sonucu. Sayfanın tüm bölümleri TEK turda gelir — bölüm başına çağrı yok.
 *
 * **`reviews` alanı YOK ve olmayacak** (17.1): yorum/puan bu sözleşmeye değil geri bildirim
 * modülüne ait — moderasyon durumu ve "kim yazabilir" kararı orada yaşıyor. Buraya alınsaydı
 * vitrin sözleşmesi onay akışını bilmek zorunda kalırdı.
 */
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
  /** En az bir öğe. Tek varyantlı üründe seçim adımı HİÇ gösterilmez (`§2`). */
  variants: StorefrontVariant[];
  declaration: StorefrontDeclaration;
  /** false → "yalnız bölge içi kapıya teslim" uyarısı, sepete eklemeden ÖNCE görünür. */
  shippable: boolean;
  /**
   * **Ailenin öteki çeşitleri** (05.15) — resimli kartlar, sayfanın üst bölgesinde.
   *
   * Boşsa bölüm HİÇ çizilmez: ailesiz üründe de, ailesi tek üyeye düşmüş üründe de.
   *
   * **Varyant seçicisiyle KARIŞTIRILMAMALI:** varyant aynı ürünün boyudur ve yalnız fiyatı
   * değiştirir; çeşit kartı kardeş ürünün sayfasına götürür.
   */
  family: StorefrontFamilyMember[];
  /**
   * Aynı kategoriden başka ürünler; boşsa bölüm render edilmez. Seçim kuralı saf ve testli:
   * `pickSimilar` (`@lezzet/domain-core`).
   */
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
  /** null ise liste bitti; çağıran "daha fazla"yı kapatır. */
  nextCursor: KeysetCursor | null;
}
