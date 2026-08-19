import type { ScopeCampaign } from '@lezzet/application';
import type {
  StorefrontCategory,
  StorefrontImage,
  StorefrontPackage,
  StorefrontPackageDetail,
  StorefrontPackageItem,
  StorefrontProduct,
} from '@lezzet/application';

/**
 * Vitrinin WEB'E ÖZEL görünüm tipleri (08.10 → terfi 21.6 sonrası incelmiş hâli).
 *
 * Ürün/katalog/detay sözleşmesinin tamamı (`StorefrontProduct` · `StorefrontCatalog` ·
 * `StorefrontProductDetail` · `StockStatus` · `CatalogSort` …) `@lezzet/application` ve
 * `@lezzet/types`'a terfi etti — native uygulama da aynı sözleşmeyi okur, iki kopya "sitede bir
 * fiyat, uygulamada başka fiyat" demekti. Burada kalanlar orkestrasyonu da webde kalan iki ailedir
 * (paketin kendi künyesi böyle diyor): **anasayfa** (`StorefrontHome`) ve **tarif**
 * (`StorefrontRecipe*`). Bunların ikinci tüketeni doğduğu gün tek tek aynı yolla terfi ederler.
 *
 * **Paket ailesi (`StorefrontPackage*`) 09.08'de terfi etti** — ikinci tüketeni doğdu: mobil sepetin
 * paket satırı ve mobil paket detay ucu. Şekiller `@lezzet/application/catalog/storefront-types`ta,
 * aşağıdaki `export type` satırı KÖPRÜDÜR: sayfa/komponent import'ları (`packages-types.ts`,
 * `package-card.tsx`, `content-card.tsx` …) yerinden oynamasın diye duruyor.
 *
 * Alan seçimi ilkesi aynen sürer: DB satırının tamamı taşınmaz, kartın gösterdiği kadarı taşınır;
 * çok dilli alanlar okuma katmanında çözülür, sayfa dil yedeğini bilmez.
 */
export type { StorefrontPackage, StorefrontPackageDetail, StorefrontPackageItem };

/** Anasayfanın fırsat bölümü — indirim alanları zorunlu daraltma. */
export interface StorefrontOffer extends StorefrontProduct {
  wasCents: number;
  limitLabel: string | null;
}

/**
 * **KOLEKSİYON BANDI** — ana sayfanın "Koleksiyonlar" bölümü (08.26).
 *
 * Koleksiyon bir SATIŞ BİRİMİ DEĞİL, paketle karıştırılmamalı: kendi fiyatı, kendi sipariş kalemi
 * yoktur; yalnız kataloğun bir kesitine açılan kapıdır (`/catalog?collection=<slug>`). Kartın
 * taşıdığı her alan tasarımın o banttan istediği kadarı — `description` burada YOK çünkü bantta
 * yazmıyor; paylaşım kartının (OG) metnini katalog sayfası kendi okur.
 */
export interface StorefrontCollection {
  id: string;
  slug: string;
  name: string;
  /** 16:7 kapak bandı; kapaksız koleksiyon da çizilir (kart adını taşır — boş bant değil). */
  image: StorefrontImage;
  /**
   * Kaç ürün — **kataloğun sayacağıyla AYNI ölçüt** (aktif ürün). Üyelik sayısını basmak kolay
   * olurdu ve yalan söylerdi: pasif üyeler karta girer, müşteri "14 ürün" okuyup 9 görürdü.
   */
  productCount: number;
  /**
   * Bu koleksiyonda yürürlükte olan KAMPANYA (08.44) — `null` = yok, kart rozet çizmez.
   * Tutar değil kuralın kendisi taşınır: kampanya ürün fiyatına yazılamaz (gerekçe
   * `lib/storefront/campaign-note` künyesinde), kart onu bir rozet olarak söyler.
   */
  campaign: ScopeCampaign | null;
}

/** Anasayfanın tek okuma sonucu — bölümler ayrı ayrı çağrılmaz (tek turda toplanır). */
export interface StorefrontHome {
  categories: StorefrontCategory[];
  /** Vitrin seçkisi. */
  featured: StorefrontProduct[];
  /**
   * Bantta GÖSTERİLEN fırsatlar — tasarımın üçlü ızgarası, her istekte havuzdan rastgele seçilir
   * (kullanıcı kararı 09.08). Boşsa bölüm HİÇ render edilmez (envanter: "teklif yoksa bu bölüm
   * var olmamalı").
   */
  offers: StorefrontOffer[];
  /**
   * ELDEKİ toplam fırsat sayısı — gösterilen değil. "Daha fazla gör" bağı yalnız
   * `offersTotal > offers.length` iken çizilir; aksi hâlde tıklayan müşteri aynı üç ürünü bulurdu.
   */
  offersTotal: number;
  packages: StorefrontPackage[];
  /** Boşsa koleksiyon bölümü HİÇ çizilmez (tasarımın `hasCollections` koşulu) — boş hâl gösterilmez. */
  collections: StorefrontCollection[];
  /**
   * "Sofradan Fikirler" şeridi — ana sayfanın tarif daveti (tasarım 09.08).
   *
   * Boşsa bölüm HİÇ çizilmez, koleksiyonun kuralıyla aynı: yayında tarif yokken "yakında" demek,
   * tutulacağı belli olmayan bir söz vermek olurdu. Tarifin yayın eşiği zaten yüksek (üç dil dolu
   * olmadan `is_active` geçmiyor — 05.16), yani boş hâl gerçekten yaşanır.
   */
  recipes: StorefrontRecipe[];
}

