import { fromCents, toCents } from '@lezzet/helper';
import type { Business, Channel, Country, OrderItem, OrderSale, PaymentMethod, VatTreatment } from '@lezzet/types';
import { chargedShippingParts } from '../delivery/shipping-fee';
import { chargedQtyOf, fulfilledLineAmountCents, fulfilledLineOf } from '../payment/payment-status';
import type { AccountingLine } from './line';
import { vatByRate } from '../pricing/vat-base';
import { isZeroRated, rateCountryOf, REVERSE_CHARGE_INVOICE_NOTE } from '../tax/vat-treatment';

/**
 * Muhasebe aktarımı (DOMAIN §9): hangi satış dışa gider ve satırın KDV kırılımı nedir; tutarlar TTC'dir, muhasebeci HT ve KDV
 * istediği için her satır oranlarına ayrıştırılır. Hesap cent üstünde yapılır, çünkü kayan nokta KDV'de kuruş kaçırır.
 */

/** Bir satırın tek KDV oranındaki payı. `net + vat === gross` her zaman tutar. */
export interface SaleVatLine {
  vatRate: number;
  /** TTC — müşterinin ödediği. */
  gross: number;
  /** HT — KDV hariç. */
  net: number;
  vat: number;
}

/** Aktarımın KDV payı, oranın ülkesiyle; aynı oran iki ülkede ayrı beyan edilir. `null` = ters yükleme, KDV ülkesi yok. */
export interface ExportVatLine extends SaleVatLine {
  country: Country | null;
}

export interface AccountingExportRow {
  orderId: string;
  /** Satışın gerçekleştiği gün (teslim/kapanış) — kayıt günü değil. */
  saleDate: string;
  referenceNo: string | null;
  /** Dış muhasebeden sonradan eşleşir; boşsa satır eşleştirme kuyruğundadır. */
  invoiceNo: string | null;
  customerId: string;
  /** Satışın işi; dosya şirketin tamamıdır, satır işini taşır. */
  business: Business;
  channel: Channel;
  paymentMethod: PaymentMethod | null;
  deliveryCountry: Country;
  vatTreatment: VatTreatment;
  /** Reverse charge'da müşterinin o anki geçerli vergi numarası — denetim kanıtı. */
  vatNumber: string | null;
  /** Faturaya basılacak yasal ibare; yalnız reverse charge'da doludur. */
  invoiceNote: typeof REVERSE_CHARGE_INVOICE_NOTE | null;
  gross: number;
  net: number;
  vat: number;
  shippingFee: number;
  discountAmount: number;
  vatLines: ExportVatLine[];
}

/** Dönemin özeti — dosyanın son satırı; muhasebeci toplamı buradan doğrular. */
export interface AccountingExportSummary {
  from: string;
  to: string;
  orderCount: number;
  gross: number;
  net: number;
  vat: number;
  shippingFee: number;
  discountAmount: number;
  /** Oran bazında toplam — KDV beyanının doğrudan girdisi. */
  byVatRate: ExportVatLine[];
  /** Aktarıma satış olarak girmeyen hediye siparişler (DOMAIN §9); sessiz kalmasınlar diye sayıları ve değerleri özettedir. */
  excludedGiftCount: number;
  /** Hediyelerin mal maliyeti, muhasebecinin ikram gideri; bir hediyenin maliyeti bilinmiyorsa `null`. */
  excludedGiftCost: number | null;
  /** Hediyelerin liste fiyatıyla KDV dahil değeri, yalnız bilgi için; bir kalemin liste fiyatı yoksa `null`. */
  excludedGiftListValue: number | null;
}

export interface AccountingExport {
  summary: AccountingExportSummary;
  rows: AccountingExportRow[];
}

/** Export'a girmeyen satışın sebebi. Bugün tek sebep var; liste büyürse ekran neden'i gösterebilsin. */
export type ExportSkipReason = 'gift_order';

export type ExportEligibility = { included: true } | { included: false; reason: ExportSkipReason };

/**
 * Bu satış dış muhasebeye gider mi: hediye sipariş gitmez, çünkü ödemesiz kapanır ve satış değildir (DOMAIN §9). Gerçekleşme
 * burada sorulmaz; `order_sale` yalnız teslim edilmiş ya da kapanmış siparişi taşır ve iki yerde süzmek birinin gevşemesini örterdi.
 */
