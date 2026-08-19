import type { TextSegment } from '@lezzet/helper';
import type { CartLineRoute } from '@lezzet/domain-core';
import type { ImageCrop, KeysetCursor, Nutrition, ProductAllergen, PurchaseMode, StockStatus } from '@lezzet/types';
import type { ScopeCampaign } from './campaign';

/**
 * **Vitrin veri sözleşmesi** — katalog orkestrasyonunun DÖNÜŞ şekli (terfi 21.6).
 *
 * Kaynağı `apps/web/lib/storefront/storefront-types.ts`ti; artık sahibi bu paket, web kopyası
 * geçiş köprüsüdür. Buraya taşınan yalnız **iki yüzeyin birden okuyacağı** şekil: kategori, ürün
 * kartı, varyant, beyan, aile, benzer, katalog sayfası. Anasayfa (`StorefrontHome`) tipleri hâlâ
 * terfi etmedi — orkestrasyonu da web'de kaldı (bkz. 21.6 Durum).
 *
 * **Paket (`StorefrontPackage*`) 09.08'de KATILDI:** ikinci tüketeni doğdu — mobil sepetin paket
 * satırı ve mobil paket detay ucu (`apps/mobile-api`) aynı şekli okuyor. Terfi tetiği ölçülmüş bir
 * arızaydı: paket satırı sunucuya yazılıyor ama çözen kapı (`getPackagesByIds`) `apps/web`te
 * yaşadığı için mobilde adsız/fiyatsız/engelli dönüyor ve tutarı sepet toplamına hiç girmiyordu.
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
*
 * ── ÜÇ HÂL, İKİ ALANDAN TÜRER (19.23 · 09.08) ────────────────────────────────
 *   (null, null)   yer bilinmiyor   → okuma ağ-geneline düşer (C3: "tükendi" ancak hiçbir depoda
 *                                     yoksa denir)
 *   (rota, kargo)  rota içi         → yerel havuz o deponun stoğu
 *   (null, kargo)  **ROTA DIŞI**    → yerel havuz BOŞ; müşteriye yalnız kargo gider
 *
 * **`warehouseId` YALNIZ ROTA deposudur.** Eskiden çözümün `warehouseId`i olduğu gibi yayılıyordu
 * ve o alan `shipping` hâlinde KARGO deposunu taşıyor — tek kutu iki anlam. Okuyan taraf ayırt
 * edemediği için rota dışındaki müşteriye "ücretsiz kapı teslimi" işareti veriliyor, kargo grubu
 * hiç doğmuyordu (ölçüldü: 75011 ile 67000 birebir aynı sonucu veriyordu).
 *
 * Üçüncü bir `mode` alanı EKLENMEDİ: türetilebilen bir şeyin ikinci kaynağı bir gün ötekiyle
 * çelişir. Alanların kendisi artık tek anlam taşıyor — kök sebep buydu.
 */
