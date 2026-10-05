import { MoneyMovementService, OrderItemBatchService, OrderItemService, OrderSaleService, StockMovementService, serviceDb } from '@lezzet/database';
import {
  companyProfit, isZeroRated, orderContribution, variantProfit,
  type CompanyProfit, type OrderContribution, type SoldLine, type VariantProfit,
} from '@lezzet/domain-core';
import { fromCents } from '@lezzet/helper';
import type { OrderItem, OrderSale } from '@lezzet/types';

/**
 * Kârlılık kapısı (DOMAIN §12): karar motorun, okuma servisin, birleştiren yer burasıdır. Hediye siparişler dahildir, çünkü patron
 * ikramı gelirdir ve kasaya girer; yalnız muhasebe export'una girmez (DOMAIN §9).
 */

interface ProfitPeriod {
  from: string;
  to: string;
}

/** Dönemin satışları + kalemleri — üç raporun ortak ham girdisi, tek okumada. */
async function loadPeriod(period: ProfitPeriod): Promise<{ sales: OrderSale[]; itemsByOrder: Map<string, OrderItem[]> }> {
  const db = serviceDb();
  const sales = await new OrderSaleService(db).listPeriod(period.from, period.to);
  const items = await new OrderItemService(db).listByOrders(sales.map((s) => s.id));

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = itemsByOrder.get(item.orderId);
    if (list) list.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }
  return { sales, itemsByOrder };
}

/** Sipariş bazında katkı payı — en kârlıdan en kârsıza. Kapanmamışlar sonda (kârı yok). */
export async function orderProfits(period: ProfitPeriod): Promise<OrderContribution[]> {
  const { sales, itemsByOrder } = await loadPeriod(period);
  return sales
    .map((sale) => orderContribution(sale, itemsByOrder.get(sale.id) ?? []))
    .sort((a, b) => (b.contribution ?? -Infinity) - (a.contribution ?? -Infinity));
}

/**
 * Ürün (varyant) kârlılığı — **fire düşülmüş net marj**.
 *
 * Maliyet siparişin `cogs_amount` toplamından PAY EDİLMEZ, kalemin kendi partilerinden okunur:
 * pay etmek, ucuz partiden çıkan kalemle pahalı partiden çıkanı aynı gösterirdi.
 */
export async function productProfits(period: ProfitPeriod): Promise<VariantProfit[]> {
  const db = serviceDb();
  const { sales, itemsByOrder } = await loadPeriod(period);

  const salesById = new Map(sales.map((s) => [s.id, s]));
  const allItems = [...itemsByOrder.values()].flat();
  const costs = await new OrderItemBatchService(db).itemCosts(allItems.map((i) => i.id));

  const lines: SoldLine[] = allItems.map((item) => ({
    variantId: item.variantId,
    item,
    // Kanal kalemde değil satışta durur; KDV tabanı ondan çözülür (b2c TTC, b2b HT).
    channel: salesById.get(item.orderId)?.channel ?? 'b2c',
    // Haritada yoksa parti kaydı hiç yok demektir → maliyet bilinmiyor (0 değil).
    costCents: costs.has(item.id) ? costs.get(item.id)! : null,
    zeroRated: (() => {
      const treatment = salesById.get(item.orderId)?.vatTreatment;
      return treatment ? isZeroRated(treatment) : false;
    })(),
  }));

  // Fire yalnız imha ve sayım farkıdır: satış ve sevkin maliyeti COGS'ta, iade restokunun karşılığı `order_item_batch`te zaten düşülür;
  // iade fireye girseydi aynı iade hem COGS'u azaltır hem kârı artırırdı.
  const losses = await new StockMovementService(db).lossSummary(new Date(period.from), new Date(`${period.to}T23:59:59.999Z`));
  return variantProfit(lines, losses);
}

/**
 * Şirket P&L: katkı paylarının toplamından fire ve genel gider bir kez düşülür. Genel gider yalnız `expense` hareketleridir, stok alımı
 * (`purchase`) girmez, çünkü malın maliyeti satıldığı anda COGS olarak düşülür ve aynı para iki kez gider yazılırdı.
 */
export async function companyPnl(period: ProfitPeriod): Promise<CompanyProfit> {
  const db = serviceDb();
  const [contributions, products, totals] = await Promise.all([
    orderProfits(period),
    productProfits(period),
    new MoneyMovementService(db).periodTotals(period.from, period.to),
  ]);

  // Toplama cent'te ve tamsayıdadır, euro'ya yalnız motorun girdisi için inilir.
  const overheadCents = totals
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (t.direction === 'out' ? t.totalCents : -t.totalCents), 0);
  const lossCost = products.reduce((sum, u) => sum + u.lossCost, 0);

  return companyProfit(period, contributions, { lossCost, overhead: fromCents(overheadCents) });
}
