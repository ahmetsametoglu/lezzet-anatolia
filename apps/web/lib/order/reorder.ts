import 'server-only';
import { OrderService, serviceDb } from '@lezzet/database';
import { bundleQtyOf } from '@lezzet/domain-core';
import type { OrderItem } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { getCartView } from '@/lib/cart/read';
import { readPlaceScope } from '@/lib/delivery/read-place';
import { getPackagesByIds } from '@/lib/storefront/packages';
import { cartGroupOf, entryOf, type CartEntry } from '@/lib/cart/cart-types';
import { resolveOrderLines } from './customer-lines';

/**
 * Tekrar sipariş geçmiş bir siparişin kalemlerini bugünkü sepete kopyalar; `CartEntry` fiyat taşımadığı için kalemler güncel fiyatla
 * gelir. Paket kalemi pakete geri döner, çünkü tek tek varyant olarak eklemek paket fiyatı yerine kalem fiyatlarını ödetirdi.
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

  /* Hangi satırın eklenebileceğini müşterinin bugünkü yeriyle okunan sepet söyler: tükenen, satışa kapanan ve bu adrese gelemeyen kalem
     eklenmez, çünkü yer biliniyorken gelemeyen kalem hiçbir kanaldan sepete girmez. */
  const view = await getCartView(locale, entries, await readPlaceScope());
  const unaddable = (line: (typeof view.lines)[number]) => line.blocked || cartGroupOf(line) === 'undeliverable';
  const addable = view.lines.filter((line) => !unaddable(line));
  skipped.push(...view.lines.filter(unaddable).map((line) => line.name));

  return { entries: addable.map(entryOf), skipped };
}

async function namesOf(db: ReturnType<typeof serviceDb>, items: readonly OrderItem[], locale: Locale): Promise<string[]> {
  const lines = await resolveOrderLines(db, items, locale);
  return items.map((i) => lines.get(i.variantId)?.name).filter((n): n is string => Boolean(n));
}

/** Görünümden niyete geri — sepete yazılan şey niyettir, görünüm değil. */