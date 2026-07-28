import {
  meetsMlor,
  daysToExpiry,
  needsExpiryAttention,
  offerDecisionOf,
  suggestedOfferPriceCents,
} from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText, type ProductStockRow, type StockAdjustmentDetail, type StockBatchDetail } from '@lezzet/types';
import { titleOf, type BatchView, type LossRow, type StockLevelRow } from './stock-types';

// DB satırı → view-model indirgemesi. RSC ve server action'lar bunu PAYLAŞIR: ilk sayfa ile sonraki
// sayfalar (ve lot sorgusunun sonucu) aynı şekli üretsin diye tek yerde durur.
//
// KARARLAR BURADA SORULUR, BURADA VERİLMEZ: her satır `domain-core/stock`'a danışır. Uygulama katmanı
// motoru veriyle buluşturur (STACK §4) — eşiği kendi kurmaz, yüzdeyi kendi hesaplamaz.

/**
 * Partileri karara bağlar. `now` DIŞARIDAN verilir: aynı okumanın tüm satırları AYNI ana göre
 * değerlendirilsin (istek ortasında gün dönerse yarısı "yaklaşan", yarısı "geçmiş" görünürdü).
 *
 * Fiyat haritası isteğe bağlı — teklif önerisi yalnız karar bekleyen partiler için okunuyor, geri
 * kalanında `listPriceCents` null kalır ve o satır zaten öneri göstermiyor.
 */
export function toBatchViews(
  rows: StockBatchDetail[],
  opts: { now: Date; listPriceCents?: Map<string, number> },
): BatchView[] {
  return rows.map((row) => {
    const product = row.variant.product;
    const productName = resolveLocalizedText(product.name);
    const variantLabel = resolveLocalizedText(row.variant.label);
    const offerPriceCents = row.offerPrice === null ? null : toCents(row.offerPrice);

    const { decision, flag, remainingPercent } = offerDecisionOf({
      dateType: product.dateType,
      expiryDate: row.expiryDate,
      shelfLifeDays: product.shelfLifeDays,
      offerPriceCents,
      now: opts.now,
    });

    // MLOR: partinin GİRİŞTEKİ ömrü değil, bugünkü ömrü ölçülüyor — giriş tarihi ayrıca tutulmuyor.
    // Bu yüzden işaret "kısa ömürlü geldi" değil, "kısa ömürlü DURUYOR" der; teklif kararına bağlam
    // olarak ikisi de aynı işi görür ve uydurma bir giriş anı varsaymaz.
    const listPriceCents = opts.listPriceCents?.get(row.variantId) ?? null;

    return {
      ...row,
      title: titleOf(productName, variantLabel),
      productName,
      variantLabel,
      flag,
      decision,
      remainingPercent,
      daysLeft: daysToExpiry(row.expiryDate, opts.now),
      belowMlor: !meetsMlor(row.expiryDate, product.shelfLifeDays, opts.now).ok,
      listPriceCents,
      suggestedOfferCents: suggestedOfferPriceCents(listPriceCents),
      offerPriceCents,
      purchasePriceCents: row.purchasePrice === null ? null : toCents(row.purchasePrice),
    };
  });
}

/**
 * Ürün sayfasını + partileri + kullanılabilirliği stok seviyesi satırlarına indirger.
 *
 * Satır BOYDUR: bir ürünün üç boyu üç satır olur. Partiler varyant kimliğine göre eşlenir; eşleşme
 * bulunamayan boy da listede kalır ("stok yok" da bir cevaptır — gizlenirse operatör ürünün hiç
 * girilmediğini fark edemez).
 */
export function toLevelRows(
  products: ProductStockRow[],
  batches: BatchView[],
  available: Map<string, { physicalQty: number; reservedQty: number; availableQty: number }>,
  categoryNames: Map<string, string>,
): StockLevelRow[] {
  const byVariant = new Map<string, BatchView[]>();
  for (const b of batches) {
    const list = byVariant.get(b.variantId);
    if (list) list.push(b);
    else byVariant.set(b.variantId, [b]);
  }

  const rows: StockLevelRow[] = [];
  for (const p of products) {
    const productName = resolveLocalizedText(p.name);
    for (const v of p.variants) {
      // Partiler son tarihe göre sıralı geldi (FEFO sırası) → ilki en yakın olandır.
      const own = byVariant.get(v.id) ?? [];
      const stock = available.get(v.id) ?? { physicalQty: 0, reservedQty: 0, availableQty: 0 };
      const variantLabel = resolveLocalizedText(v.label);
      rows.push({
        variantId: v.id,
        productId: p.id,
        productName,
        variantLabel,
        title: titleOf(productName, variantLabel),
        categoryName: (p.categoryId && categoryNames.get(p.categoryId)) || '—',
        status: p.status,
        variantActive: v.isActive,
        physicalQty: stock.physicalQty,
        reservedQty: stock.reservedQty,
        availableQty: stock.availableQty,
        minStockQty: v.minStockQty,
        // Eşik yoksa "altında" da yoktur; 0 eşik "her zaman yeter" demektir, uyarı üretmez.
        belowMin: v.minStockQty !== null && v.minStockQty > 0 && stock.availableQty < v.minStockQty,
        batches: own,
        nearest: own[0] ?? null,
        attentionCount: own.filter((b) => needsExpiryAttention(b.decision)).length,
      });
    }
  }
  return rows;
}

/** İmha/fire kayıtlarını ekran satırına indirger — maliyet cent'e, ad çözülmüş. */
export function toLossRows(rows: StockAdjustmentDetail[]): LossRow[] {
  return rows.map((row) => {
    const productName = resolveLocalizedText(row.stock.variant.product.name);
    const variantLabel = resolveLocalizedText(row.stock.variant.label);
    return {
      ...row,
      title: titleOf(productName, variantLabel),
      // İşaret KORUNUR: geri ekleme (negatif) maliyeti de negatif çıkar, net kayıp doğru toplanır.
      costCents: row.unitCost === null ? null : toCents(row.unitCost) * row.qty,
    };
  });
}
