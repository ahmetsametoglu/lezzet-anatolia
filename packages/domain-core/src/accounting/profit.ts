import { fromCents, toCents } from '@lezzet/helper';
import type { Channel, OrderSale } from '@lezzet/types';
import { saleNetCents, type SaleVatBasis } from './export';
import { lineNetCents, type AccountingLine } from './line';

/**
 * Sipariş kârı katkı payıdır (yalnız doğrudan giderler, HT); şirket kârı genel gideri bir kez düşer, ürüne dağıtmaz.
 * Bilinmeyen maliyet 0 sayılmaz: öyle siparişler kârdan dışlanır ama sayı ve ciroyla raporda görünür.
 */

/** Siparişin doğrudan gider kalemleri — sipariş anında yazılır, mal maliyeti hazırlıkta kesinleşir. */
export interface DirectCosts {
  cogs: number;
  delivery: number;
  paymentFee: number;
  packaging: number;
}

export interface OrderContribution {
  orderId: string;
  saleDate: string;
  channel: Channel;
  /** Patron ikramı da kârda sayılır — parayı patron öder (DOMAIN §9). Yalnız export'a girmez. */
  isGiftOrder: boolean;
  /** KDV hariç ciro — kalemler + kargo. */
  revenue: number;
  costs: DirectCosts;
  /** `revenue − doğrudan giderler`. Maliyet bilinmiyorsa `null`. */
  contribution: number | null;
  /** Katkı payının ciroya oranı (%). Ciro 0 ya da maliyet eksikse `null`. */
  marginPct: number | null;
  /** Mal, teslimat ve paketleme maliyeti biliniyor mu; `false` ise kâr hesaplanmaz, ciro "fiyatlanmamış" durur. */
  costsKnown: boolean;
}

export interface VariantProfit {
  variantId: string;
  /** Satılan (teslim edilen) adet. */
  qty: number;
  /** KDV hariç kalem cirosu — kargo GİRMEZ: kargo siparişin gideridir, ürünün değil. */
  revenue: number;
  cogs: number;
  /** `revenue − cogs` — ürünün brüt marjı. */
  grossProfit: number;
  /** Dönemde bu üründen fire olan adet (imha/hasar/sayım farkı). */
  lossQty: number;
  lossCost: number;
  /** **Fire düşülmüş net marj** — "bu üründen ne kazandım" değil, "ne kaldı" (DOMAIN §12). */
  netProfit: number;
  marginPct: number | null;
}

export interface ChannelProfit {
  channel: Channel;
  orderCount: number;
  revenue: number;
  directCosts: number;
  contribution: number;
  marginPct: number | null;
}

export interface CompanyProfit {
  from: string;
  to: string;
  /** KDV hariç toplam ciro (fiyatlanmış siparişler). */
  revenue: number;
  directCosts: number;
  /** Katkı payı — genel gider DÜŞÜLMEDEN. */
  contribution: number;
  /** Fire (StockAdjustment) maliyeti — ürün kârının içinde değil, şirket seviyesinde bir kez. */
  lossCost: number;
  /** Genel gider: kira, maaş, akaryakıt, reklam… (`expense` hareketleri). */
  overhead: number;
  /** `contribution − lossCost − overhead`. */
  netProfit: number;
  orderCount: number;
  /** Maliyeti bilinmeyen siparişler — kâra girmez ama görünür, yoksa ciro farkı açıklanamazdı. */
  unpricedCount: number;
  unpricedRevenue: number;
  byChannel: ChannelProfit[];
}

/** Yüzde marj — ciro 0 ise `null`; sıfıra bölmek yerine "hesaplanamaz" demek dürüsttür. */
function marginOf(contributionCents: number, revenueCents: number): number | null {
  if (revenueCents === 0) return null;
  return Math.round((contributionCents / revenueCents) * 1000) / 10;
}

/**
 * Katkı payının istediği satış alanları; sipariş detayı henüz `order_sale`e girmemiş siparişin kârını da sorar.
 */
export type ContributionInput = SaleVatBasis &
  Pick<OrderSale, 'id' | 'saleDate' | 'isGiftOrder' | 'cogsAmountCents' | 'deliveryCostCents' | 'paymentFeeCents' | 'packagingCostCents'>;

/** Bir siparişin katkı payı; maliyetler sipariş anında yazılmış değerlerdir, sonradan değişen ayar onları oynatmaz. */
export function orderContribution(sale: ContributionInput, items: readonly AccountingLine[]): OrderContribution {
  const revenue = saleNetCents(sale, items);
  const costsKnown = sale.cogsAmountCents !== null && sale.deliveryCostCents !== null && sale.packagingCostCents !== null;

  // Toplam cent üstünden alınır; kalemleri tek tek euro'ya çevirmek yuvarlama biriktirirdi.
  const costCents =
    (sale.cogsAmountCents ?? 0) + (sale.deliveryCostCents ?? 0) + (sale.paymentFeeCents ?? 0) + (sale.packagingCostCents ?? 0);
  const costs: DirectCosts = {
    cogs: fromCents(sale.cogsAmountCents ?? 0),
    delivery: fromCents(sale.deliveryCostCents ?? 0),
    paymentFee: fromCents(sale.paymentFeeCents ?? 0),
    packaging: fromCents(sale.packagingCostCents ?? 0),
  };
  const contributionCents = revenue - costCents;

  return {
    orderId: sale.id,
    saleDate: sale.saleDate,
    channel: sale.channel,
    isGiftOrder: sale.isGiftOrder,
    revenue: fromCents(revenue),
    costs,
    contribution: costsKnown ? fromCents(contributionCents) : null,
    marginPct: costsKnown ? marginOf(contributionCents, revenue) : null,
    costsKnown,
  };
}

