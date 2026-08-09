import { OrderService, type Db } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';
import type { StorefrontImage } from '../catalog/storefront-types';
import { getCartView } from './read';
import type { CartEntry } from './cart-types';

/**
 * **"Aynısını sepete ekle"** — boş sepetin son sipariş önerisi (08.4 · TERFİ aşama 1/3).
 *
 * Kaynağı `apps/web/lib/cart/empty-cart.ts`in `readLastOrder` yarısıydı; web kopyası KÖPRÜ.
 *
 * ── NEDEN YALNIZ BU YARISI TAŞINDI ───────────────────────────────────────────
 * `getEmptyCartContext` üç blok birleştiriyor: son sipariş · vitrin seçkisi · kategori girişleri
 * (+ sayfa görseli). Son ikisi web SAYFASININ kompozisyonu ve okudukları kapılar
 * (`storefront/home.readShowcase`, `storefront/site-image`, `storefront/fixtures`) henüz terfi
 * etmedi — onları buraya taşımak, terfi etmemiş üç okumayı kapı parametresine çevirip sepeti
 * onların şekline bağlamak olurdu. Taşınan şey KURAL: "geçmişteki siparişi bugün alınabilir
 * kalemlere indirge". Mobil boş sepetin de aynı öneriyi göstermesi bekleniyor.
 *
 * ── KİMLİK ÇAĞIRANDAN GELİR ──────────────────────────────────────────────────
 * Web nüshası `currentCustomerId()` ile oturumu okuyordu; kapı taşıma bilmez. Kimlik yoksa öneri
 * de yoktur (ziyaretçinin geçmişi yok) — çağıran `null` geçer.
 *
 * Sipariş MÜŞTERİ kimliğine bağlıdır, auth kimliğine değil: auth kimliğiyle sorulduğunda hiçbir
 * müşterinin son siparişi bulunamıyordu ve öneri alanı sessizce hep kategorilere düşüyordu.
 */

/** Meta satırında kaç ürün adı yazılır — fazlası satırı sarar ve okunmaz olur. */
const NAME_LIMIT = 3;

/** Boş sepette gösterilen son sipariş — "Aynısını sepete ekle"nin kaynağı. */
export interface LastOrderSuggestion {
  /** Sistemin ürettiği referans (LA-26-7K4M2P); yoksa sipariş önerilmez. */
  reference: string;
  /** ISO; biçimlendirme ekranda yapılır (dil oraya ait). */
  placedAt: string;
  /** İlk `NAME_LIMIT` ürün adı — meta satırı için. */
  names: string[];
  /** Toplam kalem sayısı (adı yazılmayanlar dahil). */
  itemCount: number;
  /** Siparişin O GÜNKÜ toplamı — bugünkü fiyat değil; tanınma işareti olarak durur. */
  totalCents: number;
  image: StorefrontImage;
  /**
   * Bugün eklenebilecek kalemler — tükenmiş/satıştan kalkmış olanlar ZATEN düşülmüştür.
   * Fiyat taşımaz: sepete giren niyettir, fiyatı sunucu çözer (DOMAIN §5).
   */
  entries: CartEntry[];
  /** Düşülen kalem sayısı — "N kalem şu an mevcut değil, eklenmedi" cümlesini bu besler. */
  unavailable: number;
}

/**
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`).
 * @param customerId müşteri kimliği; ziyaretçide `null` (öneri de `null` döner).
 *
 * Paket kapısı (`CartBundlePort`) imzada YOK: paket kalemleri okumanın ilk satırında zaten eleniyor
 * (paket bütün olarak eklenir), yani sepet okumasına hiç paket girmiyor.
 */
export async function readLastOrderSuggestion(
  db: Db,
  locale: PreferredLanguage,
  customerId: string | null,
): Promise<LastOrderSuggestion | null> {
  if (!customerId) return null;

  const orders = new OrderService(db);
  const page = await orders.listByCustomer(customerId, { limit: 1 });
  const order = page.rows[0];
  // Referansı olmayan sipariş henüz kalıcı değildir (taslak/iptal öncesi) — tekrarlanacak bir şey yok.
  if (!order?.referenceNo) return null;

  const withItems = await orders.getWithItems(order.id);
  if (!withItems || withItems.items.length === 0) return null;

  // Kalemleri BUGÜNKÜ görünüme çözdürüyoruz — ad, görsel ve "hâlâ satılıyor mu" bilgisi oradan gelir.
  // Sepet okumasının aynısı; ikinci bir çözümleyici yazmak iki yerde ayrışabilen kural demekti.
  // Paket kalemleri (bundleId dolu) atlanır: paket bütün olarak eklenir, kalem kalem değil (05.5).
  const items = withItems.items.filter((i) => i.bundleId === null);
  if (items.length === 0) return null;

  const view = await getCartView(
    db,
    locale,
    // Parti ÇIPASI taşınmaz: o günkü teklif partisi bugün tükenmiş olabilir; tekrar sipariş
    // "aynı ürünü yeniden al" demektir, "aynı indirimi yeniden al" değil.
    items.map((i) => ({ kind: 'variant' as const, variantId: i.variantId, qty: i.qty, stockId: null })),
    // Yer BİLEREK boş: tekrar sipariş yere göre DARALTILMAZ — sorusu "senin deponda var mı" değil,
    // "bu ürün hâlâ satılıyor mu" (C3, `read.ts` künyesi).
  );

  const available = view.lines.filter((l) => !l.blocked);
  const first = available[0];
  // Tek kalemi bile bugün alınamıyorsa öneri YOK: "aynısını ekle" düğmesi hiçbir şey eklemez.
  if (!first) return null;

  return {
    reference: order.referenceNo,
    placedAt: order.createdAt,
    names: available.slice(0, NAME_LIMIT).map((l) => l.name),
    itemCount: available.length,
    totalCents: order.totalCents,
    image: first.image,
    // Yalnız VARYANT satırları: paket kalemleri zaten yukarıda elendi, çözülmüş satırda da paket
    // olamaz — süzgeç tipi daraltmak için, sessizce bir şey düşürmek için değil.
    entries: available.flatMap((l) => (l.variantId ? [{ kind: 'variant' as const, variantId: l.variantId, qty: l.qty, stockId: null }] : [])),
    unavailable: view.lines.length - available.length,
  };
}
