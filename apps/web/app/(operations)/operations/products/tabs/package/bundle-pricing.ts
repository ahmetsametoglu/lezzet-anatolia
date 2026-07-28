import { bundleBalance, bundleEconomics, isBelowTargetMargin, type BundleBalance, type BundleEconomics } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import type { VariantOption } from '../../products-types';

/**
 * Paket formunun TEK hesap yeri: kalemler + havuz + paket fiyatı → satır verileri ve toplamlar.
 *
 * İki tüketici var (fiyat alanları ve mutabakat şeridi) ve ikisi de aynı sayıları söylemek zorunda:
 * indirim yüzdesi fiyat alanının yanında, indirim tutarı şeritte yazıyor. Ayrı ayrı hesaplansaydı
 * yuvarlama farkı ikisini çelişkiye düşürürdü — %10 yazan alanın altında "1,54 € indirim" görünürdü.
 *
 * Kararların hiçbiri burada verilmez: mutabakat ve marj motorun (`domain-core`), burası yalnız
 * girdileri toplayıp kuruşa çevirir.
 */
interface BundlePricingRow {
  variantId: string;
  qty: number;
  /** EURO cinsinden (form değeri) — kuruşa çevirmek burada yapılır. */
  allocatedUnitPrice: number;
}

interface BundlePricing {
  balance: BundleBalance;
  economics: BundleEconomics;
  /** "Ayrı ayrı alınsa" — kalemlerin kendi fiyatları toplamı. Fiyatı eksik kalem varsa `null`. */
  listTotalCents: number | null;
  /** Liste toplamı − paket fiyatı. Negatifse paket ayrı ayrı almaktan PAHALI. */
  discountCents: number | null;
  discountPercent: number | null;
  /** Fiyatı girilmemiş kalem sayısı — ekran eksikliği söyleyebilsin, sayı uydurmasın. */
  missingListPrice: number;
  /** Payı kendi hedef marjının altına düşen kalem sayısı (hedefi olmayan kalem sayılmaz). */
  belowTargetLines: number;
}

/** Paket fiyatından indirim yüzdesi — ikisi aynı kararın iki yazımı. */
function discountPercentOf(listTotalCents: number | null, totalPriceCents: number): number | null {
  if (listTotalCents == null || listTotalCents <= 0) return null;
  return ((listTotalCents - totalPriceCents) / listTotalCents) * 100;
}

/** İndirim yüzdesinden paket fiyatı — yüzde alanına yazılınca fiyat bundan doğar. */
export function priceFromDiscount(listTotalCents: number, percent: number): number {
  return Math.max(0, Math.round(listTotalCents * (1 - percent / 100)));
}

export function bundlePricing(rows: BundlePricingRow[], pool: Map<string, VariantOption>, totalPrice: number): BundlePricing {
  const targetCents = toCents(totalPrice);
  const lines = rows.map((r) => ({ qty: r.qty, allocatedUnitPriceCents: toCents(r.allocatedUnitPrice) }));

  let listTotalCents = 0;
  let missingListPrice = 0;
  let belowTargetLines = 0;

  const economicsLines = rows.map((r) => {
    const option = pool.get(r.variantId);
    const listPrice = option?.listPrice;
    if (listPrice == null) missingListPrice += 1;
    else listTotalCents += toCents(listPrice) * r.qty;

    const unitCostCents = option?.unitCost == null ? null : toCents(option.unitCost);
    const vatRate = option?.vatRate ?? 0;
    // Kalem bazında marj: paketin toplamı tutuyor olsa da TEK bir kalemin payı kendi hedefinin altına
    // itilmiş olabilir — paketler marjı işte böyle sessizce yer.
    const allocatedHt = Math.round(toCents(r.allocatedUnitPrice) / (1 + vatRate / 100));
    if (isBelowTargetMargin(allocatedHt, unitCostCents, option?.targetMarginPercent ?? null) === true) belowTargetLines += 1;

    return { qty: r.qty, allocatedUnitPriceCents: toCents(r.allocatedUnitPrice), vatRate, unitCostCents };
  });

  const listTotal = missingListPrice > 0 || rows.length === 0 ? null : listTotalCents;
  return {
    balance: bundleBalance(lines, targetCents),
    economics: bundleEconomics(economicsLines),
    listTotalCents: listTotal,
    discountCents: listTotal == null ? null : listTotal - targetCents,
    discountPercent: discountPercentOf(listTotal, targetCents),
    missingListPrice,
    belowTargetLines,
  };
}