/** Bir varyantın dönemdeki fire kaydı — `StockAdjustmentService.lossSummary` çıktısı. */
export interface VariantLoss {
  variantId: string;
  qty: number;
  costCents: number;
}

/** Satılan kalem + o kalemin GERÇEK maliyeti (fiilen çıkan partilerin alışı, cent). */
export interface SoldLine {
  variantId: string;
  item: AccountingLine;
  /** Satışın kanalı — kalem tutarının KDV tabanı buradan belli olur (DOMAIN §5). */
  channel: Channel;
  /** `OrderItemBatch` × `Stock.purchase_price`. Parti kaydı yoksa `null` — 0 DEĞİL. */
  costCents: number | null;
  zeroRated?: boolean;
}

/**
 * Ürün kârlılığı, fire düşülmüş net marj: kargo, komisyon ve paketleme siparişin gideridir, ürüne dağıtılmaz.
 * Maliyeti bilinmeyen kalem cirosuyla birlikte dışlanır, eksiği 0 saymak marjı şişirirdi.
 */
export function variantProfit(lines: readonly SoldLine[], losses: readonly VariantLoss[] = []): VariantProfit[] {
  const byVariant = new Map<string, { qty: number; revenue: number; cogs: number }>();

  for (const line of lines) {
    if (line.costCents === null) continue;
    const current = byVariant.get(line.variantId) ?? { qty: 0, revenue: 0, cogs: 0 };
    current.qty += line.item.fulfilledQty;
    current.revenue += lineNetCents(line.item, line.channel, line.zeroRated ?? false);
    current.cogs += line.costCents;
    byVariant.set(line.variantId, current);
  }

  // Fire, satışı olmayan üründe de raporlanır: hiç satılmadan çöpe giden mal en pahalı olandır.
  for (const loss of losses) {
    if (!byVariant.has(loss.variantId)) byVariant.set(loss.variantId, { qty: 0, revenue: 0, cogs: 0 });
  }

  const lossByVariant = new Map(losses.map((l) => [l.variantId, l]));

  return [...byVariant.entries()]
    .map(([variantId, totals]) => {
      const loss = lossByVariant.get(variantId);
      const gross = totals.revenue - totals.cogs;
      const net = gross - (loss?.costCents ?? 0);
      return {
        variantId,
        qty: totals.qty,
        revenue: fromCents(totals.revenue),
        cogs: fromCents(totals.cogs),
        grossProfit: fromCents(gross),
        lossQty: loss?.qty ?? 0,
        lossCost: fromCents(loss?.costCents ?? 0),
        netProfit: fromCents(net),
        marginPct: marginOf(net, totals.revenue),
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Şirket kârlılığı: katkı paylarından fire ve genel gider birer kez düşülür. Stok alımı genel gidere girmez,
 * çünkü malın maliyeti satıldığında mal maliyeti olarak zaten düşülüyor.
 */
export function companyProfit(
  period: { from: string; to: string },
  contributions: readonly OrderContribution[],
  input: { lossCost: number; overhead: number },
): CompanyProfit {
  const priced = contributions.filter((c) => c.costsKnown);
  const unpriced = contributions.filter((c) => !c.costsKnown);

  const totalRevenueCents = priced.reduce((s, c) => s + toCents(c.revenue), 0);
  const costCents = priced.reduce(
    (s, c) => s + toCents(c.costs.cogs) + toCents(c.costs.delivery) + toCents(c.costs.paymentFee) + toCents(c.costs.packaging),
    0,
  );
  const contributionCents = totalRevenueCents - costCents;
  const lossCents = toCents(input.lossCost);
  const overheadCents = toCents(input.overhead);

  const channelTotals = new Map<Channel, { orderCount: number; revenue: number; costs: number }>();
  for (const c of priced) {
    const current = channelTotals.get(c.channel) ?? { orderCount: 0, revenue: 0, costs: 0 };
    current.orderCount += 1;
    current.revenue += toCents(c.revenue);
    current.costs += toCents(c.costs.cogs) + toCents(c.costs.delivery) + toCents(c.costs.paymentFee) + toCents(c.costs.packaging);
    channelTotals.set(c.channel, current);
  }

  return {
    from: period.from,
    to: period.to,
    revenue: fromCents(totalRevenueCents),
    directCosts: fromCents(costCents),
    contribution: fromCents(contributionCents),
    lossCost: fromCents(lossCents),
    overhead: fromCents(overheadCents),
    netProfit: fromCents(contributionCents - lossCents - overheadCents),
    orderCount: priced.length,
    unpricedCount: unpriced.length,
    unpricedRevenue: fromCents(unpriced.reduce((s, c) => s + toCents(c.revenue), 0)),
    byChannel: [...channelTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([channel, totals]) => ({
        channel,
        orderCount: totals.orderCount,
        revenue: fromCents(totals.revenue),
        directCosts: fromCents(totals.costs),
        contribution: fromCents(totals.revenue - totals.costs),
        marginPct: marginOf(totals.revenue - totals.costs, totals.revenue),
      })),
  };
}