/**
 * **TARİF KARTI** — "Sofradan Fikirler" listesinin öğesi (08.24 · veri modeli 05.16).
 *
 * Tarif bir SATIŞ BİRİMİ DEĞİL: kendi fiyatı, kendi stoğu, kendi sipariş kalemi yoktur. Pakete
 * (`StorefrontPackage`) benzemesi aldatıcı — paket bütün olarak satılır ve tek fiyatı vardır,
 * tarif ise yalnız var olan varyantları sepete TAŞIR. Bu yüzden `priceCents` yerine `totalCents`
 * var ve anlamı farklı: paketin fiyatı bir tanımdır, tarifin toplamı bir HESAPTIR — kalemlerinden
 * doğar ve tükenen kalemle birlikte düşer.
 */
export interface StorefrontRecipe {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: StorefrontImage;
  /**
   * Rozetin iki parçası — "15 dk · 2 kişilik". İkisi de **serbest metin** (05.16): hesap yok,
   * süzme yok, sıralama yok. `serves` sayı OLAMAZ, tasarım "3–4 kişilik" diyor.
   * Boş olan parça rozetten düşer; ikisi de boşsa rozet hiç basılmaz.
   */
  duration: string | null;
  serves: string | null;
  /** BİZİM ürünlerimizin satır sayısı — "1 ürün" (adet toplamı değil, `qty` ayrı). */
  itemCount: number;
  /** "Evinizden" madde sayısı — "+ 3 ev malzemesi". Metnin satır sayısından türer. */
  pantryCount: number;
  /**
   * Alınabilir kalemlerin toplamı. **Tükenen kalem toplamdan DÜŞER** (tasarımın açık kuralı):
   * müşteri o kalemi sepete koyamayacağına göre ödeyeceği tutar da onu içermez.
   * `null` = alınabilir kalem yok; ekran fiyat yazmaz. Sıfır YAZILMAZ — bedava görünürdü.
   */
  totalCents: number | null;
  /** Hiçbir kalem alınamıyor. Tarif yine okunur (yemek tarifi bir içeriktir), CTA pasifleşir. */
  soldOut: boolean;
}

/**
 * **TARİFİN TEK MALZEMESİ** — bizim ürünümüz olan satır (ev malzemesi burada DEĞİL, o `pantry`).
 *
 * Bağ VARYANTA kurulu (05.16): sepet yalnız varyantla çalışır, "Ezine Beyaz Peynir" yetmez —
 * "350 g" olan satır sepete eklenebilen tek şeydir. `productSlug` yalnız bağlantı içindir:
 * malzeme satırına dokunmak ürünün detay sayfasına gider (tasarımın etkileşim sözleşmesi).
 */
export interface StorefrontRecipeItem {
  variantId: string;
  productSlug: string;
  name: string;
  /** Boy etiketi ("350 g") — çok dilli, sunucuda çözülür. */
  unitLabel: string;
  image: StorefrontImage;
  qty: number;
  /** Birim fiyat — persona (B2B toptan) ve depo süzgecinden geçmiş. `null` = satışa kapalı. */
  unitPriceCents: number | null;
  /** `qty × unitPriceCents`; fiyatsızda `null` — çarpımı 0 yazmak kalemi bedava gösterirdi. */
  lineTotalCents: number | null;
  /** Teklif kalemi hangi partiye çıpalı (DOMAIN §5) — sepete o kimlikle gider. */
  stockId: string | null;
  /** GERÇEK tükenme (`stockStatus === 'out_of_stock'`) — "senin deponda yok" bu değildir (C3). */
  soldOut: boolean;
}

/** Tarif detayı — kartın taşıdığı her şey + hazırlanış, evden malzemeler ve kalemler. */
export interface StorefrontRecipeDetail extends StorefrontRecipe {
  /** "Akşam yemeği" — öğün künyesi, ayrı renkte rozet. Boşsa rozet basılmaz. */
  meal: string | null;
  /** Hazırlanış adımları — **satır = adım** (05.16); numarayı EKRAN verir, metin taşımaz. */
  steps: string[];
  /** "Evinizden" maddeleri — satır = madde. Bunlar bizim ürünümüz DEĞİL, sepete eklenmez. */
  pantry: string[];
  items: StorefrontRecipeItem[];
}
