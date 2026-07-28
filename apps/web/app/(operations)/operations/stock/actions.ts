'use server';

import { revalidatePath } from 'next/cache';
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
import { needsExpiryAttention, offerDecisionOf } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type KeysetCursor } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readActorNames, readExpiryThresholds, toBatchViews, toLevelRows, toLossRows } from './stock-read';
import { parseStockUrl, periodStart, toStockFilters, STOCK_PATH } from './stock-url';
import type { LossRow, RecallResult, StockLevelRow } from './stock-types';

// Stok ekranı server action'ları — 'use server' + requireStaff ilk + servise/motora devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.
//
// KARAR BURADA VERİLMEZ: "bu parti teklife açılabilir mi" sorusunu motor yanıtlar (`offerDecisionOf`).
// Action yalnız o cevabı UYGULAR — sunucu tarafında da uygular, çünkü ekranın düğmeyi gizlemesi bir
// güvence değildir: eski bir sekme, tarihi bugün geçmiş bir partiye teklif açmayı deneyebilir.

/**
 * Partiyi teklife açar / teklif fiyatını günceller. `null` fiyat teklifi KAPATIR.
 *
 * DLC'si geçmiş partide teklif açılamaz ve bu kapı sunucudadır: güvenlik kuralı ekranın iyi niyetine
 * bırakılmaz. Kapatma her hâlde serbesttir — yanlışlıkla açılmış bir teklifin geri alınması hiçbir
 * koşulda engellenmemeli.
 */
export async function setOfferPriceAction(stockId: string, offerPrice: number | null): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = serviceDb();
    const stockSvc = new StockService(db);

    if (offerPrice !== null) {
      if (offerPrice <= 0) throw new Error('Teklif fiyatı sıfırdan büyük olmalı.');
      const [[batch], thresholds] = await Promise.all([
        stockSvc.getBatchDetails([stockId]),
        readExpiryThresholds(new SettingsService(db)),
      ]);
      if (!batch) throw new Error('Parti bulunamadı.');
      const { decision } = offerDecisionOf({
        dateType: batch.variant.product.dateType,
        expiryDate: batch.expiryDate,
        shelfLifeDays: batch.variant.product.shelfLifeDays,
        // Açık teklifi YOK SAYARAK sorulur: burada sorulan "teklif var mı" değil, "bu partiye teklif
        // açılabilir mi". Var olan teklif cevabı `offer_open`'a çevirir ve güncelleme imkânsızlaşırdı.
        offerPriceCents: null,
        nearExpiryPercent: thresholds.nearExpiryPercent,
      });
      if (decision === 'must_discard') {
        throw new Error('Son tüketim tarihi (DLC) geçmiş parti satılamaz — teklif açılamaz, yalnız imha edilir.');
      }
    }

    await stockSvc.setOfferPrice(stockId, offerPrice);
    revalidatePath(STOCK_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

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
