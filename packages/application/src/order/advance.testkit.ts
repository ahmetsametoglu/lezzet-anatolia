import { OrderService } from '@lezzet/database';
import { canTransition } from '@lezzet/domain-core';
import type { OrderStatus } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Test fikstürü: siparişi durum durum ilerletir.** Üretim kodu DEĞİL — yalnız bu paketin
 * entegrasyon testleri çağırır (dosya adı `.test.ts` olmadığı için vitest onu test olarak da
 * toplamaz).
 *
 * ── NEDEN `transitionOrder`IN KOPYASI DEĞİL ──────────────────────────────────
 * Web testleri fikstürü `apps/web/lib/order/transition.ts` ile kuruyordu; o kapı geçişin yanında
 * müşteri haberi ve sadakat puanı da tetikliyor (modül 14 ve 17). Terfide o iki etki PORT oldu
 * (`effects.ts`) ve fikstürün ikisine de ihtiyacı yok: sınanan şey kurye kapıları, geçişin haber
 * tarafı değil. Kapının kendisini buraya kopyalamak, terfi etmemiş bir orkestrasyonun ikinci
 * uygulamasını yazmak olurdu — tüzüğün yasakladığı şeyin ta kendisi.
 *
 * Motor yine SORULUR (`canTransition`): fikstür yanlış bir geçişi sessizce yazarsa test, olmayan
 * bir durumdan doğru cevap alır ve yeşil yalan söyler.
 */
export async function advanceOrder(db: SupabaseClient, orderId: string, path: readonly OrderStatus[]): Promise<void> {
  const orders = new OrderService(db);

  for (const to of path) {
    const order = await orders.getById(orderId);
    if (!order) throw new Error(`advanceOrder: sipariş yok (${orderId})`);

    const verdict = canTransition(order.status, to);
    if (!verdict.allowed) throw new Error(`advanceOrder: ${order.status} → ${to} izinli değil (${verdict.reason})`);

    const result = await orders.transition({ orderId, from: order.status, to });
    if (!result.ok) throw new Error(`advanceOrder: ${order.status} → ${to} yazılamadı (şu an ${result.currentStatus})`);
  }
}
