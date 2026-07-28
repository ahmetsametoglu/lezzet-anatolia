import { OrderItemService, OrderSaleService, OrderService, serviceDb } from '@lezzet/database';
import { buildAccountingExport, type AccountingExport, type AccountingExportRow } from '@lezzet/domain-core';
import { toCsv } from '@lezzet/helper';
import type { KeysetCursor, OrderSale, Page } from '@lezzet/types';

/**
 * Muhasebe export kapısı (12.7) — DOMAIN §9. **Sistem resmî muhasebe değildir:** fatura kesmez,
 * numara üretmez; muhasebeciye temiz veri verir.
 *
 * Karar motorun (hangi satış girer, KDV kırılımı), okuma servisin; birleştiren yer burası
 * (STACK §4).
 *
 * **Hedef biçim henüz açık** — muhasebecinin yazılımı (Pennylane/Sage/EBP/Tiime…) netleşince
 * biçimlenir. Bu yüzden dosya iki katmanda üretiliyor: satırlar biçimden bağımsız (`rows`), CSV
 * yalnız onların bir sunumu. Yeni hedef geldiğinde değişen tek şey sütun eşlemesidir.
 */

/** Dosyanın sütunları — sıra ve başlıklar AÇIK yazılır; alan eklenince biçim habersiz kaymasın. */
const COLUMNS: ReadonlyArray<{ key: keyof AccountingExportRow & string; label: string }> = [
  { key: 'saleDate', label: 'Satış tarihi' },
  { key: 'referenceNo', label: 'Referans' },
  { key: 'invoiceNo', label: 'Fatura no' },
  { key: 'channel', label: 'Kanal' },
  { key: 'deliveryCountry', label: 'Ülke' },
  { key: 'vatTreatment', label: 'KDV işlemi' },
  { key: 'vatNumber', label: 'Vergi no' },
  { key: 'invoiceNote', label: 'İbare' },
  { key: 'paymentMethod', label: 'Ödeme' },
  { key: 'net', label: 'HT' },
  { key: 'vat', label: 'KDV' },
  { key: 'gross', label: 'TTC' },
  { key: 'shippingFee', label: 'Kargo' },
  { key: 'discountAmount', label: 'İndirim' },
];

interface ExportPeriod {
  /** Dâhil — satışın gerçekleştiği (teslim/kapanış) gün. */
  from: string;
  /** Dâhil. */
  to: string;
}

/**
 * Dönemin export'u: satırlar + özet. Dosya üretilmez, veri döner — çağıran ekranda gösterir ya da
 * indirtir.
 *
 * Kalemler TEK turda çekilir (sipariş başına sorgu N+1 olurdu) ve siparişe göre gruplanır.
 */
export async function buildExport(period: ExportPeriod): Promise<AccountingExport> {
  const db = serviceDb();
  const sales = await new OrderSaleService(db).listPeriod(period.from, period.to);
  const items = await new OrderItemService(db).listByOrders(sales.map((summary) => summary.id));

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = byOrder.get(item.orderId);
    if (list) list.push(item);
    else byOrder.set(item.orderId, [item]);
  }

  return buildAccountingExport(
    period,
    sales.map((sale) => ({ sale, items: byOrder.get(sale.id) ?? [] })),
  );
}

/**
 * Export'un CSV'si. Özet **dosyanın içindedir**, ayrı bir yere değil: muhasebeci satırların
 * toplamını aynı dosyada görmezse kendi toplamını çıkarır ve iki sayı ayrışırsa hangisinin doğru
 * olduğu tartışılır.
 */
export function toExportCsv(data: AccountingExport): string {
  const body = toCsv(data.rows as unknown as Array<Record<string, unknown>>, COLUMNS);
  const summary = data.summary;
  const summaryLines = [
    '',
    `TOPLAM;${summary.orderCount} satış;HT ${summary.net};KDV ${summary.vat};TTC ${summary.gross}`,
    ...summary.byVatRate.map((line) => `KDV %${line.vatRate};;HT ${line.net};KDV ${line.vat};TTC ${line.gross}`),
    // Hediye siparişler dosyada YOK ama farkı açıklayan satır burada: sessiz dışlama, dönem cirosu
    // ile export toplamı arasındaki boşluğu açıklanamaz bırakırdı.
    ...(summary.excludedGiftCount > 0 ? [`HARİÇ (patron ikramı);${summary.excludedGiftCount} satış;;;TTC ${summary.excludedGiftGross}`] : []),
  ].join('\n');

  return `${body}${summaryLines}\n`;
}

/**
 * **Fatura eşleştirme kuyruğu** — dış muhasebe fatura numarasını üretir, buradan siparişe yazılır.
 * Sonsuz kaydırma: kuyruk siparişlerle birlikte büyür.
 */
export function pendingInvoices(opts: { cursor?: KeysetCursor; limit?: number } = {}): Promise<Page<OrderSale>> {
  return new OrderSaleService(serviceDb()).pendingInvoices(opts);
}

type InvoiceMatchOutcome =
  | { status: 'ok'; orderId: string; invoiceNo: string }
  | { status: 'invalid'; reason: 'empty_invoice_no' };

/**
 * Resmî fatura numarasını siparişe bağlar. Numara BURADA ÜRETİLMEZ — dış muhasebede doğar; sistem
 * yalnız kendi referansıyla eşleştirir (`reference_no ≠ invoice_no`, DATA_MODEL).
 *
 * Boş numara reddedilir: boş dize yazılsaydı satır kuyruktan düşer ama hiçbir faturaya bağlanmaz,
 * eşleşmemiş satış görünmez olurdu.
 */
export async function matchInvoiceNo(orderId: string, invoiceNo: string): Promise<InvoiceMatchOutcome> {
  const trimmed = invoiceNo.trim();
  if (!trimmed) return { status: 'invalid', reason: 'empty_invoice_no' };

  await new OrderService(serviceDb()).update({ id: orderId, invoiceNo: trimmed });
  return { status: 'ok', orderId, invoiceNo: trimmed };
}
