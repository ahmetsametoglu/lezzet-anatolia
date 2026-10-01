import { distributeProportional, fromCents, toCents } from '@lezzet/helper';
import type { Channel, Country, OrderSale, PaymentMethod, VatTreatment } from '@lezzet/types';
import { lineAmountCents, vatSplitOf, type AccountingLine } from './line';
import { isZeroRated } from '../tax/vat-treatment';

/**
 * Muhasebe aktarımı (DOMAIN §9): hangi satış dışa gider ve satırın KDV kırılımı nedir; tutarlar TTC'dir, muhasebeci HT ve KDV
 * istediği için her satır oranlarına ayrıştırılır. Hesap cent üstünde yapılır, çünkü kayan nokta KDV'de kuruş kaçırır.
 */

/** Bir satırın tek KDV oranındaki payı. `net + vat === gross` her zaman tutar. */
export interface ExportVatLine {
  vatRate: number;
  /** TTC — müşterinin ödediği. */
  gross: number;
  /** HT — KDV hariç. */
  net: number;
  vat: number;
}

export interface AccountingExportRow {
  orderId: string;
  /** Satışın gerçekleştiği gün (teslim/kapanış) — kayıt günü değil. */
  saleDate: string;
  referenceNo: string | null;
  /** Dış muhasebeden sonradan eşleşir; boşsa satır eşleştirme kuyruğundadır. */
  invoiceNo: string | null;
  customerId: string;
  channel: Channel;
  paymentMethod: PaymentMethod | null;
  deliveryCountry: Country;
  vatTreatment: VatTreatment;
  /** Reverse charge'da müşterinin o anki geçerli vergi numarası — denetim kanıtı. */
  vatNumber: string | null;
  /** Faturaya basılacak yasal ibare; yalnız reverse charge'da doludur. */
  invoiceNote: 'Autoliquidation' | null;
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
  /**
   * Export DIŞINDA bırakılan hediye siparişler. **Sayı ve tutar olarak görünür**: sessiz dışlama,
   * dönem cirosu ile export toplamı arasındaki farkı açıklanamaz bırakırdı (DOMAIN §9).
   */
  excludedGiftCount: number;
  excludedGiftGross: number;
}

export interface AccountingExport {
  summary: AccountingExportSummary;
  rows: AccountingExportRow[];
}

/**
 * Kargonun KDV oranı, yalnız dağıtılacak kalem tutarı yokken (kalemsiz ya da tamamı sıfır fiyatlı satış) kullanılır; normal
 * satışta kargo malın oranını izler. Fransa'da hizmetin temel oranı %20'dir.
 */
export const SHIPPING_VAT_RATE = 20;

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

/**
 * Bir satışın aktarım satırı: kargo kalemlere oransal dağıtılır, çünkü teslimat bedeli malın oranını izler ve tek orana yazmak
 * %5,5'lik gıdada KDV'yi fazla beyan ederdi. Ters yüklemede KDV yoktur, satır net = brüt gider.
 */
