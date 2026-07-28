import { distributeProportional } from '@lezzet/helper';

/**
 * Paket kalem fiyatı mutabakatı (DOMAIN §13) — SAF karar, DB'siz.
 *
 * Paketin müşteriye gösterilen TEK fiyatı bir pazarlama sayısıdır (49,90 €). İçindeki her kaleme de
 * bir birim fiyat atanır; bunlar müşteriye görünmez ama fatura ve KDV onlardan hesaplanır (her kalemin
 * KDV'si kendi ürününün oranından). Kural: **Σ(atanmış × adet) = paket fiyatı.**
 *
 * ⚠ Bu her zaman TUTTURULABİLİR DEĞİL. Birim fiyatlar tam kuruş olduğu için bir kalemin toplamı ancak
 * `adet` kuruş adımlarıyla değişir: adetleri 2 ve 4 olan iki kalemle ulaşılabilen toplamlar hep çift
 * kuruştur, tek kuruşlu bir hedef matematiksel olarak tutmaz. Bu yüzden dağıtım "yaptım" demez,
 * ULAŞILAN toplamı ve KALAN farkı döner; kalan varsa karar operatördedir (paket fiyatını 1 kuruş
 * oynat ya da bir kalemin adedini değiştir). Sessizce yuvarlayıp "tutuyor" demek, faturayı 1 kuruş
 * kaydırıp sonra kimsenin bulamayacağı bir fark bırakmak olurdu.
 *
 * Adedi 1 olan bir kalem varsa kalan HER ZAMAN oraya sığar (1 kuruş = 1 kuruş) → mutabakat kesin.
 */
export interface BundleAllocationLine {
  qty: number;
  allocatedUnitPriceCents: number;
}

export interface BundleBalance {
  /** Σ(atanmış × adet). */
  allocatedTotalCents: number;
  /** Paketin müşteriye gösterilen fiyatı. */
  targetCents: number;
  /** atanmış − hedef. Pozitif = fazla atanmış, negatif = eksik. */
  diffCents: number;
  balanced: boolean;
}

export function bundleBalance(lines: BundleAllocationLine[], targetCents: number): BundleBalance {
  const allocatedTotalCents = lines.reduce((sum, l) => sum + l.allocatedUnitPriceCents * l.qty, 0);
  const diffCents = allocatedTotalCents - targetCents;
  return { allocatedTotalCents, targetCents, diffCents, balanced: diffCents === 0 };
}

export interface RebalanceResult {
  /** Kalem sırasıyla yeni birim fiyatlar (kuruş). */
  unitPricesCents: number[];
  /** Bu birim fiyatlarla gerçekten oluşan toplam. */
  achievedTotalCents: number;
  /** 0 değilse hedef bu adetlerle tam tutturulamıyor — fark burada kalır (achieved − target). */
  residualCents: number;
}

/**
 * Farkı kalemlere **oransal** dağıtır (ağırlıklı: hâlihazırda pahalı olan kalem farkın çoğunu taşır) ve
 * ulaşılan toplamı bildirir. Fark negatifse fiyatlar artar, pozitifse azalır; hiçbir birim fiyat 0'ın
 * altına inmez — 0 zaten geçerli bir değerdir (hediye kalem).
 *
 * Kalem yoksa ya da hedef 0 ise dokunmaz: paket kurulurken kalem eklenmeden önceki hâl budur.
 */
export function rebalanceAllocations(lines: BundleAllocationLine[], targetCents: number): RebalanceResult {
  if (lines.length === 0) {
    return { unitPricesCents: [], achievedTotalCents: 0, residualCents: -targetCents };
  }

  const lineTotals = lines.map((l) => l.allocatedUnitPriceCents * l.qty);
  const { diffCents } = bundleBalance(lines, targetCents);
  if (diffCents === 0) {
    return { unitPricesCents: lines.map((l) => l.allocatedUnitPriceCents), achievedTotalCents: targetCents, residualCents: 0 };
  }

  // Dağıtım tabanı: mevcut kalem toplamları. Hepsi 0 ise (yeni paket, fiyat girilmemiş) oransal
  // dağıtım yapılamaz → adede göre eşit ağırlık verilir.
  const base = lineTotals.some((t) => t > 0) ? lineTotals : lines.map((l) => l.qty);
  const shares = distributeProportional(base, Math.abs(diffCents));
  const sign = diffCents > 0 ? -1 : 1;

  // Pay TOPLAM kuruştur; birim fiyata çevirmek için adete bölünür → tam bölünmeyen kısım kalır.
  const unitPricesCents = lines.map((l, i) => {
    const deltaUnit = Math.trunc(((shares[i] ?? 0) * sign) / l.qty);
    return Math.max(0, l.allocatedUnitPriceCents + deltaUnit);
  });

  const achievedTotalCents = unitPricesCents.reduce((sum, unit, i) => sum + unit * (lines[i]?.qty ?? 0), 0);
  let residualCents = achievedTotalCents - targetCents;

  // Adedi 1 olan kalem kalanı TAM emer (1 kuruş = 1 kuruş). Varsa mutabakat kesinleşir.
  const single = lines.findIndex((l) => l.qty === 1);
  if (residualCents !== 0 && single >= 0) {
    const fixed = (unitPricesCents[single] ?? 0) - residualCents;
    if (fixed >= 0) {
      unitPricesCents[single] = fixed;
      residualCents = 0;
    }
  }

  return {
    unitPricesCents,
    achievedTotalCents: unitPricesCents.reduce((sum, unit, i) => sum + unit * (lines[i]?.qty ?? 0), 0),
    residualCents,
  };
}
