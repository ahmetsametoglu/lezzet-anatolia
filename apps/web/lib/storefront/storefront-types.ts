import type { ImageCrop } from '@lezzet/types';

/**
 * Vitrin görünüm tipleri — müşteri yüzeyinin TEK veri sözleşmesi (08.10).
 *
 * Sayfalar servisi doğrudan çağırmaz; `lib/storefront` üzerinden okur. Bugün bu fonksiyonların bir
 * kısmı fixture döner (fiyat motoru 05.4, paket 05.5, indirim 05.6 henüz yok); kaynak geldiğinde
 * YALNIZ bu dizinin içi değişir — sayfa, komponent ve `messages.json` dosyalarına dokunulmaz.
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
  /** Kilogram başına fiyat (ham cent) — INCO gereği raf fiyatının yanında gösterilir. */
  comparisonCents: number;
  priceCents: number;
  /** İndirim öncesi fiyat — verilirse "Fırsat" rozeti + üstü çizili eski fiyat. */
  wasCents?: number;
  /** Kişi başı sınır ("En fazla 5 adet" şablonuna girecek sayı); sınırsızsa null. */
  limitLabel?: string | null;
  purchaseMode: PurchaseMode;
  /**
   * Tükendi. Ürün listede KALIR (tekrar gelecek beklentisi doğru kurulsun) ama sepete eklenemez;
   * kartın kendisi yine detaya tıklanabilir (`musteri-katalog.md §2`).
   */
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
  itemCount: number;
  priceCents: number;
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
