import { removeVat } from '@lezzet/helper';
import { markupPercent } from './margin';

/**
 * Paketin parası: ne kadar satıyoruz, ne kadara mal oluyor, marj ne? SAF karar, DB'siz.
 *
 * KDV'yi TEK ORANLA İNDİREMEYİZ — paketin kalemlerinin oranları farklı (tatlı %5,5, malzeme %20).
 * Paket fiyatı KDV **dahil** tek bir sayıdır; HT karşılığı ancak kalem kalem hesaplanır. Atanmış
 * payların asıl işlevi de budur: yalnız faturanın KDV kırılımı için değil, **marjı hesaplanabilir
 * kılmak** için varlar. Pay yoksa paketin kârı bilinemez.
 *
 * Maliyet TAHMİNDİR (eldeki partilerin ağırlıklı ortalama alış fiyatı): gerçek COGS parti başına
 * belli ve sipariş anında FEFO ile kesinleşir. Burası fiyat verirken bakılan planlama görünümü.
 *
 * Maliyeti bilinmeyen kalem varsa maliyet ve marj **null** döner — eksik veriyi 0 sayıp "marj %100"
 * yazmak, yanlış fiyat kararının en kolay yoludur.
 */
export interface BundleEconomicsLine {
  qty: number;
  /** Kaleme atanmış birim fiyat, KDV DAHİL (b2c tabanı). */
  allocatedUnitPriceCents: number;
  /** Kalemin kendi KDV oranı (5.5 · 20). */
  vatRate: number;
  /** Tahmini birim maliyet, KDV HARİÇ. Bilinmiyorsa null. */
  unitCostCents: number | null;
}

export interface BundleEconomics {
  revenueTtcCents: number;
  /** KDV hariç satış — her kalem KENDİ oranıyla indirildi. */
  revenueHtCents: number;
  vatCents: number;
  costCents: number | null;
  profitCents: number | null;
  /** Maliyet üzerine markup (DOMAIN tanımı). Maliyet bilinmiyorsa null. */
  marginPercent: number | null;
  /** Maliyeti bilinmeyen kalem sayısı — ekran neyin eksik olduğunu söyleyebilsin. */
  unknownCostLines: number;
}

export function bundleEconomics(lines: BundleEconomicsLine[]): BundleEconomics {
  let revenueTtcCents = 0;
  let revenueHtCents = 0;
  let costCents = 0;
  let unknownCostLines = 0;

  for (const line of lines) {
    const ttc = line.allocatedUnitPriceCents * line.qty;
    revenueTtcCents += ttc;
    revenueHtCents += removeVat(line.allocatedUnitPriceCents, line.vatRate) * line.qty;
    if (line.unitCostCents == null) unknownCostLines += 1;
    else costCents += line.unitCostCents * line.qty;
  }

  const known = unknownCostLines === 0 && lines.length > 0;
  return {
    revenueTtcCents,
    revenueHtCents,
    vatCents: revenueTtcCents - revenueHtCents,
    costCents: known ? costCents : null,
    profitCents: known ? revenueHtCents - costCents : null,
    marginPercent: known ? markupPercent(revenueHtCents, costCents) : null,
    unknownCostLines,
  };
}
