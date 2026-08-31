import { OrderService, SettingsService, serviceDb } from '@lezzet/database';
import { listCourierDay } from '@/lib/courier/day';
import { readVariantTitles } from '@/lib/order/line-titles';
import type { DeliveryStopView } from './delivery-types';

/**
 * Kapıdaki durağın okuması (11.2/11.3).
 *
 * **Sahiplik gün listesinden doğar, adresteki kimlikten değil.** Durak önce kuryenin KENDİ gününde
 * aranıyor; listede yoksa okuma daha başlamadan `null` dönüyor. Sipariş kimliğiyle doğrudan okumak
 * daha kısa olurdu ama bir kurye başkasının durağını adrese yazarak açabilirdi — sınırı sorgunun
 * kendisine gömmek, kontrolü hatırlamaya bağlı olmaktan çıkarır (`day.ts` künyesiyle aynı gerekçe).
 *
 * Yan faydası: rota sırası da buradan geliyor, ikinci bir sayma yok.
 */
export async function readDeliveryStop(input: { courierId: string; orderId: string }): Promise<DeliveryStopView | null> {
  const db = serviceDb();

  const stops = await listCourierDay({ courierId: input.courierId });
  const index = stops.findIndex((candidate) => candidate.orderId === input.orderId);
  if (index < 0) return null;
  const stop = stops[index]!;

  const found = await new OrderService(db).getWithItems(input.orderId);
  if (!found) return null;
  const { order, items } = found;

  const settings = new SettingsService(db);
  // Fabrika değerleri kapının (`lib/courier/delivery`) ve migration'ın taşıdığının AYNISI. Bilinçli
  // kopya: buradaki okuma neyin GÖSTERİLECEĞİNE karar veriyor, neye izin verileceğine değil — izin
  // kararı tek yerde, kapıda. Ayrışırlarsa ekran yanlış yazı gösterir, yanlış iş yapmaz.
  const [titles, proofScope, cashLimitCents, doorAccountId] = await Promise.all([
    readVariantTitles(db, items.map((item) => item.variantId)),
    settings.get<Record<string, boolean>>('delivery_proof_required', { b2b: true, b2c: false }),
    settings.getNumber('cash_legal_limit_cents', 100_000),
    settings.get<string | null>('door_cash_account_id', null),
  ]);

  return {
    stop,
    // Sıra sunucunun hesabından; `findIndex` yalnız SAHİPLİK kapısı olarak yukarıda kaldı (11.9).
    sequence: stop.stopSeq,
    referenceNo: order.referenceNo,
    order: { shippingFeeCents: order.shippingFeeCents, status: order.status, totalCents: order.totalCents },
    amounts: { collectedCents: order.amountCollectedCents, refundedCents: order.amountRefundedCents },
    lines: items.map((item) => ({
      id: item.id,
      qty: item.qty,
      fulfilledQty: item.fulfilledQty,
      unitPriceCents: item.unitPriceCents,
      lineDiscountAmountCents: item.lineDiscountAmountCents,
      title: titles.get(item.variantId) ?? 'Silinmiş boy',
    })),
    proofRequired: proofScope?.[order.channel] === true,
    cashLimitCents,
    doorAccountId,
  };
}