export function exportEligibility(sale: Pick<OrderSale, 'isGiftOrder'>): ExportEligibility {
  return sale.isGiftOrder ? { included: false, reason: 'gift_order' } : { included: true };
}

/** Faturaya basılan yasal ibare; yalnız ters yüklemede. Döküm satırı ve satış faturası aynı ibareyi taşır. */
export function invoiceNoteOf(treatment: VatTreatment): AccountingExportRow['invoiceNote'] {
  return isZeroRated(treatment) ? REVERSE_CHARGE_INVOICE_NOTE : null;
}

/**
 * Bir satışın aktarım satırı: kargo kalemlere oransal dağıtılır, çünkü teslimat bedeli malın oranını izler ve tek orana yazmak
 * %5,5'lik gıdada KDV'yi fazla beyan ederdi. Ters yüklemede KDV yoktur, satır net = brüt gider.
 */
export function buildExportRow(sale: OrderSale, items: readonly AccountingLine[]): AccountingExportRow {
  const country = rateCountryOf(sale.vatTreatment, sale.deliveryCountry);
  const vatLines = vatLinesOf(sale, items).map((line) => ({ ...line, country }));

  return {
    orderId: sale.id,
    saleDate: sale.saleDate,
    referenceNo: sale.referenceNo,
    invoiceNo: sale.invoiceNo,
    customerId: sale.customerId,
    business: sale.business,
    channel: sale.channel,
    paymentMethod: sale.paymentMethod,
    deliveryCountry: sale.deliveryCountry,
    vatTreatment: sale.vatTreatment,
    vatNumber: sale.vatNumberSnapshot,
    invoiceNote: invoiceNoteOf(sale.vatTreatment),
    gross: sumOf(vatLines, 'gross'),
    net: sumOf(vatLines, 'net'),
    vat: sumOf(vatLines, 'vat'),
    // Aktarım satırı muhasebeciye giden belgedir ve euro yazar; sipariş tarafı cent taşıdığı için dönüşüm burada.
    shippingFee: fromCents(sale.shippingFeeCents),
    discountAmount: fromCents(sale.discountAmountCents),
    vatLines,
  };
}

/** Euro toplamı — cent üstünden toplanır ki kuruş artığı birikmesin. */
function sumOf<T>(rows: readonly T[], field: keyof T): number {
  return fromCents(rows.reduce((sum, row) => sum + toCents(Number(row[field])), 0));
}

/**
 * KDV kırılımının tabanı: kalem fiyatının KDV dahil olup olmadığı ve vergi işlemi. Satırın geri kalanı (referans, müşteri,
 * ülke) para hesabına girmez — bu yüzden ciro soranın tam bir `OrderSale` taşıması gerekmez.
 */
export type SaleVatBasis = Pick<OrderSale, 'pricesIncludeVat' | 'vatTreatment' | 'shippingFeeCents'>;

/**
 * Satışın oran bazında KDV kırılımı, aktarım satırının da kâr raporunun da tek zemini: ücretlenen kalem ve kargo payı kasa fişindeki
 * tanımla aynıdır, dönüşüm oran başına bir kez uygulanır, çünkü kalem kalem çevirmek kuruş artığı biriktirirdi. Hazırlık
 * kesinleşmemişse (`settled` yanlış) kalemler borçla aynı kuralla sipariş edilen adetten okunur.
 */
export function vatLinesOf(
  sale: SaleVatBasis,
  items: readonly AccountingLine[],
  settled = true,
  keepZeroRatedRates = false,
): SaleVatLine[] {
  const charged = items
    .map((item) => ({ line: fulfilledLineOf(item), vatRate: item.vatRate }))
    .filter(({ line }) => chargedQtyOf(line, settled) > 0)
    .map(({ line, vatRate }) => ({ vatRate, amountCents: fulfilledLineAmountCents(line, settled) }));
  const shipping = chargedShippingParts(
    sale.shippingFeeCents,
    charged.map((part) => ({ vatRate: part.vatRate, totalCents: part.amountCents })),
  ).map((part) => ({ vatRate: part.vatRate, amountCents: part.amountCents }));

  return vatByRate(charged, shipping, sale.pricesIncludeVat, isZeroRated(sale.vatTreatment), keepZeroRatedRates)
    .filter((line) => line.grossCents > 0)
    .map((line) => ({
      vatRate: line.vatRate,
      gross: fromCents(line.grossCents),
      net: fromCents(line.netCents),
      vat: fromCents(line.vatCents),
    }));
}

