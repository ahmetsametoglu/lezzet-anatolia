import { MoneyMovementService, OrderItemService, OrderSaleService, OrderService, StockAdjustmentService, serviceDb } from '@lezzet/database';
import {
  companyProfit, orderContribution, variantProfit,
  type CompanyProfit, type OrderContribution, type SoldLine, type VariantProfit,
} from '@lezzet/domain-core';
import type { OrderItem, OrderSale } from '@lezzet/types';

/**
 * Kârlılık kapısı (12.6) — DOMAIN §12. Karar motorun, okuma servisin; birleştiren yer burası.
 *
 * **Hediye siparişler dahildir.** Patron ikramı gelirdir, kârdır, kasaya girer — parayı patron
 * öder; yalnız muhasebe export'una girmez (DOMAIN §9).
 */

interface ProfitPeriod {
  from: string;
  to: string;
}

/** Dönemin satışları + kalemleri — üç raporun ortak ham girdisi, tek okumada. */
async function donem(period: ProfitPeriod): Promise<{ sales: OrderSale[]; itemsByOrder: Map<string, OrderItem[]> }> {
  const db = serviceDb();
  const sales = await new OrderSaleService(db).listPeriod(period.from, period.to);
  const items = await new OrderItemService(db).listByOrders(sales.map((s) => s.id));

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const liste = itemsByOrder.get(item.orderId);
    if (liste) liste.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }
  return { sales, itemsByOrder };
}

/** Sipariş bazında katkı payı — en kârlıdan en kârsıza. Kapanmamışlar sonda (kârı yok). */
export async function orderProfits(period: ProfitPeriod): Promise<OrderContribution[]> {
  const { sales, itemsByOrder } = await donem(period);
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
  const { sales, itemsByOrder } = await donem(period);

  const satisById = new Map(sales.map((s) => [s.id, s]));
  const tumKalemler = [...itemsByOrder.values()].flat();
  const maliyetler = await new OrderService(db).itemCosts(tumKalemler.map((i) => i.id));

  const lines: SoldLine[] = tumKalemler.map((item) => ({
    variantId: item.variantId,
    item,
    // Haritada yoksa parti kaydı hiç yok demektir → maliyet bilinmiyor (0 değil).
    costCents: maliyetler.has(item.id) ? maliyetler.get(item.id)! : null,
    zeroRated: satisById.get(item.orderId)?.vatTreatment === 'intra_eu_b2b_reverse_charge',
  }));

  const fire = await new StockAdjustmentService(db).lossSummary(new Date(period.from), new Date(`${period.to}T23:59:59.999Z`));
  return variantProfit(lines, fire);
}

/**
 * Şirket P&L — katkı paylarının toplamından fire ve genel gider bir kez düşülür.
 *
 * **Genel gider yalnız `expense` hareketleridir.** Stok alımı (`purchase`) buraya GİRMEZ: malın
 * maliyeti satıldığı anda COGS olarak düşülüyor. İkisini de saysaydık aynı parayı iki kez gider
 * yazardık — ve depoda bekleyen mal, daha satılmadan şirketi zarara sokmuş görünürdü.
 */
export async function companyPnl(period: ProfitPeriod): Promise<CompanyProfit> {
  const db = serviceDb();
  const [katkilar, urunler, hareketler] = await Promise.all([
    orderProfits(period),
    productProfits(period),
    new MoneyMovementService(db).periodTotals(period.from, period.to),
  ]);

  const overhead = hareketler
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + (t.direction === 'out' ? t.total : -t.total), 0);
  const lossCost = urunler.reduce((sum, u) => sum + u.lossCost, 0);

  return companyProfit(period, katkilar, { lossCost, overhead: Math.round(overhead * 100) / 100 });
}
