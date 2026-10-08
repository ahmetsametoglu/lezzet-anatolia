import { addVat, removeVat } from '@lezzet/helper';
import type { Order, OrderItem } from '@lezzet/types';
import { chargedQtyOf, fulfilledLineAmountCents, fulfilledLineOf, type FulfilledItem } from '../payment/payment-status';
import { addedVatOf, grossTotalCents, type RateVat } from '../pricing/vat-base';
import { isZeroRated } from '../tax/vat-treatment';

/**
 * Sipariş kaleminin para hesabı, muhasebe export'u ile kârlılığın ortak zemini. Tutar siparişin fiyat tabanındadır
 * (`pricesIncludeVat`) ve kâr her zaman HT üstünden hesaplanır, çünkü KDV ciro değildir.
 */

export type AccountingLine = Pick<
  OrderItem,
  'qty' | 'fulfilledQty' | 'goodwillQty' | 'unitPriceCents' | 'lineDiscountAmountCents' | 'vatRate'
>;

/** `lineAmountCents`in gerçekten istediği alanlar. */
export type LineAmountInput = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'unitPriceCents' | 'lineDiscountAmountCents'>;

/**
 * Kalemin teslim edilen adet üzerinden tutarı (siparişin fiyat tabanında, cent); kapıda reddedilen kalemin payı bununla bulunur. Ciro ve fiş
 * müşteride kalan adedi de düşer (`chargedAmountCents`).
 */
export function lineAmountCents(item: LineAmountInput): number {
  const beforeDiscount = item.unitPriceCents * item.fulfilledQty;
  // İndirim payı eksik karşılanan kalemde oransal düşer, yoksa yarısı gitmiş kalem indirimin tamamını taşırdı.
  const discountShare = item.qty > 0 ? Math.round((item.lineDiscountAmountCents * item.fulfilledQty) / item.qty) : 0;
  return Math.max(0, beforeDiscount - discountShare);
}

/**
 * Kapıda geri verilen malın borçtan düşen KDV dahil tutarı (cent): tam ve kalan kalemlerin farkı, borcun oran toplamıyla aynı hesaptan;
 * kalem kalem KDV eklemek teslimden sonra sunucunun bulduğu borçtan kuruş ayrışırdı.
 */
export function refusedGrossCents(
  lines: readonly (LineAmountInput & { vatRate: number; refusedQty: number })[],
  pricesIncludeVat: boolean,
): number {
  const amounts = (kept: boolean) =>
    lines.map((line) => ({
      vatRate: line.vatRate,
      amountCents: lineAmountCents({ ...line, fulfilledQty: kept ? line.qty - line.refusedQty : line.qty }),
    }));
  return grossTotalCents(amounts(false), [], pricesIncludeVat) - grossTotalCents(amounts(true), [], pricesIncludeVat);
}

/** Bir tutarın KDV kırılımı (cent). `net + vat === gross` her zaman tutar. */
export interface VatSplit {
  /** TTC — müşterinin ödediği. */
  grossCents: number;
  /** HT — KDV hariç, kârın ve beyanın tabanı. */
  netCents: number;
  vatCents: number;
}

/**
 * Siparişin fiyat tabanındaki tutarı TTC/HT/KDV'ye ayırır: KDV dahil fiyatta KDV içinden çıkar, hariç fiyatta üstüne eklenir.
 * `zeroRated` AB içi ters yüklemedir, KDV yoktur.
 */
export function vatSplitOf(amountCents: number, pricesIncludeVat: boolean, vatRate: number, zeroRated = false): VatSplit {
  if (zeroRated) return { grossCents: amountCents, netCents: amountCents, vatCents: 0 };

  if (pricesIncludeVat) {
    const net = removeVat(amountCents, vatRate);
    return { grossCents: amountCents, netCents: net, vatCents: amountCents - net };
  }

  const gross = addVat(amountCents, vatRate);
  return { grossCents: gross, netCents: amountCents, vatCents: gross - amountCents };
}

/**
 * Kalemin ücretlenen tutarı (siparişin fiyat tabanında, cent): teslim edilen eksi müşteride kalan, ödeme türetiminin tanımı. Müşteride kalan
 * mal stoktan ve maliyetten çıkar ama ciroya girmez; kasa fişi de aynı tanımı kullanır.
 */
export function chargedAmountCents(item: AccountingLine): number {
  return fulfilledLineAmountCents(fulfilledLineOf(item));
}

/** Kalemin KDV hariç (HT) ücretlenen tutarı (cent). */
export function lineNetCents(item: AccountingLine, pricesIncludeVat: boolean, zeroRated = false): number {
  return vatSplitOf(chargedAmountCents(item), pricesIncludeVat, item.vatRate, zeroRated).netCents;
}

/**
 * Siparişin müşteri özetindeki KDV satırları: KDV hariç fiyatlı kalemlere eklenen KDV, oran başına; borçla aynı kalem tutarlarından,
 * hazırlık kesinleşmeden sipariş edilen adetle. Kargo ücreti KDV dahil olduğu için girmez.
 */
export function orderAddedVat(
  order: Pick<Order, 'pricesIncludeVat' | 'vatTreatment'>,
  items: readonly (FulfilledItem & Pick<OrderItem, 'vatRate'>)[],
  settled: boolean,
): RateVat[] {
  const goods = items
    .map((item) => ({ line: fulfilledLineOf(item), vatRate: item.vatRate }))
    .filter(({ line }) => chargedQtyOf(line, settled) > 0)
    .map(({ line, vatRate }) => ({ vatRate, amountCents: fulfilledLineAmountCents(line, settled) }));
  return addedVatOf(goods, order.pricesIncludeVat, isZeroRated(order.vatTreatment));
}
