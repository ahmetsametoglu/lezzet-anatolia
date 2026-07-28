/**
 * FİYAT KARARININ MALİYET TABANI — "bunu yeniden almak kaça?" (DOMAIN §"Maliyet ve hedef marj").
 *
 * Neden depodaki ortalama değil: fiyat ileriye bakan bir karardır. Depoda duran ucuz eski parti
 * yüzünden fiyatı düşürürsek, stok bitince zam yapmak zorunda kalırız; pahalı bir partiyi geri
 * kazanmak için fiyatı yükseltirsek de mal satılmaz. **Kötü alımın parası zaten harcanmıştır**
 * (batık maliyet); onu rafın fiyatına yazmak, %20 zararı %100 zarara çevirme yoludur. O kaybın
 * görüneceği yer rapordur: gerçek kâr sipariş kapanışında SATILAN PARTİNİN kendi maliyetinden
 * hesaplanır ve orada olduğu gibi durur.
 *
 * AYKIRI FRENİ: son alış tek başına oynaktır — bir acil/küçük alım, tüm listeyi zıplatabilir. Bu
 * yüzden son alış, kendinden önceki alımların MEDYANIYLA karşılaştırılır; sapma eşiği aşarsa karar
 * "otomatik yazma, sor" olur. Medyan (ortalama değil) bilinçli: ortalama, karşılaştırdığımız
 * aykırılığın kendisinden etkilenirdi.
 */

/** Aykırı sayılma eşiği (%) — son alış, geçmişin medyanından bu kadar saparsa otomatik durur. */
export const COST_OUTLIER_PERCENT = 25;

/** Karşılaştırmaya giren geçmiş alım sayısı (son alış hariç). */
export const COST_HISTORY_SIZE = 5;

export type CostBasis =
  /** Taban güvenilir: otomatik fiyat yazılabilir. */
  | { status: 'ok'; costCents: number }
  /**
   * Son alış geçmişten belirgin sapıyor — tutar YİNE de döner (ekran maliyeti gösterebilsin),
   * ama otomatik yazma durur. Sapma bir hata değildir: gerçek bir zam da olabilir, tek seferlik bir
   * pazarlık da. İkisini ayıran bilgi sistemde yok, admin'de var.
   */
  | { status: 'outlier'; costCents: number; medianCents: number; deviationPercent: number }
  /** Hiç alış fiyatı yok — maliyet BİLİNMİYOR (sıfır değil). */
  | { status: 'unknown' };

export interface ReplacementCostOptions {
  outlierPercent?: number;
  historySize?: number;
}

/**
 * Yenileme maliyeti — `purchases` EN YENİDEN eskiye sıralı alış fiyatları (kuruş).
 *
 * Tek alım varsa karşılaştıracak geçmiş yoktur ve bu bir sapma değil, bilgisizliktir: taban
 * kabul edilir. İlk alımı "şüpheli" saymak, yeni ürünün fiyatlanmasını imkânsız kılardı.
 */
export function replacementCost(
  purchases: readonly number[],
  options: ReplacementCostOptions = {},
): CostBasis {
  const { outlierPercent = COST_OUTLIER_PERCENT, historySize = COST_HISTORY_SIZE } = options;

  const valid = purchases.filter((p) => Number.isFinite(p) && p > 0);
  const latest = valid[0];
  if (latest === undefined) return { status: 'unknown' };

  const history = valid.slice(1, 1 + historySize);
  if (history.length === 0) return { status: 'ok', costCents: latest };

  const median = medianOf(history);
  const deviationPercent = (Math.abs(latest - median) / median) * 100;
  if (deviationPercent > outlierPercent) {
    return { status: 'outlier', costCents: latest, medianCents: median, deviationPercent };
  }
  return { status: 'ok', costCents: latest };
}

/** Maliyet tabanının tutarı — bilinmiyorsa `null`. Aykırıda da tutar VARDIR (yalnız otomatik durur). */
export function costOf(basis: CostBasis): number | null {
  return basis.status === 'unknown' ? null : basis.costCents;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // Çift sayıda değerde ortadaki İKİSİNİN ortalaması — tek değeri seçmek medyanı bir uca kaydırırdı.
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}
