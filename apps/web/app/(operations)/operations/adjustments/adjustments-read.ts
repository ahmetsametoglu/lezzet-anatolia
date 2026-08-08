import 'server-only';
import { StockAdjustmentDetailService, StockService, WarehouseService, serviceDb } from '@lezzet/database';
import type { WarehouseScope } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import type { AdjustmentsData, BatchOption, TodayEntry } from './adjustments-types';

/** Şeridin tavanı — bir günün düzeltmeleri doğal tavanlı ama sonsuz değil. */
const TODAY_LIMIT = 30;

/**
 * **Stoktan düşme masasının okuması** (10.5) — `design/project/Operasyon - Depo Imha Sayim.dc.html`.
 *
 * ── PARA OKUNMUYOR ──────────────────────────────────────────────────────────
 * Kayıt satırında `unitCost` var (fire raporu onu kullanıyor, 12.x) ama bu görünüme HİÇ
 * taşınmıyor: tasarımın kuralı *"fire maliyeti/parasal değer asla görünmez"*. Alanı burada
 * susturmak, ekranda unutmaktan güvenli — ekran isteseydi bile gösteremez.
 *
 * ── PARTİLER DEPO KAPSAMINDAN ───────────────────────────────────────────────
 * Depocu yalnız kendi deposunun partisini düşebilir; başka deponun malını buradan eksiltmek,
 * olmayan bir rafı saymak olurdu (`DOMAIN §17`).
 */
export async function readAdjustments(scope: WarehouseScope): Promise<AdjustmentsData> {
  const db = serviceDb();
  const warehouseIds = scope.kind === 'limited' ? [...scope.warehouseIds] : undefined;
  const singleId = scope.kind === 'limited' && scope.warehouseIds.length === 1 ? (scope.warehouseIds[0] ?? null) : null;

  const [details, warehouse] = await Promise.all([
    // Eldeki partiler (fiziksel adedi sıfırdan büyük olanlar, son tarihe göre sıralı).
    new StockService(db).listInStockDetailed(undefined, warehouseIds),
    singleId ? new WarehouseService(db).getById(singleId) : Promise.resolve(null),
  ]);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const batches: BatchOption[] = details.map((batch) => ({
    stockId: batch.id,
    title: titleOf(
      resolveLocalizedText(batch.variant.product.name, OPERATIONS_LOCALE) || 'Adsız ürün',
      resolveLocalizedText(batch.variant.label, OPERATIONS_LOCALE),
    ),
    expiryDate: batch.expiryDate,
    physicalQty: batch.physicalQty,
    // Son tarihi GEÇMİŞ parti listede kalır ve işaretlenir: düşülecek ilk şey odur, gizlenmesi
    // tam ters etki yapardı.
    isExpired: new Date(batch.expiryDate) < startOfDay,
  }));

  /**
   * Bugünün kayıtları — *"girdim mi girmedim mi"* belirsizliği kalmasın (tasarım §2).
   *
   * **Tavan GÖRÜNÜR, sessiz değil:** okuma keyset sayfalı ve `nextCursor` dönüyor. Bu şerit
   * doğal tavanlı bir liste sayılıyor (bir günün düzeltmeleri, `CLAUDE §1`) ama çok düzeltme
   * girilen bir depoda imleç gerçekten dolabilir — arka uç şeridi bunu ayrıca uyardı. Kuyruğu
   * sessizce yutmuyoruz: ekran son N kaydı gösterdiğini yazıyor (`hasMore`).
   */
  const page = await new StockAdjustmentDetailService(db).listPage({ from: startOfDay, limit: TODAY_LIMIT });
  const entries: TodayEntry[] = page.rows.map((row) => ({
    id: row.id,
    title: titleOf(
      resolveLocalizedText(row.stock.variant.product.name, OPERATIONS_LOCALE) || 'Adsız ürün',
      resolveLocalizedText(row.stock.variant.label, OPERATIONS_LOCALE),
    ),
    qty: Math.abs(row.qty),
    reason: row.reason,
    referenceNo: row.referenceNo,
    time: new Date(row.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  }));

  return {
    batches,
    today: entries,
    // Tavan doldu mu — ekran "son N kayıt" diyebilsin diye. Sessiz kırpma, olmayan bir tamlık
    // sözü vermek olurdu.
    todayTruncated: page.nextCursor !== null,
    warehouseId: singleId,
    warehouseName: warehouse?.name ?? null,
  };
}
