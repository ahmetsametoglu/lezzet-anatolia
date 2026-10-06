'use server';

import {
  CategoryService,
  LOT_SEARCH_LIMIT,
  OrderItemBatchService,
  PriceService,
  ProductService,
  SettingsService,
  StockMovementService,
  StockService,
  UserProfileService,
  WarehouseVariantThresholdService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, WarehouseVariantThresholdSchema, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireStaff, requireWarehouseScope } from '@/lib/guard';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readReceivedIntakes } from './intake-read';
import { focusDepotOf, readActorNames, readDepotThresholds, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';
import type { LossRow, RecallResult, ReceivedIntake, StockLevelRow } from './stock-types';

// Stok ekranı eylemleri: önce kapı, sonra servis ya da motor, sonuç `{ data, error }` döner. Teklif yazımı fiyat ekranıyla
// ortak olduğu için `lib/stock/offer-actions`ta durur.

/**
 * Geri çağırma sorgusu: lot numarası partileri, partiler hazırlık kayıtları üzerinden siparişleri bulur. Boş sonuç da cevaptır
 * ("bu partiden hiç mal çıkmamış") ve ekran onu söyler.
 */
export async function recallByLotAction(lot: string): Promise<ActionResult<RecallResult>> {
  try {
    await requireStaff();
    const term = lot.trim();
    if (!term) throw new Error('Lot numarası girilmeli.');

    const db = serviceDb();
    const [batchRows, thresholds] = await Promise.all([
      new StockService(db).findByLot(term),
      readExpiryThresholds(new SettingsService(db)),
    ]);
    const batches = toBatchViews(batchRows, { now: new Date(), thresholds });
    const hits = await new OrderItemBatchService(db).recallByStocks(batches.map((b) => b.id));

    return {
      data: { batches, hits, truncated: batchRows.length >= LOT_SEARCH_LIMIT },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Stok seviyesi listesinin sonraki sayfası; süzgeçler adresten okunur ki devam sayfası ilk sayfayla aynı ölçüte uysun. Partiler
 * yalnız yeni sayfanın boyları için okunur, çünkü ilk okuma eldeki partilerin hepsini zaten getirmişti.
 */
export async function loadMoreLevelsAction(
  search: string,
  cursor: KeysetCursor,
): Promise<ActionResult<{ levels: StockLevelRow[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireStaff();
    const urlState = parseStockUrl(Object.fromEntries(new URLSearchParams(search)));

    const db = serviceDb();
    const stockSvc = new StockService(db);
    const [page, categories, thresholds] = await Promise.all([
      new ProductService(db).listStockRows({ filters: toStockFilters(urlState), cursor, limit: DEFAULT_PAGE_SIZE }),
      new CategoryService(db).list(),
      readExpiryThresholds(new SettingsService(db)),
    ]);

    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));
    const ctx = await readWarehouseContext();
    const warehouse = warehouseFilterOf(ctx, urlState.depo);
    const [batchRows, available, warehouseLabels, depot] = await Promise.all([
      // Parti listesi BAĞLAMLA okunur, süzgeçle değil — ilk sayfayla aynı kural (kural 5).
      // `undefined` = depo-üstü ve yalnız admin/muhasebede oluşur.
      stockSvc.listInStockDetailed(variantIds, ctx.warehouseIds),
      stockSvc.listAvailableAcross(warehouse.active ? [warehouse.active.id] : ctx.visibleWarehouseIds, variantIds),
      readWarehouseLabels(),
      readDepotThresholds(db, focusDepotOf(ctx, warehouse.active), page.rows),
    ]);

    const now = new Date();
    const undecided = toBatchViews(batchRows, { now, thresholds, warehouseLabels });
    const attentionVariantIds = [
      ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
    ];
    const priceMap = await new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c');
    const listPriceCents = new Map(
      [...priceMap].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice.amountCents] as const] : [])),
    );

    // Satır süzgeci görür (ilk sayfayla aynı hesap); sayaçlar bu yolda zaten üretilmiyor.
    const priced = toBatchViews(batchRows, { now, thresholds, listPriceCents, warehouseLabels });
    const levels = toLevelRows({
      products: page.rows,
      batches: warehouse.active ? priced.filter((b) => b.warehouseId === warehouse.active?.id) : priced,
      available,
      categoryNames: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
      warehouseLabels,
      depot,
    });
    return { data: { levels, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

const DepotThresholdInputSchema = WarehouseVariantThresholdSchema.extend({
  minStockQty: WarehouseVariantThresholdSchema.shape.minStockQty.nullable(),
});

/** Deponun eşik istisnasını yazar; `null` istisnayı kaldırır ve depo varyantın varsayılan eşiğine döner. */
export async function setDepotThresholdAction(input: {
  warehouseId: string;
  variantId: string;
  minStockQty: number | null;
}): Promise<ActionResult> {
  try {
    await requireWarehouseScope(input.warehouseId);
    const { warehouseId, variantId, minStockQty } = DepotThresholdInputSchema.parse(input);
    const thresholds = new WarehouseVariantThresholdService(serviceDb());
    if (minStockQty === null) await thresholds.clear(warehouseId, variantId);
    else await thresholds.set({ warehouseId, variantId, minStockQty });
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kabul defterinin sonraki sayfası; kapsam ve para yetkisi burada yeniden çözülür, istemciden gelmez. İmleci elle değiştiren biri
 * en fazla başka bir sayfa ister, başka deponun defterini ya da gizlenmiş tutarı alamaz.
 */
export async function loadMoreReceivedAction(
  cursor: KeysetCursor,
): Promise<ActionResult<{ received: ReceivedIntake[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireStaff();
    const ctx = await readWarehouseContext();
    const page = await readReceivedIntakes({
      warehouseIds: ctx.warehouseIds,
      canSeeCost: ctx.scope.kind === 'all',
      cursor,
    });
    return { data: { received: page.rows, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** İmha/fire geçmişinin sonraki sayfası — liste zamanla sınırsız büyür, imleçle ilerler. */
export async function loadMoreLossesAction(
  search: string,
  cursor: KeysetCursor,
): Promise<ActionResult<{ losses: LossRow[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireStaff();
    // Dönem adresten okunur: devam eden sayfa ilk sayfayla AYNI aralığı görmezse liste ile toplam
    // sessizce ayrışır — "bu çeyrek 366 €" yazan başlığın altına geçen yılın kayıtları eklenirdi.
    const { period } = parseStockUrl(Object.fromEntries(new URLSearchParams(search)));
    const db = serviceDb();
    const svc = new StockMovementService(db);
    // Depo süzgeci ilk sayfayla aynıdır; devam sayfası daha geniş evren görseydi kaydırdıkça başka depoların kayıtları sızardı.
    const ctx = await readWarehouseContext();
    const page = await svc.listRecent({
      from: periodStart(period, new Date()),
      cursor,
      limit: DEFAULT_PAGE_SIZE,
      warehouseIds: ctx.warehouseIds,
      // Yön de ilk sayfayla aynıdır; sekme yalnız çıkışları gösterir, süzgeç düşseydi kaydırdıkça girişler sızardı.
      direction: 'out',
    });
    const [actorNames, warehouseLabels] = await Promise.all([
      readActorNames(new UserProfileService(db), page.rows),
      readWarehouseLabels(),
    ]);
    return {
      data: { losses: toLossRows(page.rows, actorNames, warehouseLabels), nextCursor: page.nextCursor },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
