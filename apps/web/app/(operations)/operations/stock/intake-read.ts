import 'server-only';
import {
  PurchaseOrderService,
  StockIntakeService,
  StockService,
  StorageAreaService,
  SupplierService,
  serviceDb,
} from '@lezzet/database';
import type {
  KeysetCursor,
  PurchaseOrderProgress,
  PurchaseOrderStatus,
  StockIntake,
} from '@lezzet/types';
import { readWarehouseContext, readWarehouseLabels, readWorkWarehouse } from '@/lib/warehouse/context';
import type { IntakeTabData, PendingPurchase, ReceivedIntake } from './stock-types';

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

/**
 * **Kabul edilenler defteri** (22.28) — ilk sayfa ve "daha fazla" AYNI yoldan geçer.
 *
 * İki okuma yolu olsaydı biri gün gelir ötekinden ayrışırdı: birinde para süzülür ötekinde
 * süzülmez, birinde depo süzgeci vardır ötekinde yoktur. Sayfalamanın sessiz kırpması da tam
 * böyle doğar (`CLAUDE §1` — sayfalayan her okumanın tüketeni olmalı).
 *
 * ── SÜZGEÇ `ctx.warehouseIds`, `visibleWarehouseIds` DEĞİL ──────────────────
 * İkisi karıştırılabilir ve fark tam da BURADA görünür: `visibleWarehouseIds` bir kırılım evreni
 * ve yalnız AKTİF depoları taşıyor. Defter ise GEÇMİŞTİR — kapatılmış bir tesise yapılmış eski
 * kabul, tesis kapandı diye olmamış sayılamaz. Bağlamın kendi künyesi de bunu yazıyor:
 * *"Bunu bir süzgeç yerine KOYMA."*
 *
 * Süzgeç bekleyenler listesinden AYRI davranıyor ve bu bilinçli: tedarik siparişi bir depoya ait
 * değildir (depo-üstü), ama kabul bir kapıya yazılır — deposu vardır. Yani üst bardaki seçim
 * defteri daraltır, tıpkı ekranın partileri ve sayaçları gibi.
 *
 * ── PARA KAPSAMLA GELİR, EKRAN DİSİPLİNİYLE DEĞİL ───────────────────────────
 * `canSeeCost` false ise alan hiç doldurulmaz (`null`). Süzmeyi ekrana bırakmak, veriyi tarayıcıya
 * göndermenin en sessiz yoluydu — depocunun HTML kaynağında alış toplamı dururdu.
 */
export async function readReceivedIntakes(opts: {
  /** `undefined` = depo-üstü kapsam (yönetici); dizi = o depolar; boş dizi = hiçbiri. */
  warehouseIds: readonly string[] | undefined;
  canSeeCost: boolean;
  cursor?: KeysetCursor;
  /** Zaten okunmuş tedarikçi adları — sekme turunda ikinci kez okunmasın diye. */
  supplierNames?: Map<string, string>;
}): Promise<{ rows: ReceivedIntake[]; nextCursor: KeysetCursor | null }> {
  const db = serviceDb();
  const page = await new StockIntakeService(db).listRecent({
    warehouseIds: opts.warehouseIds,
    cursor: opts.cursor,
  });
  if (page.rows.length === 0) return { rows: [], nextCursor: page.nextCursor };

  // Sayfa başına ÜÇ tur, satır başına değil: künyeler yalnız BU sayfanın kimlikleri için okunur.
  const purchaseIds = [...new Set(page.rows.flatMap((row) => (row.purchaseOrderId ? [row.purchaseOrderId] : [])))];
  const [summary, purchases, suppliers, warehouses] = await Promise.all([
    new StockService(db).summaryByIntake(page.rows.map((row) => row.id)),
    purchaseIds.length > 0 ? new PurchaseOrderService(db).listByIds(purchaseIds) : [],
    opts.supplierNames ?? new SupplierService(db).list().then((list) => new Map(list.map((s) => [s.id, s.name]))),
    readWarehouseLabels(),
  ]);

  const refOf = new Map(purchases.map((purchase) => [purchase.id, purchase.referenceNo]));
  const ctx = { summary, refOf, suppliers, warehouses, canSeeCost: opts.canSeeCost };
  return { rows: page.rows.map((row) => toReceived(row, ctx)), nextCursor: page.nextCursor };
}

/** Giriş kaydı → defter satırı. Tek yerde, iki okuma yolu yok (`toDetail` emsali). */
function toReceived(
  row: StockIntake,
  ctx: {
    summary: Map<string, { lineCount: number; qty: number }>;
    refOf: Map<string, string | null>;
    suppliers: Map<string, string>;
    warehouses: Map<string, { name: string }>;
    canSeeCost: boolean;
  },
): ReceivedIntake {
  // Özet YOKSA sıfır DEĞİL: partisi silinmiş bir giriş olamaz (FK), ama olsaydı "0 paket girdi"
  // yazmak bozuk bir kaydı sağlıklı göstermek olurdu. Sıfır burada gerçekten sıfırdır.
  const counted = ctx.summary.get(row.id) ?? { lineCount: 0, qty: 0 };
  return {
    id: row.id,
    date: row.date,
    createdAt: row.createdAt,
    supplierName: row.supplierId ? (ctx.suppliers.get(row.supplierId) ?? null) : null,
    purchaseRef: row.purchaseOrderId ? (ctx.refOf.get(row.purchaseOrderId) ?? null) : null,
    warehouseName: ctx.warehouses.get(row.warehouseId)?.name ?? null,
    lineCount: counted.lineCount,
    qty: counted.qty,
    note: row.note,
    totalAmountCents: ctx.canSeeCost ? row.totalAmountCents : null,
  };
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

  /**
   * Kabul formunun raf seçeneği (19.29) — **çalışılan deponun** alanları.
   *
   * Bağlam seçili değilse boş: mal hangi tesise girdiği belli olmadan bir rafa konamaz ve form
   * zaten depo seçilmeden kaydetmiyor. Yalnız AKTİF alanlar — kullanımdan kalkmış bir dolaba yeni
   * mal koymak, susturma kararını geri almak olurdu.
   */
  const storageAreas =
    workplace.status === 'ok'
      ? (await new StorageAreaService(db).listByWarehouse(workplace.warehouseId, { activeOnly: true })).map((area) => ({
          id: area.id,
          name: area.name,
          kind: area.kind,
        }))
      : [];

  // Defter tedarikçi haritasını PAYLAŞIYOR — kendi turunda ikinci kez okumasın diye. Kapsam ve
  // para yetkisi bağlamdan: ikisi de sunucuda çözülür, istemciye sorulmaz (`canSeeCost` künyesi).
  const received = await readReceivedIntakes({
    warehouseIds: ctx.warehouseIds,
    canSeeCost: ctx.scope.kind === 'all',
    supplierNames: new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
  });

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
    storageAreas,
    warehouseId: workplace.status === 'ok' ? workplace.warehouseId : null,
    received: received.rows,
    receivedCursor: received.nextCursor,
  };
}
