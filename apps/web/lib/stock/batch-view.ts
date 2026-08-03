import 'server-only';
import {
  MLOR_PERCENT,
  NEAR_EXPIRY_PERCENT,
  OFFER_DISCOUNT_PERCENT,
  daysToExpiry,
  meetsMlor,
  offerDecisionOf,
  suggestedOfferPriceCents,
} from '@lezzet/domain-core';
import { resolveLocalizedText, type StockBatchDetail } from '@lezzet/types';
import type { SettingsService } from '@lezzet/database';
import type { BatchView } from './batch-types';

// PARTİNİN KARARA BAĞLANMASI — İKİ ekranın ortak yeri (stok 09.13 · fiyatlar 09.5).
//
// Önce stok ekranının klasöründe yaşıyordu. Fiyat ekranının near-expiry sekmesi aynı görünüme
// ihtiyaç duyunca iki yol vardı: kopyalamak ya da taşımak. Kopya, eşik değiştiğinde iki ekranın
// FARKLI karar göstermesi demekti — "stokta imhalık görünen parti, fiyatlarda hâlâ teklife açık".
// Taşındı; kararın kendisi motorda (`domain-core/stock`), buradaki iş yalnız veriyi motorla
// buluşturmak (STACK §4).

/**
 * Raf ömrü eşikleri — **işletmenin kararı, kodun sabiti değil** (`Setting`, 0016). Motor üçünü de
 * parametre alır; ekran geçirmezse ayarı değiştiren operatör ekranın hâlâ eski eşikle karar
 * gösterdiğini fark edemez. Varsayılanlar motordan gelir, çağrı yerinde uydurulmaz.
 */
interface ExpiryThresholds {
  nearExpiryPercent: number;
  offerDiscountPercent: number;
  mlorPercent: number;
}

/**
 * Üç eşiği TEK yerde okur. `SettingsService` süreç içinde önbelleklidir — anahtar başına bir sorgu,
 * sonraki isteklerde sıfır. Kapsam verilmez: eşikler bugün global (kanala/bölgeye göre farklılaşan
 * bir raf ömrü ölçütü yok); gerekirse `SettingScopeContext` buradan geçirilir.
 */
export async function readExpiryThresholds(settings: SettingsService): Promise<ExpiryThresholds> {
  const [nearExpiryPercent, offerDiscountPercent, mlorPercent] = await Promise.all([
    settings.getNumber('near_expiry_percent', NEAR_EXPIRY_PERCENT),
    settings.getNumber('near_expiry_discount_percent', OFFER_DISCOUNT_PERCENT),
    settings.getNumber('mlor_percent', MLOR_PERCENT),
  ]);
  return { nearExpiryPercent, offerDiscountPercent, mlorPercent };
}

/**
 * Partileri karara bağlar. `now` DIŞARIDAN verilir: aynı okumanın tüm satırları AYNI ana göre
 * değerlendirilsin (istek ortasında gün dönerse yarısı "yaklaşan", yarısı "geçmiş" görünürdü).
 *
 * Fiyat haritası isteğe bağlı — teklif önerisi yalnız karar bekleyen partiler için okunuyor, geri
 * kalanında `listPriceCents` null kalır ve o satır zaten öneri göstermiyor.
 */
export function toBatchViews(
  rows: StockBatchDetail[],
  opts: {
    now: Date;
    thresholds: ExpiryThresholds;
    listPriceCents?: Map<string, number>;
    /**
     * Kimlik → depo adı/kodu (19.5). Verilmezse parti deposunu SÖYLEMEZ — yanlış depo söylemektense
     * susmak doğrudur: parti her zaman tek depodadır ve o depoyu karıştırmak, malın başka şehirde
     * olduğunu fark etmeden indirim açtırır.
     */
    warehouseLabels?: Map<string, { code: string; name: string }>;
  },
): BatchView[] {
  return rows.map((row) => {
    const product = row.variant.product;
    const productName = resolveLocalizedText(product.name);
    const variantLabel = resolveLocalizedText(row.variant.label);
    const { offerPriceCents } = row; // servis cent döndürüyor (02.9) — çeviri kalmadı

    const { decision, flag, remainingPercent } = offerDecisionOf({
      dateType: product.dateType,
      expiryDate: row.expiryDate,
      shelfLifeDays: product.shelfLifeDays,
      offerPriceCents,
      now: opts.now,
      nearExpiryPercent: opts.thresholds.nearExpiryPercent,
    });

    // MLOR: partinin GİRİŞTEKİ ömrü değil, bugünkü ömrü ölçülüyor — giriş tarihi ayrıca tutulmuyor.
    // Bu yüzden işaret "kısa ömürlü geldi" değil, "kısa ömürlü DURUYOR" der; teklif kararına bağlam
    // olarak ikisi de aynı işi görür ve uydurma bir giriş anı varsaymaz.
    const listPriceCents = opts.listPriceCents?.get(row.variantId) ?? null;

    return {
      ...row,
      title: variantLabel ? `${productName} · ${variantLabel}` : productName,
      productName,
      variantLabel,
      warehouse: opts.warehouseLabels?.get(row.warehouseId) ?? null,
      flag,
      decision,
      remainingPercent,
      daysLeft: daysToExpiry(row.expiryDate, opts.now),
      belowMlor: !meetsMlor(row.expiryDate, product.shelfLifeDays, opts.now, opts.thresholds.mlorPercent).ok,
      listPriceCents,
      suggestedOfferCents: suggestedOfferPriceCents(listPriceCents, opts.thresholds.offerDiscountPercent),
      offerDiscountPercent: opts.thresholds.offerDiscountPercent,
      mlorPercent: opts.thresholds.mlorPercent,
      offerPriceCents,
      purchasePriceCents: row.purchasePriceCents,
    };
  });
}
