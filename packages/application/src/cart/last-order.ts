import { OrderService, type Db } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';
import type { StorefrontImage } from '../catalog/storefront-types';
import { customerBusiness } from '../delivery/place';
import { getCartView } from './read';
import type { CartEntry } from './cart-types';

/**
 * "Aynısını sepete ekle": boş sepetin son sipariş önerisi, geçmiş siparişi bugün alınabilir kalemlere indirger. Kimlik çağırandan
 * gelir ve müşteri kimliğidir, auth kimliği değil; ziyaretçide öneri yoktur.
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
 * `customerId` ziyaretçide `null`dur ve öneri de `null` döner. Paket kapısı imzada yoktur, çünkü paket kalemleri okumanın başında
 * elenir ve sepet okumasına paket girmez.
 */
export async function readLastOrderSuggestion(
  db: Db,
  locale: PreferredLanguage,
  customerId: string | null,
): Promise<LastOrderSuggestion | null> {
  if (!customerId) return null;

  const orders = new OrderService(db);
  const [page, business] = await Promise.all([orders.listByCustomer(customerId, { limit: 1 }), customerBusiness(db, customerId)]);
  const order = page.rows[0];
  // Referansı olmayan sipariş henüz kalıcı değildir (taslak/iptal öncesi) — tekrarlanacak bir şey yok.
  if (!order?.referenceNo) return null;

  const withItems = await orders.getWithItems(order.id);
  if (!withItems || withItems.items.length === 0) return null;

  // Kalemler bugünkü görünüme sepet okumasıyla aynı yoldan çözülür (ad, görsel, satılıyor mu); paket kalemleri atlanır, paket bütün
  // olarak eklenir.
  const items = withItems.items.filter((i) => i.bundleId === null);
  if (items.length === 0) return null;

  const view = await getCartView(
    db,
    locale,
    // Parti ÇIPASI taşınmaz: o günkü teklif partisi bugün tükenmiş olabilir; tekrar sipariş
    // "aynı ürünü yeniden al" demektir, "aynı indirimi yeniden al" değil.
    items.map((i) => ({ kind: 'variant' as const, variantId: i.variantId, qty: i.qty, stockId: null })),
    // Yer verilmez, yalnız iş: tekrar sipariş yere göre daraltılmaz, sorusu "bu ürün hâlâ satılıyor mu"dur.
    { business },
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
