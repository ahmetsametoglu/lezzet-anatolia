import { distributeProportional, fromCents, removeVat, toCents } from '@lezzet/helper';
import type { Channel, Country, OrderSale, PaymentMethod, VatTreatment } from '@lezzet/types';
import { lineGrossCents, type AccountingLine } from './line';

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
  const zeroRated = sale.vatTreatment === 'intra_eu_b2b_reverse_charge';
  const kalemler = items.map((item) => ({ vatRate: zeroRated ? 0 : item.vatRate, gross: lineGrossCents(item) }));

  const kargo = toCents(sale.shippingFee);
  const kalemBrut = kalemler.reduce((sum, k) => sum + k.gross, 0);
  if (kargo > 0 && kalemBrut > 0) {
    distributeProportional(kalemler.map((k) => k.gross), kargo).forEach((pay, i) => {
      kalemler[i]!.gross += pay;
    });
  } else if (kargo > 0) {
    // Dağıtacak ağırlık yok: kalemsiz satış ya da tamamı 0 fiyatlı (hediye) sepet. Kargo kendi
    // satırını açar — oransal dağıtım burada sessizce 0 döndürürdü ve kargo export'tan DÜŞERDİ.
    kalemler.push({ vatRate: zeroRated ? 0 : SHIPPING_VAT_RATE, gross: kargo });
  }

  const kova = new Map<number, number>();
  for (const k of kalemler) kova.set(k.vatRate, (kova.get(k.vatRate) ?? 0) + k.gross);

  const vatLines: ExportVatLine[] = [...kova.entries()]
    .filter(([, gross]) => gross > 0)
    .sort(([a], [b]) => a - b)
    .map(([vatRate, gross]) => {
      const net = removeVat(gross, vatRate);
      return { vatRate, gross: fromCents(gross), net: fromCents(net), vat: fromCents(gross - net) };
    });

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
    invoiceNote: zeroRated ? 'Autoliquidation' : null,
    gross: topla(vatLines, 'gross'),
    net: topla(vatLines, 'net'),
    vat: topla(vatLines, 'vat'),
    shippingFee: sale.shippingFee,
    discountAmount: sale.discountAmount,
    vatLines,
  };
}

/** Euro toplamı — cent üstünden toplanır ki kuruş artığı birikmesin. */
function topla<T>(rows: readonly T[], field: keyof T): number {
  return fromCents(rows.reduce((sum, row) => sum + toCents(Number(row[field])), 0));
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
    const satir = buildExportRow(sale, items);
    if (exportEligibility(sale).included) {
      rows.push(satir);
      continue;
    }
    excludedGiftCount += 1;
    excludedGiftGrossCents += toCents(satir.gross);
  }

  const kova = new Map<number, { gross: number; net: number; vat: number }>();
  for (const satir of rows) {
    for (const line of satir.vatLines) {
      const mevcut = kova.get(line.vatRate) ?? { gross: 0, net: 0, vat: 0 };
      mevcut.gross += toCents(line.gross);
      mevcut.net += toCents(line.net);
      mevcut.vat += toCents(line.vat);
      kova.set(line.vatRate, mevcut);
    }
  }

  return {
    summary: {
      from: period.from,
      to: period.to,
      orderCount: rows.length,
      gross: topla(rows, 'gross'),
      net: topla(rows, 'net'),
      vat: topla(rows, 'vat'),
      shippingFee: topla(rows, 'shippingFee'),
      discountAmount: topla(rows, 'discountAmount'),
      byVatRate: [...kova.entries()]
        .sort(([a], [b]) => a - b)
        .map(([vatRate, t]) => ({ vatRate, gross: fromCents(t.gross), net: fromCents(t.net), vat: fromCents(t.vat) })),
      excludedGiftCount,
      excludedGiftGross: fromCents(excludedGiftGrossCents),
    },
    rows,
  };
}
