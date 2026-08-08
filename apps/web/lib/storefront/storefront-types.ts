import type { ProductAllergen } from '@lezzet/types';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct } from '@lezzet/application';

/**
 * Vitrinin WEB'E ÖZEL görünüm tipleri (08.10 → terfi 21.6 sonrası incelmiş hâli).
 *
 * Ürün/katalog/detay sözleşmesinin tamamı (`StorefrontProduct` · `StorefrontCatalog` ·
 * `StorefrontProductDetail` · `StockStatus` · `CatalogSort` …) `@lezzet/application` ve
 * `@lezzet/types`'a terfi etti — native uygulama da aynı sözleşmeyi okur, iki kopya "sitede bir
 * fiyat, uygulamada başka fiyat" demekti. Burada kalanlar orkestrasyonu da webde kalan üç ailedir
 * (paketin kendi künyesi böyle diyor): **anasayfa** (`StorefrontHome`), **paket**
 * (`StorefrontPackage*`) ve **tarif** (`StorefrontRecipe*`). Bunların ikinci tüketeni doğduğu gün
 * tek tek aynı yolla terfi ederler.
 *
 * Alan seçimi ilkesi aynen sürer: DB satırının tamamı taşınmaz, kartın gösterdiği kadarı taşınır;
 * çok dilli alanlar okuma katmanında çözülür, sayfa dil yedeğini bilmez.
 */

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