export interface PlaceWarehouses {
  /** **ROTA** deposu — aracın çıktığı yer. `null` = yer bilinmiyor YA DA rota dışı (üstteki tablo). */
  warehouseId: string | null;
  /** Ülkenin kargo çıkış deposu. `null` = yer bilinmiyor ya da o ülkeye kargo yok. */
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
 *
 * **Tanım burada DEĞİL, `@lezzet/types`ta** (`PurchaseModeEnum` — terfi 21.6): mobil sözleşme şeması
 * aynı birliği zod olarak ifade etmek zorunda ve iki ayrı tanım bir gün ayrışırdı. Buradan
 * re-export ediliyor ki paketin dış API'si değişmesin — çağıran hâlâ `@lezzet/application`dan alır.
 */
export type { PurchaseMode };

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
   * Listeden sepete eklenecek varyant (tek boylu üründe o boy, çok boyluda EN UCUZ boy — 09.08).
   * `purchaseMode: 'options'` olduğunda kullanılmaz — çok boylu ürün listeden eklenmez, detaya gider.
   * Aktif varyantı olmayan üründe `null`: satılacak bir birim yok.
   */
  variantId: string | null;
  /** Teklif kalemi hangi partiye çıpalı — sepete o parti ile girer (DOMAIN §5). */
  stockId: string | null;
  /**
   * **AKTİF varyant sayısı** — kartın çeşit satırı ("3 seçenek") bundan kurulur.
   *
   * Sayı taşınır, LİSTE değil: kart yalnız kaç seçenek olduğunu söyler, hangileri olduğunu değil —
   * seçim detayda yapılır ve boyların tamamını her kartla birlikte tele vermek hiç kullanılmayacak
   * bir veriyi taşımak olurdu. Ölçüt `purchaseMode` ile AYNI kümedir (aktif boylar), o yüzden ikisi
   * çelişemez: `variantCount > 1` ⇔ `purchaseMode === 'options'`.
   *
   * `0` = aktif boyu olmayan ürün (satılacak birim yok, `variantId` de null). Satır 0 ve 1'de
   * çizilmez — "1 seçenek" yazmak seçim varmış izlenimi verirdi.
   */
  variantCount: number;
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
  /**
   * Paketteki ADET — boy seçicinin ne yazacağını bu belirler (kullanıcı kararı 19.08).
   *
   * *"Kullanıcı varyant isminde adet mantıklıysa adet görmeli, gramaj mantıklıysa gramaj."*
   * Etiketin gramajı TEKRAR ETMESİ duplication'dı: toplam ağırlık `netWeightG`de, adet burada
   * zaten duruyor. 4'lü simit paketine "4x105g" yazmak müşteriye kutunun üstündeki dizgiyi
   * okutuyordu; sorulması gereken "4'lü mü 100'lük mü".
   *
   * `null` = tek parça → gösterim gramaja düşer.
   */
  piecesCount: number | null;
  /** Porsiyon türü — `item` ayrı ürünler, `slice` dilimler; gösterimdeki KELİMEYİ bu belirler. */
  portionKind: 'item' | 'slice' | null;
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
   * **Başlangıç fiyatı** — çeşidin EN UCUZ aktif boyu (09.08), kartta "…'dan" ekiyle yazılır.
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
  /**
   * **Açılışta SEÇİLİ boy** (09.08) — liste kartının fiyatını okuduğu boyun ta kendisi.
   *
   * Alan var çünkü ekran bu soruyu KENDİ hesaplamamalı. Ölçüt (`primaryVariantOf`) sunucuda ham
   * varyant + fiyat bağlamı ister; detay ekranı ise fiyatı çözülmüş `StorefrontVariant`'ları tutar
   * ve `'use client'`tır. İkisi buluşamayınca kural bir dönem **iki nüsha** hâlinde yaşadı
   * (`web/lib/storefront/variant-choice.ts`) — kural tekti ama nüshalar bir gün ayrışırdı ve
   * ayrışma sessiz olurdu: kimse "kartta yazan fiyatla detayda açılan boy farklı" diye bir hata
   * görmez, yalnız müşteri görür. Sunucunun işaretlemesi o riski kökünden kaldırıyor.
   *
   * **SIRA bu alanın konusu DEĞİL:** `variants` operatörün `sortOrder`'ında kalır. Sıra operatörün
   * kararı, birincil boy fiyat vaadinin karşılığı — ikisi ayrı soru.
   *
   * `null` = aktif boy yok (satılacak birim yok); ekran seçim adımını çizmez.
   */
  primaryVariantId: string | null;
  declaration: StorefrontDeclaration;
  /** false → "yalnız bölge içi kapıya teslim" uyarısı, sepete eklemeden ÖNCE görünür. */
  shippable: boolean;
  /**
   * Soğuk zincir gerekiyor mu — künye işaretinin dayanağı (16.08). **`shippable`den TÜRETİLMEZ,
   * ayrı alandan gelir** (`product.storage_type`): eskiden `!shippable` proxy olarak kullanılıyordu
   * ve kargolanabilen bir ürüne de *"soğuk zincirle gelir"* yazdırıyordu.
   */
  coldChain: boolean;
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
/**
 * Koleksiyonun katalog başlığındaki künyesi (08.26) — ürün listesi değil, ÜST BİLGİ.
 *
 * `description` ve `image` paylaşım kartı (OG) içindir: koleksiyon bağlantısı WhatsApp'ta dolaşan
 * içeriğin ta kendisi. Ana sayfa bandının kartı (`StorefrontCollection`, web tarafında) bundan
 * ayrı durur — o bandın sorusu "kaç ürün", bunun sorusu "bu kesit nedir".
 */
export interface StorefrontCollectionHead {
  id: string;
  slug: string;
  name: string;
  /** Boş olabilir — koleksiyona açıklama girmek zorunlu değil; ekran satırı sessizce atlar. */
  description: string;
  image: StorefrontImage;
}

export interface StorefrontCatalog {
  categories: StorefrontCategory[];
  /** Seçili kategori (yoksa tüm katalog) — başlık bandı ve çip seçimi bunu kullanır. */
  activeCategory: StorefrontCategory | null;
  /**
   * **Seçili koleksiyon** (08.26) — katalogun "koleksiyon görünümü" hâli.
   *
   * Kategoriden AYRI bir alan, çünkü ayrı bir soru: kategori kataloğun kalıcı bölümlemesidir
   * (çiplerle gezilir), koleksiyon ise editoryal bir kesittir ve o görünümde **kategori çipleri
   * gizlenir**. Tek alanda birleştirilseydi ekran hangisinde olduğunu bilemez, iki farklı başlık
   * bandını aynı veriden kurmaya çalışırdı.
   *
   * Slug verilmiş ama karşılığı yoksa `null` — ekran o zaman sıradan katalogu gösterir; ölü bir
   * bağlantı 404 yerine tam kataloğa düşer.
   */
  activeCollection: StorefrontCollectionHead | null;
  products: StorefrontProduct[];
  /** Sonuç sayısı — "24 ürün" satırı. Süzgeçle birlikte değişir. */
  total: number;
  /** null ise liste bitti; çağıran "daha fazla"yı kapatır. */
  nextCursor: KeysetCursor | null;
  /**
   * **Etkin süzgecin kampanyası** (08.44) — `null` = yok ya da süzgeç yok.
   *
   * Kategori mi koleksiyon mu diye ayrılmıyor ve bu bilinçli: sayfada aynı anda yalnız BİRİ etkin
   * olabiliyor (koleksiyon görünümünde kategori çipleri zaten gizleniyor), yani ekranın sorduğu
   * soru *"şu an baktığım kesitte kampanya var mı"*. İki alan açmak, ekranı hangisinin dolu
   * olduğunu sormaya zorlardı.
   *
   * Süzgeç YOKKEN (tam katalog) `null`: "katalogun tamamında kampanya var" diye bir şey yok —
   * kampanya bir kesite aittir ve o kesit seçilmeden söylenemez.
   */
  campaign: ScopeCampaign | null;
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
  /**
   * BİR kalem bile yetmiyorsa paket tükendi — paket bütün satılır, "yarısı var" hâli yok.
   *
   * **Ölçüsü AĞ GENELİDİR ve öyle kalmalı** (C3): "tükendi" ancak HİÇBİR depoda yoksa söylenir.
   * Yere bağlı hâl (`route`) ayrı bir alandır — ikisini tek bayrakta toplamak, öbür depoda duran
   * malı "tükendi" diye ilan etmek olurdu.
   */
  soldOut: boolean;
  /**
   * **Bu yerden hangi yolla gelir** (19.22) — karar `decideBundleAgainstWarehouse` motorundan gelir.
   *
   * `null` = yer bilinmiyor (posta kodu sorulmamış): yol da bilinmiyor. Ziyaretçiye hangi yoldan
   * geleceğini söylemek, bilmediğimiz bir şeyi söylemektir — o hâlde yalnız `soldOut` konuşur.
   *
   * Paket BÖLÜNMEZ (K5): yol paketin bütünü içindir, kalemleri için değil.
   */
  route: CartLineRoute | null;
  /**
   * Bu yerden ŞU AN kaç PAKET yapılabilir — en zayıf kalemden (`min⌊mevcut ÷ kalem-adedi⌋`).
   *
   * `null` = yer bilinmiyor. Olumsuz yollarda 0. **Bir SÖZ DEĞİL, bir sayı**: sepet stok ayırmıyor
   * (DOMAIN §4), gerçek kapı checkout'tur.
   */
  maxQty: number | null;
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
 *
 * **Sepetin `CartBundleSource`u bunun YAPISAL İKİZİDİR** (`cart/read.ts`): kapı hiçbir dönüştürme
 * yazmadan geçer. İkizlik tesadüf değil, kapının tasarım şartıdır — sepet paketin alerjenini,
 * ağırlığını, kalem görsellerini kullanmadığı için o taraf DAR tutuldu; buradaki geniş şekil onu
 * karşılıyor.
 */
export interface StorefrontPackageDetail extends StorefrontPackage {
  items: StorefrontPackageItem[];
  /** Kalemlerin alerjen birleşimi (kod); görünen ad dile göre komponentte çözülür. Boşsa satır yok. */
  allergens: ProductAllergen[];
  /** En KISA raf ömrü — paketin tamamı en çabuk bozulan kalemine göre tüketilir. Bilinmiyorsa null. */
  shelfLifeDays: number | null;
}
