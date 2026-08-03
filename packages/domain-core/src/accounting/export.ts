import { distributeProportional, fromCents, toCents } from '@lezzet/helper';
import type { Channel, Country, OrderSale, PaymentMethod, VatTreatment } from '@lezzet/types';
import { lineAmountCents, vatSplitOf, type AccountingLine } from './line';

/**
 * Muhasebe export'u (12.7) — DOMAIN §9. **Sistem resmî muhasebe değildir:** fatura kesmez, numara
 * üretmez; muhasebeciye TEMİZ VERİ verir. Resmî fatura numarası dışarıda doğar ve sonradan
 * `invoiceNo` olarak eşleşir.
 *
 * Saf karar katmanı: hangi satış export'a girer, satırın KDV kırılımı nedir. Okuma/yazma yok.
 *
 * **Tutarlar TTC'dir** (müşterinin ödediği); muhasebeci HT + KDV ister, o yüzden her satır kendi
 * oranlarına ayrıştırılır. Hesap cent üstünde yapılır (kayan nokta KDV'de kuruş kaçırır), dosyaya
 * euro yazılır.
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
 * Kargonun KDV oranı — YALNIZ dağıtılacak kalem bulunmadığında kullanılır (kalemsiz ya da tamamı
 * hediye satış). Normal satışta kargo malın oranını izler, buraya hiç düşmez. Fransa'da hizmet
 * temel oranı %20'dir; kural değişirse tek satır değişir.
 */
export const SHIPPING_VAT_RATE = 20;

/** Export'a girmeyen satışın sebebi. Bugün tek sebep var; liste büyürse ekran neden'i gösterebilsin. */
export type ExportSkipReason = 'gift_order';

export type ExportEligibility = { included: true } | { included: false; reason: ExportSkipReason };

/**
 * Bu satış dış muhasebeye gider mi. **Patron ikramı gitmez** — parayı patron öder, iç muhasebede
 * (gelir/kâr/kasa/ortaklık) tam normal sayılır; `isGiftOrder` YALNIZCA bu filtreyi etkiler.
 *
 * "Gerçekleşmiş mi" sorusu burada sorulmaz: `order_sale` görünümüne zaten yalnız teslim edilmiş ya
 * da kapanmış siparişler girer. İki yerde süzseydik biri gevşediğinde diğeri sessizce örterdi.
 */
export function exportEligibility(sale: Pick<OrderSale, 'isGiftOrder'>): ExportEligibility {
  return sale.isGiftOrder ? { included: false, reason: 'gift_order' } : { included: true };
}

/**
 * Bir satışın export satırı.
 *
 * **Kargo ücreti kalemlere oransal dağıtılır.** Fransız kuralı: teslimat bedeli satışın yan
 * unsurudur, malın oranını izler; karışık oranlı sepette paylaştırılır. Tek orana (ör. %20)
 * yazsaydık %5,5'lik gıda ağırlıklı bir siparişte KDV olduğundan fazla beyan edilirdi.
 *
 * **Reverse charge'da KDV yoktur** (`Autoliquidation`): müşteri kendi ülkesinde beyan eder, satır
 * net = brüt olarak gider.
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
    invoiceNote: sale.vatTreatment === 'intra_eu_b2b_reverse_charge' ? 'Autoliquidation' : null,
    gross: sumOf(vatLines, 'gross'),
    net: sumOf(vatLines, 'net'),
    vat: sumOf(vatLines, 'vat'),
    // Export SATIRI muhasebeciye giden bir belgedir ve euro yazar; sipariş tarafı artık cent
    // döndürüyor (02.9), dönüşüm burada. Satırın kendi alanlarının `…Cents`e geçmesi para/muhasebe
    // ailesinin işi (02.9 dilim 5) — bu dilim sipariş alanlarını kapatıyor.
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
 * Satışın oran bazında KDV kırılımı — **export satırının da kâr raporunun da tek zemini**.
 *
 * Kargo kalemlere oransal dağıtılır (yukarıdaki gerekçe); dağıtım kalemlerle AYNI tabanda yapılır,
 * yani b2b'de HT tutarlar üstünde. Dönüşüm en sonda, oran başına bir kez uygulanır: her kalemi tek
 * tek çevirip toplasaydık kuruş artıkları birikirdi.
 */
export function vatLinesOf(sale: SaleVatBasis, items: readonly AccountingLine[]): ExportVatLine[] {
  const zeroRated = sale.vatTreatment === 'intra_eu_b2b_reverse_charge';
  const buckets = items.map((item) => ({ vatRate: zeroRated ? 0 : item.vatRate, amount: lineAmountCents(item) }));

  const shippingCents = sale.shippingFeeCents;
  const bucketTotal = buckets.reduce((sum, b) => sum + b.amount, 0);
  if (shippingCents > 0 && bucketTotal > 0) {
    distributeProportional(buckets.map((b) => b.amount), shippingCents).forEach((share, i) => {
      buckets[i]!.amount += share;
    });
  } else if (shippingCents > 0) {
    // Dağıtacak ağırlık yok: kalemsiz satış ya da tamamı 0 fiyatlı (hediye) sepet. Kargo kendi
    // satırını açar — oransal dağıtım burada sessizce 0 döndürürdü ve kargo export'tan DÜŞERDİ.
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
 * Satışın KDV hariç cirosu (cent) — kalemler + kargo.
 *
 * Kâr raporu (12.6) bunu çağırır ve **export satırının HT'siyle aynı sayıyı alır**, çünkü ikisi de
 * `vatLinesOf`'tan doğar. Ayrı bir formül yazılsaydı aynı siparişin cirosu muhasebe dosyasında
 * başka, kâr raporunda başka çıkardı — ve hangisinin doğru olduğu tartışılırdı.
 */
export function saleNetCents(sale: SaleVatBasis, items: readonly AccountingLine[]): number {
  return vatLinesOf(sale, items).reduce((sum, line) => sum + toCents(line.net), 0);
}

/**
 * Dönemin export'u — satırlar + özet. Girdi zaten döneme süzülmüş satışlardır; burada yalnız
 * hediye siparişler ayrılır ve toplamlar çıkar.
 *
 * **Özet satırlardan türetilir**, ayrıca sorgulanmaz: dosyanın toplamı ile satırların toplamı
 * ayrı hesaplansaydı ikisi bir gün ayrışır ve hangisinin doğru olduğu bilinemezdi.
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
