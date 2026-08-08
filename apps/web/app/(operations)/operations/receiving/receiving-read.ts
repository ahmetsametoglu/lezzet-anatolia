import 'server-only';
import { PurchaseOrderService, SupplierService, serviceDb } from '@lezzet/database';
import { readWarehouseContext, readWorkWarehouse } from '@/lib/warehouse/context';
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
 * Tasarımın kuralı: *"Depo süzgeci yok — depocu kendi evreninde çalışır."* Liste gerçekten
 * depo-üstüdür ve öyle kalmalı: **tedarik siparişi bir depoya ait değildir**, mal kabul edilirken
 * bir kapıdan girer. Depo sorusu bu yüzden okumanın değil, YAZMANIN sorusu — cevabı bitirme
 * diyaloğunda veriliyor ve **ön seçim üretilmiyor**.
 *
 * ── SEÇENEKLER KAPSAMDAN GELİR, YALNIZ YÖNETİCİDEN DEĞİL (10.7) ─────────────
 * Eskiden seçenek listesi yalnız `all` kapsamda doluyordu; kapsamı İKİ depolu bir depocuda hem
 * sabit depo (`null`) hem seçenekler (`[]`) boş kalıyordu ve bitirme diyaloğu kalıcı olarak
 * *"Kabul edilecek depoyu seçin"* diyordu — seçecek bir şey göstermeden. Yani o kişi kabulü hiç
 * tamamlayamıyordu ve hiçbir yerde hata görünmüyordu. Seçenekler artık bağlamın kapsamla süzülmüş
 * depo listesinden geliyor; üst barda bir depo seçilmişse soru zaten cevaplanmıştır.
 */
export async function readReceiving(): Promise<ReceivingData> {
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

  // Bağlam iki soruyu birden cevaplıyor: "kabul hangi kapıdan" (seçilmişse) ve "seçilmemişse hangi
  // kapılar açık". İkinci okuma yok — `readWarehouseContext` istek başına önbellekli (`cache()`).
  const [workplace, ctx] = await Promise.all([readWorkWarehouse(), readWarehouseContext()]);

  return {
    pending,
    warehouseId: workplace.status === 'ok' ? workplace.warehouseId : null,
    warehouseName: workplace.status === 'ok' ? workplace.name : null,
    warehouseOptions: ctx.warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name })),
    // Aynı okumadan: tedarikçi adları hem bekleyen kartlarda hem siparişsiz kabulün seçicisinde
    // kullanılıyor, ikinci bir tur açmaya gerek yok.
    suppliers: suppliers.filter((supplier) => supplier.isActive).map((supplier) => ({ id: supplier.id, name: supplier.name })),
  };
}
