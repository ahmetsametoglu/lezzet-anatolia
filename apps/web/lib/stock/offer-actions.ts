'use server';

import { revalidatePath } from 'next/cache';
import { SettingsService, StockService, serviceDb } from '@lezzet/database';
import { offerDecisionOf } from '@lezzet/domain-core';
import { requireStaff } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readExpiryThresholds } from './batch-view';

// Teklif yazma yolu — İKİ ekranın ortak eylemi (stok 09.13 · fiyatlar 09.5). Server action'lar
// kural gereği sayfa klasöründe kolokasyon eder; bu eylem artık tek bir sayfaya ait olmadığı için
// `lib/`'e taşındı (CLAUDE.md §2: paylaşılan yardımcı lib'te).
//
// KARAR BURADA VERİLMEZ: "bu parti teklife açılabilir mi" sorusunu motor yanıtlar. Action yalnız o
// cevabı UYGULAR — sunucu tarafında da uygular, çünkü ekranın düğmeyi gizlemesi bir güvence
// değildir: eski bir sekme, tarihi bugün geçmiş bir partiye teklif açmayı deneyebilir.

/** Teklif kararının göründüğü YOLLAR — biri tazelenip öbürü unutulursa iki ekran ayrışır. */
const OFFER_PATHS = ['/operations/stock', '/operations/prices'] as const;

/**
 * Partiyi teklife açar / teklif fiyatını günceller. `null` fiyat teklifi KAPATIR.
 *
 * DLC'si geçmiş partide teklif açılamaz ve bu kapı sunucudadır: güvenlik kuralı ekranın iyi niyetine
 * bırakılmaz. Kapatma her hâlde serbesttir — yanlışlıkla açılmış bir teklifin geri alınması hiçbir
 * koşulda engellenmemeli.
 */
export async function setOfferPriceAction(
  stockId: string,
  offerPriceCents: number | null,
  /**
   * Asistan önerisinden gelindiyse o önerinin kimliği (22.5). **Yoksa akış hiç değişmez** — iki
   * ekranın elle kullandığı yol tek satır bile farklı koşmaz.
   */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireStaff();
    const db = serviceDb();
    const stockSvc = new StockService(db);

    if (offerPriceCents !== null) {
      if (offerPriceCents <= 0) throw new Error('Teklif fiyatı sıfırdan büyük olmalı.');
      const [[batch], thresholds] = await Promise.all([
        stockSvc.getBatchDetails([stockId]),
        readExpiryThresholds(new SettingsService(db)),
      ]);
      if (!batch) throw new Error('Parti bulunamadı — listeyi yenileyin (tükenmiş ya da silinmiş olabilir).');
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

    /**
     * Öneriden gelindiyse yazma ile kuyruk satırı BİRLİKTE koşar; sıra tek yerde (`withProposal`).
     * `resultOf` künyenin beklediği anahtarı döndürür (`KIND_META.batch_offer.resultKey`), yoksa
     * kuyruk "hangi kayıt doğdu" sorusuna cevap veremezdi.
     */
    await withProposal(
      proposalId,
      staff.profileId,
      () => stockSvc.setOfferPrice(stockId, offerPriceCents),
      (row) => ({ stockId: row.id }),
    );
    for (const path of OFFER_PATHS) revalidatePath(path);
    // Kuyruk satırı da tazelenir: karar burada verildi, rozetin sayısı orada duruyor.
    revalidatePath('/operations/assistant');
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
