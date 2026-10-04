import { OrderItemService, OrderService } from '@lezzet/database';
import { bundleQtyOf } from '@lezzet/domain-core';
import type { OrderItem, PreferredLanguage } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cartGroupOf, entryOf, type CartEntry, type CartView } from '../cart/cart-types';
import { getPackagesByIds } from '../catalog/packages';
import { resolveOrderLines, type CustomerOrderLookup } from './customer-orders';

/**
 * Tekrar sipariş geçmiş siparişin kalemlerini bugünkü sepete kopyalar; niyet fiyat taşımadığı için kalemler güncel fiyatla gelir.
 * Paket kalemi pakete döner, çünkü tek tek varyant olarak eklemek paket fiyatı yerine kalem fiyatlarını ödetirdi.
 */
export interface ReorderPlan {
  /** Sepete eklenecek niyet listesi. */
  entries: readonly CartEntry[];
  /** Eklenemeyen kalemlerin adları — ekran "Tel Kadayıf (tükendi)" diye yazar. */
  skipped: readonly string[];
}

export async function planReorder(
  db: SupabaseClient,
  input: {
    customerId: string;
    locale: PreferredLanguage;
    lookup: CustomerOrderLookup;
    /** Müşterinin bugünkü yeriyle okunan sepet görünümü; yeri yüzey çözer (web çerezden, mobil sorgudan). */
    viewOf: (entries: readonly CartEntry[]) => Promise<CartView>;
  },
): Promise<ReorderPlan | null> {
  const service = new OrderService(db);
  // Numarayla gelen istekte sahiplik sorguya gömülü, kimlikle gelende eşitlikle sorulur; "yok" ile "senin değil" aynı cevabı alır.
  const order =
    'orderId' in input.lookup
      ? await service.getById(input.lookup.orderId)
      : await service.findByReference(input.lookup.reference, input.customerId);
  if (!order || order.customerId !== input.customerId) return null;

  const items = await new OrderItemService(db).listByOrder(order.id);
  const bundleItems = items.filter((i) => i.bundleId);
  const variantItems = items.filter((i) => !i.bundleId);

  const bundleIds = [...new Set(bundleItems.map((i) => i.bundleId!))];
  const bundles = await getPackagesByIds(db, bundleIds, input.locale);

  const entries: CartEntry[] = [];
  const skipped: string[] = [];

  for (const bundleId of bundleIds) {
    const bundle = bundles.find((b) => b.id === bundleId);
    const own = bundleItems.filter((i) => i.bundleId === bundleId);
    if (!bundle) {
      // Paket satıştan kalkmış: kalemleri tek tek eklemek paket fiyatı yerine kalem fiyatı ödetirdi; adı bilinmediği için kalemler sayılır.
      skipped.push(...(await namesOf(db, own, input.locale)));
      continue;
    }
    entries.push({ kind: 'bundle', bundleId, qty: bundleQtyOf(bundle.items, own) });
  }

  for (const item of variantItems) {
    // Parti taşınmaz: o günkü teklif partisi bugün tükenmiş olabilir, yeni sepet bugünkü fiyatı normal yoldan çözer.
    entries.push({ kind: 'variant', variantId: item.variantId, qty: item.qty, stockId: null });
  }

  /* Tükenen, satışa kapanan ve bu yere gelemeyen kalem eklenmez, çünkü yer biliniyorken gelemeyen kalem hiçbir kanaldan sepete
     girmez. */
  const view = await input.viewOf(entries);
  const unaddable = (line: CartView['lines'][number]) => line.blocked || cartGroupOf(line) === 'undeliverable';
  skipped.push(...view.lines.filter(unaddable).map((line) => line.name));

  return { entries: view.lines.filter((line) => !unaddable(line)).map(entryOf), skipped };
}

async function namesOf(db: SupabaseClient, items: readonly OrderItem[], locale: PreferredLanguage): Promise<string[]> {
  const lines = await resolveOrderLines(db, items, locale);
  return items.map((i) => lines.get(i.variantId)?.name).filter((n): n is string => Boolean(n));
}
