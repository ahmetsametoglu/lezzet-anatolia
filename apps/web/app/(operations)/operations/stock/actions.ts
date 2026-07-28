'use server';

import {
  CategoryService,
  LOT_SEARCH_LIMIT,
  OrderService,
  PriceService,
  ProductService,
  SettingsService,
  StockAdjustmentService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { needsExpiryAttention } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readExpiryThresholds, toBatchViews } from '@/lib/stock/batch-view';
import { readActorNames, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, periodStart, toStockFilters } from './stock-url';
import type { LossRow, RecallResult, StockLevelRow } from './stock-types';

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
    const hits = await new OrderService(db).recallByStocks(batches.map((b) => b.id));

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
    const [batchRows, available] = await Promise.all([
      stockSvc.listInStockDetailed(variantIds),
      stockSvc.getAvailableMap(variantIds),
    ]);

    const now = new Date();
    const undecided = toBatchViews(batchRows, { now, thresholds });
    const attentionVariantIds = [
      ...new Set(undecided.filter((b) => needsExpiryAttention(b.decision)).map((b) => b.variantId)),
    ];
    const priceMap = await new PriceService(db).findApplicableMap(attentionVariantIds, 'b2c');
    const listPriceCents = new Map(
      [...priceMap].flatMap(([id, { channelPrice }]) =>
        channelPrice ? [[id, toCents(channelPrice.amount)] as const] : [],
      ),
    );

    const levels = toLevelRows(
      page.rows,
      toBatchViews(batchRows, { now, thresholds, listPriceCents }),
      available,
      new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
    );
    return { data: { levels, nextCursor: page.nextCursor }, error: null };
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
    const page = await svc.listRecent({ from: periodStart(period, new Date()), cursor, limit: DEFAULT_PAGE_SIZE });
    const actorNames = await readActorNames(new UserProfileService(db), page.rows);
    return { data: { losses: toLossRows(page.rows, actorNames), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
