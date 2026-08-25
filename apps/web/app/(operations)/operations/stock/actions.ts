'use server';

import {
  CategoryService,
  LOT_SEARCH_LIMIT,
  OrderItemBatchService,
  PriceService,
  ProductService,
  SettingsService,
  StockAdjustmentService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { readWarehouseContext, readWarehouseLabels } from '@/lib/warehouse/context';
import { warehouseFilterOf } from '@/lib/warehouse/filter';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readReceivedIntakes } from './intake-read';
import { readActorNames, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';
import type { LossRow, RecallResult, ReceivedIntake, StockLevelRow } from './stock-types';

// Stok ekranı server action'ları — 'use server' + requireStaff ilk + servise/motora devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.
//
// Teklif YAZMA eylemi burada değil: iki ekranın ortak işi olduğu için `lib/stock/offer-actions`'a
// taşındı (fiyat ekranının near-expiry sekmesi aynı kararı verir).

/**
 * **Geri çağırma sorgusu** — lot numarasından siparişlere ve müşterilere.
 *
 * İki adım: numara partileri bulur, partiler hazırlık kayıtları üzerinden siparişleri bulur. Sonuç
 * boş dönebilir ve bu iyi haberdir ("bu partiden hiç mal çıkmamış"); ekran onu da söyler.
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
 * Stok seviyesi listesinin SONRAKİ sayfası. Süzgeçler adresten okunur (`search`), böylece devam eden
 * sayfa ilk sayfayla aynı ölçüte uyar — client'ın süzgeci ayrıca taşımasına gerek kalmaz.
 *
 * Partiler burada YALNIZ yeni sayfanın boyları için okunur: ilk okumada eldeki tüm partiler zaten
 * gelmişti, hepsini yeniden taşımak sayfa başına aynı yükü ikinci kez ödemek olurdu.
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
    const [batchRows, available, warehouseLabels] = await Promise.all([
      // Parti listesi BAĞLAMLA okunur, süzgeçle değil — ilk sayfayla aynı kural (kural 5).
      // `undefined` = depo-üstü ve yalnız admin/muhasebede oluşur.
      stockSvc.listInStockDetailed(variantIds, ctx.warehouseIds),
      stockSvc.listAvailableAcross(warehouse.active ? [warehouse.active.id] : ctx.visibleWarehouseIds, variantIds),
      readWarehouseLabels(),
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
    });
    return { data: { levels, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kabul defterinin sonraki sayfası** (22.28) — giriş kaydı hiç erimez, yalnız uzar.
 *
 * Kapsam ve para yetkisi burada YENİDEN çözülüyor, istemciden gelmiyor: imleci elle değiştiren
 * biri en fazla başka bir sayfa ister, başka bir deponun defterini ya da gizlenmiş tutarı alamaz.
 * Dönem süzgeci YOK ve gerekmiyor — bu defterin adres durumu ilk sayfayla aynı (`losses`teki
 * `period` gibi bir aralık taşımıyor), yani devam sayfası ilk sayfadan ayrışamaz.
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
    const svc = new StockAdjustmentService(db);
    // Depo süzgeci ilk sayfayla AYNI (22.28 turu): devam sayfası daha geniş bir evren görseydi
    // liste kaydırıldıkça başka depoların kayıtları sızardı — ve sızıntı yalnız aşağıda olurdu.
    const ctx = await readWarehouseContext();
    const page = await svc.listRecent({
      from: periodStart(period, new Date()),
      cursor,
      limit: DEFAULT_PAGE_SIZE,
      warehouseIds: ctx.warehouseIds,
    });
    const actorNames = await readActorNames(new UserProfileService(db), page.rows);
    return { data: { losses: toLossRows(page.rows, actorNames), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
