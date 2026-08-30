import type { SupabaseClient } from '@supabase/supabase-js';
import { PriceService, SettingsService, StockService, WarehouseService } from '@lezzet/database';
import { offerDecisionOf } from '@lezzet/domain-core';
import type { OfferCandidate, Stock } from '@lezzet/types';
import { readExpiryThresholds, toBatchViews } from './batch-view';

/*
  YAKIN-SKT TEKLİF KAPISI (21.12 · Y3) — aday listesi + teklife açma.

  ── TEK MOTOR, İKİ YÜZEY ────────────────────────────────────────────────────
  "Bu partiye teklif açılabilir mi" sorusunun cevabı `offerDecisionOf`ta ve TEK yerde. Web'in
  `setOfferPriceAction`ı da bu kapıyı çağırır (terfi 26.08): DLC kuralı iki yüzeyde iki kez
  yazılsaydı bir gün yalnız birinde değişirdi — ve öteki yüzey son tarihi geçmiş malı satardı.

  ── OLUMSUZ SONUÇ FIRLATILMAZ, ADLANDIRILIR ─────────────────────────────────
  `not_found` ekran bayatlığıdır (parti tükenmiş/silinmiş), `must_discard` yasağın kendisi (DLC
  geçmiş mal SATILAMAZ, yalnız imha). İkisi de çağıranın müşterisine söyleyeceği cümledir;
  exception'a çevrilirse geriye "bir hata oluştu" kalır (web `TicketWriteResult` deseni).
*/

/**
 * Teklif adayları — verilen depolardaki, raf ömrü motoru "teklife açılabilir" dediği ve HENÜZ
 * teklifte olmayan partiler. Öneri fiyatı b2c liste fiyatından, ayarın indirim yüzdesiyle türer;
 * liste fiyatı yoksa öneri `null` (uydurulmaz — operatör elle yazar).
 */
export async function listOfferCandidates(
  db: SupabaseClient,
  input: { warehouseIds: readonly string[]; now?: Date },
): Promise<OfferCandidate[]> {
  if (input.warehouseIds.length === 0) return [];
  const now = input.now ?? new Date();

  const [rows, thresholds, warehouses] = await Promise.all([
    new StockService(db).listInStockDetailed(undefined, input.warehouseIds),
    readExpiryThresholds(new SettingsService(db)),
    new WarehouseService(db).list({ warehouseIds: input.warehouseIds }),
  ]);
  if (rows.length === 0) return [];

  const listPriceCents = new Map<string, number>();
  const priceMap = await new PriceService(db).findApplicableMap(
    [...new Set(rows.map((row) => row.variantId))],
    'b2c',
    null,
    now,
  );
  for (const [variantId, price] of priceMap) {
    if (price.channelPrice) listPriceCents.set(variantId, price.channelPrice.amountCents);
  }

  const views = toBatchViews(rows, {
    now,
    thresholds,
    listPriceCents,
    warehouseLabels: new Map(warehouses.map((w) => [w.id, { code: w.code, name: w.name }])),
  });

  return views
    .filter((view) => view.decision === 'can_offer')
    .map((view) => ({
      stockId: view.id,
      title: view.title,
      lotNumber: view.lotNumber ?? null,
      qty: view.physicalQty,
      daysLeft: view.daysLeft,
      remainingPercent: view.remainingPercent,
      listPriceCents: view.listPriceCents,
      suggestedCents: view.suggestedOfferCents,
      offerDiscountPercent: view.offerDiscountPercent,
      warehouse: view.warehouse,
    }));
}

export type OpenBatchOfferOutcome =
  | { status: 'ok'; stock: Stock }
  | { status: 'not_found' }
  | { status: 'must_discard' };

/**
 * Partiyi teklife açar / teklif fiyatını günceller; `null` fiyat teklifi KAPATIR.
 *
 * Kapatma her hâlde serbesttir — yanlışlıkla açılmış bir teklifin geri alınması hiçbir koşulda
 * engellenmemeli. Açarken DLC kapısı SUNUCUDADIR: ekranın düğmeyi gizlemesi bir güvence değildir;
 * eski bir sekme, tarihi bugün geçmiş bir partiye teklif açmayı deneyebilir (web action künyesi).
 *
 * Fiyatın pozitifliği sözleşmenin işi (`OfferOpenRequestSchema.positive`) — burada tekrar
 * doğrulanmaz; şemasız çağıran zaten bu kapıya ulaşmamalı.
 */
export async function openBatchOffer(
  db: SupabaseClient,
  input: { stockId: string; offerPriceCents: number | null },
): Promise<OpenBatchOfferOutcome> {
  const stocks = new StockService(db);

  if (input.offerPriceCents !== null) {
    const [[batch], thresholds] = await Promise.all([
      stocks.getBatchDetails([input.stockId]),
      readExpiryThresholds(new SettingsService(db)),
    ]);
    if (!batch) return { status: 'not_found' };
    const { decision } = offerDecisionOf({
      dateType: batch.variant.product.dateType,
      expiryDate: batch.expiryDate,
      shelfLifeDays: batch.variant.product.shelfLifeDays,
      // Açık teklifi YOK SAYARAK sorulur: soru "teklif var mı" değil, "açılabilir mi" — var olan
      // teklif cevabı `offer_open`a çevirir ve güncelleme imkânsızlaşırdı (web action künyesi).
      offerPriceCents: null,
      now: new Date(),
      nearExpiryPercent: thresholds.nearExpiryPercent,
    });
    if (decision === 'must_discard') return { status: 'must_discard' };
  }

  const stock = await stocks.setOfferPrice(input.stockId, input.offerPriceCents);
  return { status: 'ok', stock };
}
