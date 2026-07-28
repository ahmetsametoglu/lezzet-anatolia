import type { StorefrontImage } from '@/lib/storefront/storefront-types';

/**
 * Sepet sözleşmesi (08.4) — müşteri yüzeyinin ikinci veri kapısı.
 *
 * İKİ KATMAN vardır ve karıştırılmamalıdır:
 *   `CartEntry` → NİYET. Ne istendiği: varyant + adet + (varsa) çıpalı parti. Misafirde tarayıcıda,
 *                 girişli müşteride sunucuda (`Cart.items`) yaşar. Fiyat TAŞIMAZ.
 *   `CartLine`  → GÖRÜNÜM. O niyetin bugünkü karşılığı: ad, görsel, fiyat, tükendi, tavan. Her
 *                 okumada YENİDEN çözülür.
 *
 * Ayrım gerçek bir kuraldan doğuyor: sepetteki fiyat **bağlayıcı değildir** (DOMAIN §5). Sepet
 * sunucuda aylarca bekleyebilir; oradaki fiyatı bağlayıcı saymak maliyeti oynayan üründe zarar,
 * fiyat düştüğünde müşteriye haksızlıktır. Bağlayıcı fiyat checkout başlangıcında sabitlenir.
 * Bu yüzden görünüm niyetten TÜRETİLİR, niyetin içinde saklanmaz.
 */

/** Sepetteki bir satırın kimliği — aynı varyantın farklı partisi AYRI satırdır (teklif çıpası). */
export interface CartEntry {
  variantId: string;
  qty: number;
  /** Teklif kalemi hangi partiye çıpalı; normal satışta null (DOMAIN §5). */
  stockId: string | null;
}

/** Sepet satırının bugünkü görünümü — niyetten her okumada yeniden çözülür. */
export interface CartLine extends CartEntry {
  /** Ürüne dönüş bağlantısı için. */
  slug: string;
  name: string;
  image: StorefrontImage;
  /** Boy etiketi ("700 g tepsi"); tek boylu üründe boş. */
  unitLabel: string;
  /** null = artık satışa kapalı (kanal fiyatı kalkmış) — satır çıkarılmadan devam edilemez. */
  unitPriceCents: number | null;
  /** Teklif kazandıysa üstü çizilecek referans. */
  wasCents?: number;
  /** Teklifin adet tavanı (partide kalan); tavan yoksa null. */
  limitCap: number | null;
  /** Satır toplamı — fiyat yoksa null. */
  lineTotalCents: number | null;
  /**
   * Bu satır çıkarılmadan checkout'a geçilemez: ürün tükenmiş ya da satışa kapanmış.
   * "Size ayrıldı" vaadi hiçbir yerde yoktur — sepet stok ayırmaz (DOMAIN §4).
   */
  blocked: boolean;
}

/**
 * Sepet ekranının tek okuma sonucu.
 *
 * Kargo satırı BURADA YOK ve bu bilinçli: kargo ücreti teslimat türüne bağlı (rota içi ücretsiz,
 * kargoda eşiğe bakılır) ve teslimat türü ADRESTEN çıkar — adres checkout'ta sorulur. Sepette
 * "Teslimat: Ücretsiz" yazıp checkout'ta 6,90 € çıkarmak, doğru olmayan bir söz vermektir.
 */
export interface CartView {
  lines: CartLine[];
  /** Kalem toplamı (cent) — kargo ve indirim HARİÇ. */
  subtotalCents: number;
  /** Toplam adet — başlıktaki sepet rozetinin sayısı. */
  itemCount: number;
  /** Çıkarılmadan devam edilemeyecek satır var mı — "Checkout'a geç" pasifleşir. */
  hasBlocked: boolean;
  /** Asgari sepet tutuyor mu (DOMAIN §6, ayardan gelir); tutmuyorsa eksik tutar. */
  minBasketOk: boolean;
  missingForMinBasketCents: number;
  /** Eşiğin kendisi — "en az 25,00 € gerekir" cümlesi bunu yazar; ekran ayarı okumaz. */
  minBasketCents: number;
}

/** Boş sepet — hiç kalem yokken ve okuma yapılamadığında aynı şekil döner. */
export const EMPTY_CART: CartView = {
  lines: [],
  subtotalCents: 0,
  itemCount: 0,
  hasBlocked: false,
  minBasketOk: false,
  missingForMinBasketCents: 0,
  minBasketCents: 0,
};
