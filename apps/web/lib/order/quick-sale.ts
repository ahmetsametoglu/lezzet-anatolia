import { OrderService, SettingsService, serviceDb } from '@lezzet/database';
import {
  canTransition,
  derivePaymentStatus,
  generateReferenceNo,
  producesReferenceNo,
  stockEffectOf,
} from '@lezzet/domain-core';
import type { OrderStatus, PaymentMethod, PreparationPick } from '@lezzet/types';
import { suggestPicksForVariant } from '../stock/fefo';

/**
 * Hızlı satış kapısı (07.10) — **uygulama katmanı orkestrasyonu**. ORDER_LIFECYCLE "Hızlı satış yolu".
 *
 * Kapı önünde tek bir an vardır: mal gider, para alınır, satış kapanır. Tam yolun yedi adımı burada
 * bir adımdır — ama hiçbir **iz** atlanmaz: parti kaydı, referans, geçiş logu ve kâr kalemleri
 * tam yoldakiyle aynı yerlere yazılır.
 *
 * Kararların hepsi motorda: geçiş izinli mi (`status-machine`), bu yol gerçekten hızlı satış mı
 * (`stockEffectOf → consume_direct`), referans üretilir mi, ödeme durumu ne (`derivePaymentStatus`).
 * Bu dosya onları gerçek girdilere bağlar; yazımı tek transaction'da RPC yapar.
 */

type QuickSaleOutcome =
  | { status: 'ok'; referenceNo: string | null; consumedQty: number; cogsAmount: number }
  /** Kurallara aykırı — sipariş taslak değil (kapanmış siparişi kapıda yeniden satamazsın). */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'not_fast_sale_path' }
  /** Araya biri girdi: sipariş bu arada ilerletilmiş. */
  | { status: 'stale'; currentStatus: OrderStatus }
  /** Mal yok — kasiyer ekranı kalan miktarı gösterir, satış hiç yazılmaz. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  | { status: 'not_found' };

interface QuickSaleInput {
  orderId: string;
  /** Kapıdaki satışı yapan personel. */
  actorId?: string | null;
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (euro). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmount?: number;
  /**
   * Hangi kalemden hangi parti çıktı. Verilmezse **FEFO ile türetilir** — kapıda hazırlık ekranı
   * yoktur, önce süresi dolan çıkar (DOMAIN §4).
   */
  picks?: readonly PreparationPick[];
}

export async function quickSale(input: QuickSaleInput): Promise<QuickSaleOutcome> {
  const db = serviceDb();
  const orders = new OrderService(db);

  const found = await orders.getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;

  // 1) Kural: `completed`'a geçilebilir mi, ve bu geçiş HIZLI SATIŞ yolu mu? İkincisi önemlidir:
  //    `delivered → completed` de izinlidir ama o kapanıştır (07.7), stoğu burada düşürmemeli.
  const verdict = canTransition(order.status, 'completed');
  if (!verdict.allowed) return { status: 'forbidden', reason: verdict.reason };
  if (stockEffectOf(order.status, 'completed') !== 'consume_direct') {
    return { status: 'forbidden', reason: 'not_fast_sale_path' };
  }

  // 2) Partiler: verilmediyse FEFO önerisi. Yetmiyorsa satış hiç başlamaz.
  let picks: PreparationPick[];
  if (input.picks) {
    picks = input.picks.map((pick) => ({ ...pick, batches: [...pick.batches] }));
  } else {
    picks = [];
    for (const item of items) {
      const suggestion = await suggestPicksForVariant(item.variantId, item.qty);
      if (suggestion.shortfall > 0) {
        return {
          status: 'insufficient_stock',
          variantId: item.variantId,
          available: item.qty - suggestion.shortfall,
        };
      }
      picks.push({ orderItemId: item.id, batches: suggestion.picks.map((p) => ({ stockId: p.stockId, qty: p.qty })) });
    }
  }

  // 3) Referans: hızlı satışta ilk kalıcı durum `completed`'dır — numara burada doğar.
  const referenceNo =
    !order.referenceNo && producesReferenceNo(order.status, 'completed')
      ? generateReferenceNo({ year: new Date(order.createdAt).getFullYear() })
      : null;

  // 4) Ödeme durumu TÜRETİLİR (DOMAIN §7): tahsilat, gerçekten giden malın tutarıyla karşılaştırılır.
  //    Kapıda eksik verilirse (bir kalem çıkmadı) tahsilat tam olsa bile durum kendiliğinden doğru olur.
  const collectedAmount = input.collectedAmount ?? order.total;
  const verilen = new Map(picks.map((p) => [p.orderItemId, p.batches.reduce((s, b) => s + b.qty, 0)]));
  const payment = derivePaymentStatus({
    lines: items.map((item) => ({
      fulfilledQty: verilen.get(item.id) ?? 0,
      orderedQty: item.qty,
      unitPriceCents: Math.round(item.unitPrice * 100),
      lineDiscountCents: Math.round(item.lineDiscountAmount * 100),
    })),
    collectedCents: Math.round(collectedAmount * 100),
    refundedCents: Math.round(order.amountRefunded * 100),
    shippingFeeCents: Math.round(order.shippingFee * 100),
  });

  // 5) Paketleme maliyeti ayardan; kapı önünde varsayılan 0 — mal elden gidiyor, soğuk zincir paketi yok.
  const packagingCents = await new SettingsService(db).getNumber('door_packaging_unit_cost_cents', 0);

  const result = await orders.quickSale({
    orderId: order.id,
    picks,
    actorId: input.actorId,
    referenceNo,
    paymentMethod: input.paymentMethod,
    amountCollected: collectedAmount,
    paymentStatus: payment.status,
    // Ayarlar cent'te tutulur (STACK §8); sipariş tablosundaki para kolonları euro numeric.
    packagingUnitCost: packagingCents / 100,
  });

  if (!result.ok) {
    // Son söz RPC'nindir: öneri hazırlanırken boş olan raf, yazım anında dolmuş olabilir (ya da tersi).
    if (result.reason === 'insufficient_stock' && result.variantId) {
      return { status: 'insufficient_stock', variantId: result.variantId, available: result.available ?? 0 };
    }
    return { status: 'stale', currentStatus: result.currentStatus };
  }

  return {
    status: 'ok',
    referenceNo: result.referenceNo ?? null,
    consumedQty: result.consumedQty ?? 0,
    cogsAmount: result.cogsAmount ?? 0,
  };
}