export function buildExportRow(sale: OrderSale, items: readonly AccountingLine[]): AccountingExportRow {
  const vatLines = vatLinesOf(sale, items);

  return {
    orderId: sale.id,
    saleDate: sale.saleDate,
    referenceNo: sale.referenceNo,
    invoiceNo: sale.invoiceNo,
    customerId: sale.customerId,
    channel: sale.channel,
    paymentMethod: sale.paymentMethod,
    deliveryCountry: sale.deliveryCountry,
    vatTreatment: sale.vatTreatment,
    vatNumber: sale.vatNumberSnapshot,
    invoiceNote: isZeroRated(sale.vatTreatment) ? 'Autoliquidation' : null,
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
 * KDV kırılımının tabanı: satışın kanalı ve vergi işlemi. Satırın geri kalanı (referans, müşteri,
 * ülke) para hesabına girmez — bu yüzden ciro soranın tam bir `OrderSale` taşıması gerekmez.
 */
export type SaleVatBasis = Pick<OrderSale, 'channel' | 'vatTreatment' | 'shippingFeeCents'>;

/**
 * Satışın oran bazında KDV kırılımı; aktarım satırının da kâr raporunun da tek zemini. Kargo kalemlerle aynı tabanda (b2b'de HT)
 * dağıtılır ve dönüşüm oran başına bir kez uygulanır, çünkü kalem kalem çevirmek kuruş artığı biriktirirdi.
 */
export function vatLinesOf(sale: SaleVatBasis, items: readonly AccountingLine[]): ExportVatLine[] {
  const zeroRated = isZeroRated(sale.vatTreatment);
  const buckets = items.map((item) => ({ vatRate: zeroRated ? 0 : item.vatRate, amount: lineAmountCents(item) }));

  const shippingCents = sale.shippingFeeCents;
  const bucketTotal = buckets.reduce((sum, b) => sum + b.amount, 0);
  if (shippingCents > 0 && bucketTotal > 0) {
    distributeProportional(buckets.map((b) => b.amount), shippingCents).forEach((share, i) => {
      buckets[i]!.amount += share;
    });
  } else if (shippingCents > 0) {
    // Dağıtacak ağırlık yok: kalemsiz satış ya da tamamı sıfır fiyatlı sepet. Kargo kendi satırını açar, yoksa oransal dağıtım
    // sessizce 0 döndürür ve kargo aktarımdan düşerdi.
    buckets.push({ vatRate: zeroRated ? 0 : SHIPPING_VAT_RATE, amount: shippingCents });
  }

  const byRate = new Map<number, number>();
  for (const b of buckets) byRate.set(b.vatRate, (byRate.get(b.vatRate) ?? 0) + b.amount);

  return [...byRate.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a - b)
    .map(([vatRate, amount]) => {
      const split = vatSplitOf(amount, sale.channel, vatRate, zeroRated);
      return {
        vatRate,
        gross: fromCents(split.grossCents),
        net: fromCents(split.netCents),
        vat: fromCents(split.vatCents),
      };
    });
}

/**
 * Satışın KDV hariç cirosu (cent), kalemler ve kargo. Kâr raporu da bunu çağırır, çünkü ayrı bir formül aynı siparişin cirosunu
 * aktarımda başka, kâr raporunda başka çıkarırdı.
 */
export function saleNetCents(sale: SaleVatBasis, items: readonly AccountingLine[]): number {
  return vatLinesOf(sale, items).reduce((sum, line) => sum + toCents(line.net), 0);
}

/**
 * Dönemin aktarımı: girdi döneme süzülmüş satışlardır, burada yalnız hediye siparişler ayrılır ve toplamlar çıkar. Özet
 * satırlardan türetilir, çünkü ayrı hesaplanan iki toplam bir gün ayrışır ve hangisinin doğru olduğu bilinemezdi.
 */
export function buildAccountingExport(
  period: { from: string; to: string },
  sales: ReadonlyArray<{ sale: OrderSale; items: readonly AccountingLine[] }>,
): AccountingExport {
  const rows: AccountingExportRow[] = [];
  let excludedGiftCount = 0;
  let excludedGiftGrossCents = 0;

  for (const { sale, items } of sales) {
    const exportRow = buildExportRow(sale, items);
    if (exportEligibility(sale).included) {
      rows.push(exportRow);
      continue;
    }
    excludedGiftCount += 1;
    excludedGiftGrossCents += toCents(exportRow.gross);
  }

  const byRate = new Map<number, { gross: number; net: number; vat: number }>();
  for (const exportRow of rows) {
    for (const line of exportRow.vatLines) {
      const current = byRate.get(line.vatRate) ?? { gross: 0, net: 0, vat: 0 };
      current.gross += toCents(line.gross);
      current.net += toCents(line.net);
      current.vat += toCents(line.vat);
      byRate.set(line.vatRate, current);
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
      byVatRate: [...byRate.entries()]
        .sort(([a], [b]) => a - b)
        .map(([vatRate, t]) => ({ vatRate, gross: fromCents(t.gross), net: fromCents(t.net), vat: fromCents(t.vat) })),
      excludedGiftCount,
      excludedGiftGross: fromCents(excludedGiftGrossCents),
    },
    rows,
  };
}
