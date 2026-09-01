import 'server-only';
import { CategoryImageService, CategoryService, OrderService, serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import { FIXTURE_CATEGORIES } from '@/lib/storefront/fixtures';
import { toCategory } from '@lezzet/application';
import { readShowcase } from '@lezzet/application';
import { SHOWCASE_LIMIT } from '@/lib/storefront/home';
import { readSiteImage, type SitePageImage } from '@/lib/storefront/site-image';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { readPricingViewer } from '@/lib/storefront/read-viewer';
import type { StorefrontCategory, StorefrontImage, StorefrontProduct } from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';
import { getCartView } from './read';
import type { CartEntry } from './cart-types';

/**
 * Boş sepetin ÖNERİ ALANI (08.4) — tasarım: `Musteri - Sepet.dc.html` → "Bos Sepet Web/Mobil".
 *
 * Boş sepet bir hata ekranı değil, **yön verme** ekranıdır. Bu yüzden okuduğu tek şey "müşteriye
 * bugün ne önerebiliriz" sorusunun cevabıdır; ödeme diline (özet, kupon, checkout) hiç girmez.
 *
 * **Öneri alanı TEK blok değil, ÜÇ bloktan oluşur** (tasarım: son sipariş tekrarı · vitrin seçkisi ·
 * kategori girişleri). Bir süre yalnız ilk ikisinden biri çiziliyordu ve künye "bağlama göre değişen
 * TEK blok" diye yazılıydı — tasarımın "son sipariş **+** çok sevilenler" kuralı kodun o günkü
 * hâline göre yeniden ifade edilmişti. Böyle bir künye eksiği bir sonraki denetimde de görünmez
 * kılar (29.07 kullanıcı geri bildirimi).
 *
 * Dallanma sebebi geçmiş, oturum değil: son siparişi olan müşteri onu tekrarlar, olmayan (ziyaretçi
 * ya da ilk kez alan) kategori girişlerini görür. Tasarım bu iki dalı "girişli / girişsiz" diye
 * anlatıyor ama ayıran şey aslında geçmişin varlığı — ilk siparişini vermemiş girişli müşteriye
 * "son siparişinizi tekrarlayın" gösterilemez. **Vitrin seçkisi ise her iki dalda da vardır:** ne
 * sipariş geçmişine ne oturuma bağlı, katalog varsa o da vardır.
 *
 * BEKLEYEN(BACKLOG §2): B2B'nin sipariş şablonları — tasarım B2B'de vitrin seçkisi yerine şablon
 * listesi istiyor; şablon diye bir veri modeli henüz yok, müşteri tipi bu yüzden hiç okunmuyor.
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

export interface EmptyCartContext {
  lastOrder: LastOrderSuggestion | null;
  /** Son sipariş yoksa gösterilen kategori girişleri. */
  categories: StorefrontCategory[];
  /**
   * Vitrin seçkisi — anasayfanın bandıyla AYNI dörtlü (`readShowcase`). Katalog boşsa boş dizi
   * döner ve bölüm hiç çizilmez; başka türlü boş bırakılmaz.
   */
  showcase: StorefrontProduct[];
  /**
   * Boş sepet çizimi (`site_image.empty_cart`, 08.33) — operatörün yüklediği sayfa görseli.
   *
   * Bağlamın içinde çünkü aynı ekranın parçası ve **aynı turda** okunuyor: ayrı beklenseydi kahraman
   * görselsiz görünür, fotoğraf sonradan patlardı — bu dosyanın kendi künyesinin öneri için söylediği
   * şeyin aynısı. `null` = yüklenmemiş; ekran 🧺 yer tutucusunu çizmeye devam eder.
   */
  illustration: SitePageImage | null;
}

/**
 * Boş sepet bağlamı. Ziyaretçide TEK sorgu (kategoriler) çalışır — sipariş geçmişi zinciri yalnız
 * oturum varken kurulur. Sepet doluyken de okunur, çünkü sayfa boş olup olmadığını sunucuda
 * bilemez (ziyaretçinin sepeti tarayıcıda yaşar); tasarım da boş ekranın **tek adımda** gelmesini
 * istiyor — ikinci bir tura bırakılsaydı kahraman görünür, öneri sonradan patlardı.
 */
export async function getEmptyCartContext(locale: Locale): Promise<EmptyCartContext> {
  const db = serviceDb();
  const [categoryRows, lastOrder, showcase, illustration] = await Promise.all([
    new CategoryService(db).list({ activeOnly: true }),
    readLastOrder(locale),
    // Seçki her iki dalda da okunur — sipariş geçmişine bağlı değil.
    readShowcase(db, locale, await readPlaceWarehouses(), await readPricingViewer(), { limit: SHOWCASE_LIMIT }),
    readSiteImage('empty_cart', locale),
  ]);
  // Son sipariş varsa kategori girişleri hiç çizilmez; boşuna taşınmasın — havuz sorgusu da o dalda
  // hiç atılmaz (05.23).
  const shown = lastOrder ? [] : categoryRows.length ? categoryRows : FIXTURE_CATEGORIES;
  const pools = await new CategoryImageService(db).listByCategories(shown.map((c) => c.id));
  const categories = shown.map((c) => toCategory(c, locale, pools.get(c.id)));
  return { lastOrder, categories, showcase, illustration };
}

async function readLastOrder(locale: Locale): Promise<LastOrderSuggestion | null> {
  // Sipariş MÜŞTERİ kimliğine bağlıdır, auth kimliğine değil — auth kimliğiyle sorulduğunda hiçbir
  // müşterinin son siparişi bulunamıyordu ve öneri alanı sessizce hep kategorilere düşüyordu.
  const customerId = await currentCustomerId();
  if (!customerId) return null;

  const orders = new OrderService(serviceDb());
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
    locale,
    // Parti ÇIPASI taşınmaz: o günkü teklif partisi bugün tükenmiş olabilir; tekrar sipariş
    // "aynı ürünü yeniden al" demektir, "aynı indirimi yeniden al" değil.
    items.map((i) => ({ kind: 'variant' as const, variantId: i.variantId, qty: i.qty, stockId: null })),
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
    totalCents: order.orderedTotalCents,
    image: first.image,
    // Yalnız VARYANT satırları: paket kalemleri zaten yukarıda elendi, çözülmüş satırda da paket
    // olamaz — süzgeç tipi daraltmak için, sessizce bir şey düşürmek için değil.
    entries: available.flatMap((l) => (l.variantId ? [{ kind: 'variant' as const, variantId: l.variantId, qty: l.qty, stockId: null }] : [])),
    unavailable: view.lines.length - available.length,
  };
}
