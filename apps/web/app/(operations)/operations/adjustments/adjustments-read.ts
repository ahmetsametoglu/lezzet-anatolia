import 'server-only';
import { StockService, WarehouseService, serviceDb } from '@lezzet/database';
import type { WarehouseScope } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import type { AdjustmentsData, BatchOption, TodayEntry } from './adjustments-types';

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
   * **Bugünün kayıtları BUGÜN OKUNAMIYOR** ve boş dizi bir veri değil, bir BOŞLUK.
   *
   * Okumanın kapısı `StockAdjustmentDetailService.listPage` (ürün adı ve parti künyesi gömülü
   * geliyor) ama sınıf `@lezzet/database`ten **dışa verilmemiş** — `StockAdjustmentService` var,
   * detay sınıfı yok. Paket başka şeridin alanı; export'u kendim eklemedim, talep açtım
   * (`docs/talep/arka-uc-stok-duzeltme-detay-servisi-export.md`).
   *
   * Elimdeki `StockAdjustmentService.listByStock` parti bazlı — "bugün ne düştüm" sorusunun cevabı
   * değil ve her parti için ayrı çağrı N+1 olurdu. Uydurma bir liste (ör. yalnız son kayıt) da
   * çizilmedi: tasarımın bu bölümünün bütün amacı *"girdim mi girmedim mi"* belirsizliğini
   * kaldırmak; yarım bir liste o belirsizliği kaldırmaz, gizler.
   * BEKLEYEN(10.5)
   */
  const entries: TodayEntry[] = [];

  return {
    batches,
    today: entries,
    warehouseId: singleId,
    warehouseName: warehouse?.name ?? null,
  };
}
