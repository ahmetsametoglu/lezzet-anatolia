import { OrderService, ReservationService } from '@lezzet/database';
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

/**
 * **Sipariş aç → ayır → hazırla → `ready`.** İki entegrasyon testinin ORTAK kurulumu (25.08).
 *
 * `refund.test.ts` bu adımları kendi `prepare`'ında taşıyordu; ödül geri alma testi (17.11) aynı
 * beş adıma ihtiyaç duyunca ikinci nüsha yazmak yerine buraya alındı (CLAUDE §1). Nüsha yazılsaydı
 * biri gün gelip `recordPreparation`ı atlar ve iki testten biri hiç hazırlanmamış bir sipariş
 * üzerinde "kısmi karşılama" sınardı — yeşil kalır, ölçtüğü şey başka olurdu.
 *
 * Durum `ready`de BIRAKILIR: sonrası çağıranın kararı (kimi test yola çıkarır, kimi iptal eder).
 * Tutarlar cent (STACK §8) ve varsayılan YOK — fikstürün sayısı testin iddiasının parçasıdır,
 * gizli bir varsayılan onu sessizce değiştirebilirdi.
 */
export async function prepareOrderToReady(
  db: SupabaseClient,
  input: {
    warehouseId: string;
    customerId: string;
    variantId: string;
    /** Hazırlıkta düşülecek parti — çağıran kendi partisini kurar (depo değişmez, DOMAIN §17). */
    stockId: string;
    qty: number;
    unitPriceCents: number;
    shippingFeeCents?: number;
    lineDiscountAmountCents?: number;
  },
): Promise<{ orderId: string; itemId: string }> {
  const orders = new OrderService(db);
  const indirim = input.lineDiscountAmountCents ?? 0;

  const { order, items } = await orders.create(
    {
      warehouseId: input.warehouseId,
      customerId: input.customerId,
      channel: 'b2c',
      deliveryType: 'route',
      shippingFeeCents: input.shippingFeeCents ?? 0,
      // Başlıktaki indirim kalem paylarının toplamıdır ve bunu veritabanı zorluyor (0041) —
      // tek kalemli fikstürde ikisi aynı sayı.
      discountAmountCents: indirim,
    },
    [{ variantId: input.variantId, qty: input.qty, unitPriceCents: input.unitPriceCents, vatRate: 5.5, lineDiscountAmountCents: indirim }],
  );

  await new ReservationService(db).reserve({
    orderId: order.id,
    warehouseId: input.warehouseId,
    variantId: input.variantId,
    qty: input.qty,
  });
  await advanceOrder(db, order.id, ['confirmed', 'preparing']);
  await orders.recordPreparation(order.id, [{ orderItemId: items[0]!.id, batches: [{ stockId: input.stockId, qty: input.qty }] }]);
  await advanceOrder(db, order.id, ['ready']);

  return { orderId: order.id, itemId: items[0]!.id };
}
