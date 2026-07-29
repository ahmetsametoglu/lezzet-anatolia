import type { Channel } from '@lezzet/types';
import { revenueHtOf } from '../pricing/auto-price';
import { markupPercent } from '../pricing/margin';

/**
 * Tek siparişin kârlılığı — SAF karar, DB'siz (09.7 · sağ raydaki "Finansal" kartı).
 *
 * **Neden motorda:** ekran satış ile maliyeti kendi içinde çıkarsaydı, marjın tanımı üçüncü bir
 * yerde daha yaşardı (fiyat ekranı, otomatik fiyat, sipariş detayı). Marj TEK tanımdır ve o tanım
 * `pricing/margin`'de: **maliyet üzerine markup**. Burada da oradan sorulur.
 *
 * **Karşılaştırma KDV HARİÇ (HT) tarafta:** maliyet KDV'siz bir tutardır, b2c satış fiyatı ise KDV
 * dahil. İkisini doğrudan bölmek kârı olduğundan yüksek gösterirdi.
 *
 * **Maliyet bilinmiyorsa kâr da bilinmez.** Hazırlanmamış siparişte parti seçilmemiştir; gerçek
 * COGS yoktur. O zaman `null` döner — sıfır maliyet varsayıp "kâr = satış" yazmak, kartın tamamını
 * yalana çevirirdi.
 */

export interface OrderProfitLine {
  /** Kalemin tutarı, **kanalın kendi tabanında** (b2c KDV dahil, b2b hariç) — kuruş. */
  amountCents: number;
  vatRate: number;
}

export interface OrderProfitInput {
  channel: Channel;
  lines: readonly OrderProfitLine[];
  /** Kargo bedeli, kanalın kendi tabanında (kuruş). */
  shippingCents: number;
  /**
   * Kargonun KDV oranı. `null` → **malın oranını izler** (FR kuralı: taşıma bedeli, taşıdığı malın
   * oranından vergilenir). Sipariş satırında ayrı bir kargo oranı tutulmadığı için normal yol budur.
   */
  shippingVatRate: number | null;
  /** Malın maliyeti (kuruş, KDV hariç). Bilinmiyorsa `null`. */
  cogsCents: number | null;
  /**
   * Malın dışındaki sabitlenmiş giderler — dağıtım payı, ödeme komisyonu, ambalaj (DOMAIN §12).
   * Girilmemiş olanlar hiç toplanmaz; sıfır ile "bilinmiyor" ayrımı çağıranın işidir.
   */
  otherCostCents: number;
  /** Müşteriye geri ödenen tutar (kuruş, brüt). */
  refundedCents: number;
}

export interface OrderProfit {
  /** KDV hariç satış — kalemler + kargo. */
  revenueHtCents: number;
  /** KDV hariç mal maliyeti; bilinmiyorsa `null`. */
  cogsCents: number | null;
  /** İadenin KDV hariç karşılığı — gelirden düşülür. */
  refundHtCents: number;
  /** Satış − iade − (mal + diğer giderler). Mal maliyeti bilinmiyorsa `null`. */
  profitCents: number | null;
  /** Maliyet üzerine markup yüzdesi (`markupPercent`); maliyet yoksa `null`. */
  markupPercent: number | null;
}

export function orderProfit(input: OrderProfitInput): OrderProfit {
  const { channel, lines, shippingCents, shippingVatRate, cogsCents, otherCostCents, refundedCents } = input;

  const goodsRate = weightedVatRate(lines);
  const shipRate = shippingVatRate ?? goodsRate;

  const linesHt = lines.reduce((sum, l) => sum + revenueHtOf(channel, l.amountCents, l.vatRate), 0);
  const shippingHt = shippingCents > 0 ? revenueHtOf(channel, shippingCents, shipRate) : 0;
  const revenueHtCents = linesHt + shippingHt;

  // İade hangi kalemden yapıldığı satır düzeyinde TUTULMAZ (para hareketi tutardır, kalem değil).
  // Bu yüzden iade, siparişin kendi ağırlıklı KDV oranıyla HT'ye indirilir — kalem bazlı bir
  // kesinlik uydurmak yerine, siparişin gerçek karışımını kullanmak en az yanlış olanıdır.
  const refundHtCents =
    refundedCents > 0
      ? revenueHtOf(channel, refundedCents, weightedVatRate([...lines, { amountCents: shippingCents, vatRate: shipRate }]))
      : 0;

  const netHt = revenueHtCents - refundHtCents;
  // Markup'ın tabanı siparişin TOPLAM maliyetidir: dağıtımı ve komisyonu hesaba katmayan bir marj,
  // kapıya kadar götürülen malı bedavaya taşınmış gibi gösterirdi.
  const totalCost = cogsCents === null ? null : cogsCents + otherCostCents;
  return {
    revenueHtCents,
    cogsCents,
    refundHtCents,
    profitCents: totalCost === null ? null : netHt - totalCost,
    markupPercent: totalCost === null ? null : markupPercent(netHt, totalCost),
  };
}

/** Tutar-ağırlıklı KDV oranı. Tutar yoksa 0 — bölünmez, uydurulmaz. */
function weightedVatRate(parts: readonly OrderProfitLine[]): number {
  const total = parts.reduce((sum, l) => sum + l.amountCents, 0);
  if (total <= 0) return 0;
  return parts.reduce((sum, l) => sum + l.vatRate * l.amountCents, 0) / total;
}
