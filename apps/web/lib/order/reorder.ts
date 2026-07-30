import 'server-only';
import { OrderService, serviceDb } from '@lezzet/database';
import type { OrderItem } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import { getPackagesByIds } from '@/lib/storefront/packages';
import type { CartEntry } from '@/lib/cart/cart-types';
import { resolveOrderLines } from './customer-lines';

/**
 * **Tekrar sipariş** (08.5) — geçmiş bir siparişin kalemlerini bugünkü sepete kopyalar.
 *
 * Tasarımın kuralı: *"kalemler GÜNCEL fiyatlarla kopyalanır; fiyat farkı sepette zaten görünür,
 * ayrı uyarı yok."* Bu kural burada ekstra bir iş gerektirmiyor ve sebebi mimari: `CartEntry`
 * **fiyat taşımaz** (yalnız niyet: varyant + adet). Fiyatı sepet her okumada yeniden çözer. Yani
 * "eski fiyatı taşıma" hatası bu tasarımda yapılamaz — yapacak alan yok.
 *
 * **Satılabilirlik burada yeniden HESAPLANMAZ:** niyet listesi `getCartView`'a verilir ve o zaten
 * her satıra `blocked` yazıyor (tükendi / satışa kapalı). İkinci bir "satılabilir mi" kuralı
 * yazsaydık, sepetin gösterdiğiyle tekrar siparişin kabul ettiği bir gün ayrışırdı.
 *
 * **Paket kalemi pakete geri döner.** Sipariş anında paket kalemlerine açılır (`bundle_id` ile
 * işaretli); tek tek varyant olarak eklersek müşteri paket fiyatı yerine kalem fiyatlarını öder —
 * yani sessizce zam. Adet oranından geri hesaplanır: paket 2 adet A içeriyorsa ve siparişte 6 A
 * varsa, 3 paket alınmıştır. Paket artık satılmıyorsa `getPackagesByIds` onu zaten döndürmez ve
 * kalemler "eklenemedi" olarak sayılır.
 */
interface ReorderPlan {
  /** Sepete eklenecek niyet listesi. */
  entries: readonly CartEntry[];
  /** Eklenemeyen kalemlerin adları — ekran "Tel Kadayıf (tükendi)" diye yazar. */
  skipped: readonly string[];
}

export async function planReorder(locale: Locale, customerId: string, orderId: string): Promise<ReorderPlan | null> {
  const db = serviceDb();
  const found = await new OrderService(db).getWithItems(orderId);
  // Başkasının siparişi tekrar edilemez — sahiplik sunucuda doğrulanır, kimlik istemciden gelmez.
  if (!found || found.order.customerId !== customerId) return null;

  const { items } = found;
  const bundleItems = items.filter((i) => i.bundleId);
  const variantItems = items.filter((i) => !i.bundleId);

  const bundleIds = [...new Set(bundleItems.map((i) => i.bundleId!))];
  const bundles = await getPackagesByIds(bundleIds, locale);

  const entries: CartEntry[] = [];
  const skipped: string[] = [];

  for (const bundleId of bundleIds) {
    const bundle = bundles.find((b) => b.id === bundleId);
    const own = bundleItems.filter((i) => i.bundleId === bundleId);
    if (!bundle) {
      // Paket satıştan kalkmış: kalemleri tek tek eklemiyoruz (paket fiyatı yerine kalem fiyatı
      // ödetmek olurdu). Adı bilinmediği için kalem adları sayılır.
      skipped.push(...(await namesOf(db, own, locale)));
      continue;
    }
    entries.push({ kind: 'bundle', bundleId, qty: bundleQtyOf(bundle.items, own) });
  }

  for (const item of variantItems) {
    // Çıpa TAŞINMAZ: `stockId` o günkü teklif partisiydi, bugün tükenmiş olabilir. Yeni sepet
    // bugünkü fiyatı normal yoldan çözer.
    entries.push({ kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: null });
  }

  // Tek otorite sepet okuması: hangi satır eklenebilir, onu o söyler.
  const view = await getCartView(locale, entries, {});
  const addable = view.lines.filter((line) => !line.blocked);
  skipped.push(...view.lines.filter((line) => line.blocked).map((line) => line.name));

  return { entries: addable.map(toEntry), skipped };
}

/** Paket kaç adet alınmış — kalem adedinin paket içeriğindeki adede oranı. */
function bundleQtyOf(contents: readonly { variantId: string; qty: number }[], items: readonly OrderItem[]): number {
  for (const item of items) {
    const inBundle = contents.find((c) => c.variantId === item.variantId);
    // Oran bozuksa (paket içeriği o günden beri değişmiş) 1'e düşeriz: fazla eklemektense az
    // eklemek, müşterinin sepette fark edip artırabileceği bir hatadır.
    if (inBundle && inBundle.qty > 0 && item.qty % inBundle.qty === 0) return item.qty / inBundle.qty;
  }
  return 1;
}

async function namesOf(db: ReturnType<typeof serviceDb>, items: readonly OrderItem[], locale: Locale): Promise<string[]> {
  const lines = await resolveOrderLines(db, items, locale);
  return items.map((i) => lines.get(i.variantId)?.name).filter((n): n is string => Boolean(n));
}

/** Görünümden niyete geri — sepete yazılan şey niyettir, görünüm değil. */
function toEntry(line: { kind: 'variant' | 'bundle'; variantId?: string; bundleId?: string; qty: number; stockId?: string | null }): CartEntry {
  return line.kind === 'bundle'
    ? { kind: 'bundle', bundleId: line.bundleId!, qty: line.qty }
    : { kind: 'variant', variantId: line.variantId!, qty: line.qty, stockId: line.stockId ?? null };
}
