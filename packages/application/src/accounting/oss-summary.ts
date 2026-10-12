import { OrderItemService, OrderSaleService, type Db } from '@lezzet/database';
import { DISTANCE_SALE_TREATMENTS, ossSummary, type OssSummary } from '@lezzet/domain-core';
import { groupBy } from '@lezzet/helper';

/**
 * Dönemin OSS özeti (çeyrek × varış ülkesi × oran) ve eşikten önce Fransız KDV'siyle yazılan uzaktan satışların toplamı. Dönem satış
 * günüyle seçilir ve iki uç dahildir; satırlar muhasebe aktarımının okuduğu satışlardan türer.
 */
export async function readOssSummary(db: Db, period: { from: string; to: string }): Promise<OssSummary> {
  const sales = await new OrderSaleService(db).listPeriodByTreatments(period.from, period.to, DISTANCE_SALE_TREATMENTS);
  const itemsByOrder = groupBy(await new OrderItemService(db).listByOrders(sales.map((sale) => sale.id)), (item) => item.orderId);
  return ossSummary(sales.map((sale) => ({ sale, items: itemsByOrder.get(sale.id) ?? [] })));
}
