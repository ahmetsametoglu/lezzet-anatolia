import { OrderService, SettingsService, WarehouseService, type Db } from '@lezzet/database';
import { canTransition, generateReferenceNo, producesReferenceNo, stockEffectOf } from '@lezzet/domain-core';
import type { OrderStatus, PaymentMethod, PreparationPick } from '@lezzet/types';
import { recordOrderPayment } from './payment';
import { readCourierRuns } from '../courier/day';
import { suggestPicksForVariant } from '../warehouse/preparation';

/**
 * Hızlı satış kapısı (ORDER_LIFECYCLE "Hızlı satış yolu"): kapı önünde mal gider, para alınır, satış kapanır; kararlar motorda, yazım
 * tek işlemde RPC'de ve iz (parti, referans, geçiş, kâr kalemleri) tam yoldakiyle aynı yere düşer. Mal ile para iki ayrı yazımdır:
 * satış stoğu düşürüp siparişi kapatır, tahsilat ardından hareket tablosuna yazılır, çünkü mal zaten gitmiştir.
 */

export type QuickSaleOutcome =
  | {
      status: 'ok';
      referenceNo: string | null;
      consumedQty: number;
      cogsAmountCents: number;
      /** Tahsilat hareketi yazıldı mı — hesap belirsizse satış kapanır ama para kayıtsız kalır. */
      paymentRecorded: boolean;
    }
  /** Kurallara aykırı — sipariş taslak değil (kapanmış siparişi kapıda yeniden satamazsın). */
  | { status: 'forbidden'; reason: 'same_status' | 'terminal' | 'not_allowed' | 'not_fast_sale_path' }
  /** Araya biri girdi: sipariş bu arada ilerletilmiş. */
  | { status: 'stale'; currentStatus: OrderStatus }
  /** Mal yok — kasiyer ekranı kalan miktarı gösterir, satış hiç yazılmaz. */
  | { status: 'insufficient_stock'; variantId: string; available: number }
  | { status: 'not_found' };

export interface QuickSaleInput {
  orderId: string;
  /** Kapıdaki satışı yapan personel. */
  actorId?: string | null;
  paymentMethod: PaymentMethod;
  /** Tahsil edilen tutar (**cent**). Verilmezse siparişin toplamı tahsil edilmiş sayılır. */
  collectedAmountCents?: number;
  /**
   * Paranın girdiği hesap (kasadaki çekmece). Verilmezse `door_cash_account_id` ayarına düşülür;
   * o da yoksa tahsilat KAYDEDİLMEZ — satış yine kapanır, para kayıtsız görünür.
   */
  paymentAccountId?: string;
  /**
   * Hangi kalemden hangi parti çıktı. Verilmezse **FEFO ile türetilir** — kapıda hazırlık ekranı
   * yoktur, önce süresi dolan çıkar (DOMAIN §4).
   */
  picks?: readonly PreparationPick[];
}

export async function quickSale(db: Db, input: QuickSaleInput): Promise<QuickSaleOutcome> {
  const orders = new OrderService(db);

  const found = await orders.getWithItems(input.orderId);
  if (!found) return { status: 'not_found' };
  const { order, items } = found;

  // 1) Kural: `completed`a geçilebilir mi ve bu geçiş hızlı satış yolu mu; `delivered → completed` de izinlidir ama o kapanıştır,
  //    stoğu burada düşürmemeli.
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
      const suggestion = await suggestPicksForVariant(db, order.warehouseId, item.variantId, item.qty);
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

  // 4) Paketleme maliyeti ayardan; kapı önünde varsayılan 0 — mal elden gidiyor, soğuk zincir paketi yok.
  const settings = new SettingsService(db);
  const packagingCents = await settings.getNumber('door_packaging_unit_cost_cents', 0);

  const result = await orders.quickSale({
    orderId: order.id,
    picks,
    actorId: input.actorId,
    referenceNo,
    paymentMethod: input.paymentMethod,
    packagingUnitCostCents: packagingCents,
  });

  if (!result.ok) {
    // Son söz RPC'nindir: öneri hazırlanırken boş olan raf, yazım anında dolmuş olabilir (ya da tersi).
    if (result.reason === 'insufficient_stock' && result.variantId) {
      return { status: 'insufficient_stock', variantId: result.variantId, available: result.available ?? 0 };
    }
    return { status: 'stale', currentStatus: result.currentStatus };
  }

  // 4b) Araçtan satış sürülen sefere bağlanır, çünkü sefer kapanışının beklediği nakit yalnız sefere bağlı siparişlerden toplanır ve
  //     bağsız satışın parası mutabakatta açıklanamayan fazla olurdu. Sürülen sefer kurye ekranının tanımıdır (`readCourierRuns`:
  //     kapanmamış ve yola çıkmış); depo kapısındaki satış sefere ait değildir ve açık sefer yoksa bağ uydurulmaz.
  if (input.actorId) {
    const warehouse = await new WarehouseService(db).getById(order.warehouseId);
    if (warehouse?.kind === 'vehicle') {
      const sefer = (await readCourierRuns(db, { courierId: input.actorId })).find((run) => run.departedAt !== null);
      if (sefer) await orders.update({ id: order.id, deliveryRunId: sefer.runId });
    }
  }

  // 5) Tahsilat ayrı bir gerçektir: para bir hesaba girer, sipariş önbelleği ondan türer. Hesap belirsizse satış yine kapanır ve
  //    tahsilat kaydedilmemiş görünür; uydurulmuş bir "ödendi"den iyidir.
  const accountId = input.paymentAccountId ?? (await settings.get<string | null>('door_cash_account_id', null));
  let paymentRecorded = false;
  if (accountId) {
    const collected = await recordOrderPayment(db, {
      orderId: order.id,
      accountId,
      amountCents: input.collectedAmountCents ?? order.orderedTotalCents,
      method: input.paymentMethod,
      description: 'Kapı önü satış',
      // Sistemin yazdığı satır: kasiyer tutarı onaylar ama deftere yazan akışın kendisidir.
      source: 'system',
    });
    paymentRecorded = collected.status === 'ok';
  }

  // Getirenin ödülü tahsilatla `finalize`te doğar, burada çağrılmaz; hesap ayarlı değilse ödül de yazılmaz, çünkü ölçüt defterdir.

  return {
    status: 'ok',
    referenceNo: result.referenceNo ?? null,
    consumedQty: result.consumedQty ?? 0,
    cogsAmountCents: result.cogsAmountCents ?? 0,
    paymentRecorded,
  };
}
