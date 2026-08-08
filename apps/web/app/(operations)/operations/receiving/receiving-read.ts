import 'server-only';
import { PurchaseOrderService, SupplierService, WarehouseService, serviceDb } from '@lezzet/database';
import type { WarehouseScope } from '@lezzet/domain-core';
import type { PendingPurchase, ReceivingData } from './receiving-types';

/**
 * **Mal kabul masasının okuması** (10.4) — `design/project/Operasyon - Depo Stok Giris.dc.html`.
 *
 * ── "KABUL BEKLİYOR" LİSTESİ AÇIK SİPARİŞLERİN EKSİK KALEMLERİDİR ───────────
 * `openProgress()` tam bunu veriyor: `received`/`cancelled` dışarıda (ilki zaten stoğa girdi,
 * ikincisi hiç gelmeyecek) ve tamamlanmış kalem "yolda" sayılmıyor. Sayfalama yok ve gerekmiyor —
 * açık sipariş kümesi veriyle büyümez, kabul edildikçe kapanır (`CLAUDE §1`).
 *
 * ── DEPO SÜZGECİ YOK, DEPO KİMLİKTEN GELİR ──────────────────────────────────
 * Tasarımın kuralı: *"Depo süzgeci yok — depocu kendi evreninde çalışır."* Kapsam tek depoysa adı
 * başlıkta yazar ve kabul oraya gider; yönetici (`all`) için depo **bitirme diyaloğunda açık
 * seçimdir** ve **ön seçim üretilmez** — tasarım bunu ayrıca vurguluyor.
 */
export async function readReceiving(scope: WarehouseScope): Promise<ReceivingData> {
  const db = serviceDb();
  const progress = await new PurchaseOrderService(db).openProgress();

  // Sipariş başına topla: `openProgress` KALEM satırları döndürüyor, ekranın kartı ise SİPARİŞ.
  const byOrder = new Map<string, typeof progress>();
  for (const row of progress) {
    const list = byOrder.get(row.purchaseOrderId) ?? [];
    list.push(row);
    byOrder.set(row.purchaseOrderId, list);
  }

  const orders = await Promise.all([...byOrder.keys()].map((id) => new PurchaseOrderService(db).getById(id)));
  // Tedarikçiler TEK TURDA: doğal tavanlı bir küme (operatörün elle kurduğu liste, `CLAUDE §1`),
  // sipariş başına okumak N+1 olurdu.
  const suppliers = await new SupplierService(db).list();
  const supplierOf = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

  const now = Date.now();
  const pending: PendingPurchase[] = orders.flatMap((order) => {
    if (!order) return [];
    const rows = byOrder.get(order.id) ?? [];
    return [
      {
        purchaseOrderId: order.id,
        referenceNo: order.referenceNo,
        supplierName: supplierOf.get(order.supplierId) ?? 'Tedarikçi çözülemedi',
        lineCount: rows.length,
        // Eksik kalem sayısı = bu listede duran satırlar (tamamlananlar zaten süzülmüş).
        missingLineCount: rows.length,
        // Yaş GÖNDERİM tarihinden: taslak sipariş bir bekleyiş değil, bizim kararımız.
        // `sentAt` yoksa `null` — "0 gün" yazmak bugün gönderilmiş göstermek olurdu (`CLAUDE §1`).
        ageDays: order.sentAt ? Math.floor((now - new Date(order.sentAt).getTime()) / 86_400_000) : null,
        isPartial: order.status === 'partially_received',
      },
    ];
  });

  // En eski önce: 14 gündür bekleyen sipariş listenin dibinde kaybolmamalı.
  pending.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));

  const warehouses = scope.kind === 'all' ? await new WarehouseService(db).list({ activeOnly: true }) : [];
  const singleId = scope.kind === 'limited' && scope.warehouseIds.length === 1 ? (scope.warehouseIds[0] ?? null) : null;
  const single = singleId ? await new WarehouseService(db).getById(singleId) : null;

  return {
    pending,
    warehouseId: singleId,
    warehouseName: single?.name ?? null,
    warehouseOptions: warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
    // Aynı okumadan: tedarikçi adları hem bekleyen kartlarda hem siparişsiz kabulün seçicisinde
    // kullanılıyor, ikinci bir tur açmaya gerek yok.
    suppliers: suppliers.filter((supplier) => supplier.isActive).map((supplier) => ({ id: supplier.id, name: supplier.name })),
  };
}
