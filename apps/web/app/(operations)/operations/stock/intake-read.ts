import 'server-only';
import { PurchaseOrderService, SupplierService, serviceDb } from '@lezzet/database';
import type { PurchaseOrderProgress, PurchaseOrderStatus } from '@lezzet/types';
import { readWarehouseContext, readWorkWarehouse } from '@/lib/warehouse/context';
import type { IntakeTabData, PendingPurchase } from './stock-types';

/**
 * **Mal kabul sekmesinin okuması** (22.26) — `receiving-read.ts`ten geldi, iki değişiklikle.
 *
 * ── "KABUL BEKLİYOR" LİSTESİ AÇIK SİPARİŞLERİN EKSİK KALEMLERİDİR ───────────
 * `openProgress()` tam bunu veriyor: `received`/`cancelled` dışarıda (ilki zaten stoğa girdi,
 * ikincisi hiç gelmeyecek) ve tamamlanmış kalem "yolda" sayılmıyor. Sayfalama yok ve gerekmiyor —
 * açık sipariş kümesi veriyle büyümez, kabul edildikçe kapanır (`CLAUDE §1`).
 *
 * ── DEPO SÜZGECİ YOK, DEPO KİMLİKTEN GELİR ──────────────────────────────────
 * Liste depo-üstüdür ve öyle kalmalı: **tedarik siparişi bir depoya ait değildir**, mal kabul
 * edilirken bir kapıdan girer. Depo sorusu okumanın değil YAZMANIN sorusu — cevabı kabul
 * diyaloğunda veriliyor ve **ön seçim üretilmiyor** (`CLAUDE §1`).
 *
 * ── N+1 KIRILDI (22.26) ─────────────────────────────────────────────────────
 * Eski okuma sipariş başına `getById` atıyordu; on açık siparişte on tur. Künyeler artık tek
 * `getAll` ile geliyor — `openProgress` zaten aynı kümeyi içeride okuyor, sayısı da açık sipariş
 * kadar, yani ikinci turun maliyeti sabit.
 */

/** İlerleme satırı + siparişin durumu — `openProgress`in döndürdüğü şekil. */
type ProgressRow = PurchaseOrderProgress & { status: PurchaseOrderStatus };

/** Rozetin sayısı: kaç açık sipariş kabul bekliyor. Sekme kapalıyken de okunur (`StockCounts`). */
export function pendingOrderCount(rows: ProgressRow[]): number {
  return new Set(rows.map((row) => row.purchaseOrderId)).size;
}

/** Açık siparişlerin bekleyen kalemleri — rozet ve sekme aynı okumadan beslenir. */
export function readIntakeProgress(): Promise<ProgressRow[]> {
  return new PurchaseOrderService(serviceDb()).openProgress();
}

/** Sekmenin tam verisi — YALNIZ sekme açıkken çağrılır (`StockData.intake` künyesi). */
export async function readIntakeTab(rows: ProgressRow[]): Promise<IntakeTabData> {
  const db = serviceDb();

  // Tedarikçiler TEK TURDA: doğal tavanlı bir küme (operatörün elle kurduğu liste, `CLAUDE §1`);
  // adları hem bekleyen kartlarda hem siparişsiz kabulün seçicisinde kullanılıyor.
  //
  // Bağlam iki soruyu birden cevaplıyor: "kabul hangi kapıdan" (seçilmişse) ve "seçilmemişse hangi
  // kapılar açık". Ek okuma yok — `readWarehouseContext` istek başına önbellekli (`cache()`).
  const [orders, suppliers, workplace, ctx] = await Promise.all([
    new PurchaseOrderService(db).listOpen(),
    new SupplierService(db).list(),
    readWorkWarehouse(),
    readWarehouseContext(),
  ]);

  const byOrder = new Map<string, ProgressRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.purchaseOrderId) ?? [];
    list.push(row);
    byOrder.set(row.purchaseOrderId, list);
  }

  const supplierOf = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const now = Date.now();

  const pending: PendingPurchase[] = orders.flatMap((order) => {
    const lines = byOrder.get(order.id);
    // Bekleyen kalemi kalmamış sipariş listede DURMAZ: durumu henüz `received`e dönmemiş olabilir
    // ama kabul edilecek bir şeyi yoktur ve kartı boş bir iş gibi görünürdü.
    if (!lines || lines.length === 0) return [];
    return [
      {
        purchaseOrderId: order.id,
        referenceNo: order.referenceNo,
        supplierName: supplierOf.get(order.supplierId) ?? 'Tedarikçi çözülemedi',
        lineCount: lines.length,
        missingLineCount: lines.length,
        // Yaş GÖNDERİM tarihinden: taslak sipariş bir bekleyiş değil, bizim kararımız. `sentAt`
        // yoksa `null` — "0 gün" yazmak bugün gönderilmiş göstermek olurdu (`CLAUDE §1`).
        ageDays: order.sentAt ? Math.floor((now - new Date(order.sentAt).getTime()) / 86_400_000) : null,
        isPartial: order.status === 'partially_received',
      },
    ];
  });

  // En eski önce: 14 gündür bekleyen sipariş listenin dibinde kaybolmamalı.
  pending.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));

  return {
    pending,
    suppliers: suppliers.filter((supplier) => supplier.isActive).map((s) => ({ id: s.id, name: s.name })),
    warehouseOptions: ctx.warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
    warehouseId: workplace.status === 'ok' ? workplace.warehouseId : null,
  };
}
