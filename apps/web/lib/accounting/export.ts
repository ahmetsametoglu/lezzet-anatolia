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
const SUTUNLAR: ReadonlyArray<{ key: keyof AccountingExportRow & string; label: string }> = [
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
  const satislar = await new OrderSaleService(db).listPeriod(period.from, period.to);
  const kalemler = await new OrderItemService(db).listByOrders(satislar.map((s) => s.id));

  const siparise = new Map<string, typeof kalemler>();
  for (const kalem of kalemler) {
    const liste = siparise.get(kalem.orderId);
    if (liste) liste.push(kalem);
    else siparise.set(kalem.orderId, [kalem]);
  }

  return buildAccountingExport(
    period,
    satislar.map((sale) => ({ sale, items: siparise.get(sale.id) ?? [] })),
  );
}

/**
 * Export'un CSV'si. Özet **dosyanın içindedir**, ayrı bir yere değil: muhasebeci satırların
 * toplamını aynı dosyada görmezse kendi toplamını çıkarır ve iki sayı ayrışırsa hangisinin doğru
 * olduğu tartışılır.
 */
export function toExportCsv(data: AccountingExport): string {
  const govde = toCsv(data.rows as unknown as Array<Record<string, unknown>>, SUTUNLAR);
  const s = data.summary;
  const ozet = [
    '',
    `TOPLAM;${s.orderCount} satış;HT ${s.net};KDV ${s.vat};TTC ${s.gross}`,
    ...s.byVatRate.map((l) => `KDV %${l.vatRate};;HT ${l.net};KDV ${l.vat};TTC ${l.gross}`),
    // Hediye siparişler dosyada YOK ama farkı açıklayan satır burada: sessiz dışlama, dönem cirosu
    // ile export toplamı arasındaki boşluğu açıklanamaz bırakırdı.
    ...(s.excludedGiftCount > 0 ? [`HARİÇ (patron ikramı);${s.excludedGiftCount} satış;;;TTC ${s.excludedGiftGross}`] : []),
  ].join('\n');

  return `${govde}${ozet}\n`;
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
  const no = invoiceNo.trim();
  if (!no) return { status: 'invalid', reason: 'empty_invoice_no' };

  await new OrderService(serviceDb()).update({ id: orderId, invoiceNo: no });
  return { status: 'ok', orderId, invoiceNo: no };
}