/**
 * Satışın KDV hariç cirosu (cent), kalemler ve kargo. Kâr raporu da bunu çağırır, çünkü ayrı bir formül aynı siparişin cirosunu
 * aktarımda başka, kâr raporunda başka çıkarırdı.
 */
export function saleNetCents(sale: SaleVatBasis, items: readonly AccountingLine[], settled = true): number {
  return vatLinesOf(sale, items, settled).reduce((sum, line) => sum + toCents(line.net), 0);
}

/** Aktarımın kalemi; liste fiyatı hediyenin değeri için okunur. */
export type ExportLine = AccountingLine & Pick<OrderItem, 'listUnitPriceCents'>;

/**
 * Dönemin aktarımı: girdi döneme süzülmüş satışlardır, burada yalnız hediye siparişler ayrılır ve toplamlar çıkar. Özet
 * satırlardan türetilir, çünkü ayrı hesaplanan iki toplam bir gün ayrışır ve hangisinin doğru olduğu bilinemezdi.
 */
export function buildAccountingExport(
  period: { from: string; to: string },
  sales: ReadonlyArray<{ sale: OrderSale; items: readonly ExportLine[] }>,
): AccountingExport {
  const rows: AccountingExportRow[] = [];
  let excludedGiftCount = 0;
  let giftCostCents: number | null = 0;
  let giftListCents: number | null = 0;

  for (const { sale, items } of sales) {
    if (exportEligibility(sale).included) {
      rows.push(buildExportRow(sale, items));
      continue;
    }
    excludedGiftCount += 1;
    giftCostCents = giftCostCents === null || sale.cogsAmountCents === null ? null : giftCostCents + sale.cogsAmountCents;
    const listCents = giftListValueCents(sale, items);
    giftListCents = giftListCents === null || listCents === null ? null : giftListCents + listCents;
  }

  // Oran ve ülke birlikte anahtardır: beyan ülke ülke verilir.
  const byRate = new Map<string, { vatRate: number; country: Country | null; gross: number; net: number; vat: number }>();
  for (const exportRow of rows) {
    for (const line of exportRow.vatLines) {
      const key = `${line.vatRate}:${line.country ?? ''}`;
      const current = byRate.get(key) ?? { vatRate: line.vatRate, country: line.country, gross: 0, net: 0, vat: 0 };
      current.gross += toCents(line.gross);
      current.net += toCents(line.net);
      current.vat += toCents(line.vat);
      byRate.set(key, current);
    }
  }

  return {
    summary: {
      from: period.from,
      to: period.to,
      orderCount: rows.length,
      gross: sumOf(rows, 'gross'),
      net: sumOf(rows, 'net'),
      vat: sumOf(rows, 'vat'),
      shippingFee: sumOf(rows, 'shippingFee'),
      discountAmount: sumOf(rows, 'discountAmount'),
      byVatRate: [...byRate.values()]
        .sort((a, b) => a.vatRate - b.vatRate || (a.country ?? '').localeCompare(b.country ?? ''))
        .map((t) => ({ vatRate: t.vatRate, country: t.country, gross: fromCents(t.gross), net: fromCents(t.net), vat: fromCents(t.vat) })),
      excludedGiftCount,
      excludedGiftCost: giftCostCents === null ? null : fromCents(giftCostCents),
      excludedGiftListValue: giftListCents === null ? null : fromCents(giftListCents),
    },
    rows,
  };
}

/** Hediyenin liste fiyatıyla KDV dahil değeri: kalem sıfır fiyatla yazılır, liste fiyatı pazarlık izinde durur. */
function giftListValueCents(sale: SaleVatBasis, items: readonly ExportLine[]): number | null {
  const goods = [];
  for (const item of items) {
    if (item.listUnitPriceCents === null) return null;
    goods.push({ vatRate: item.vatRate, amountCents: item.listUnitPriceCents * item.fulfilledQty });
  }
  return vatByRate(goods, [], sale.pricesIncludeVat, isZeroRated(sale.vatTreatment)).reduce((sum, line) => sum + line.grossCents, 0);
}
