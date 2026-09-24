import { distributeDiscount, vatPortion } from '@lezzet/helper';
import type { AddressDeliveryType } from '@lezzet/types';

/**
 * Kargo ücreti ve KDV'si, saf karar: rota içi ücretsiz, kargoda eşik altı ücretli ve ücret KDV'ye tabi. `pickup` girdi tipinde
 * yok, çünkü yerinde satışta taşıma sorusu geçersizdir; tipte dışlanınca yanlış dala düşen çağıran derlemede durur.
 */

export interface ShippingFeeInput {
  deliveryType: AddressDeliveryType;
  /** Sepet ara toplamı (indirim sonrası, kanal tabanında — cent). */
  basketCents: number;
  /** Bu tutarın üstünde kargo ücretsiz (cent). */
  freeThresholdCents: number;
  /** Eşik altında alınan ücret (cent) — SABİT tarife; canlı teklif yoksa geçerli. */
  feeCents: number;
  /**
   * Seçilen servisin sunucuda hesaplanmış müşteri ücreti (KDV dahil, cent); `null` = teklif yok, sabit tarife geçerli. Teklif ücretin
   * tutarını belirler, alınıp alınmayacağını eşik belirler.
   */
  quotedFeeCents?: number | null;
}

export interface ShippingFeeResult {
  feeCents: number;
  /** Ücret neden alınmadı — arayüz "rota içi teslimat ücretsiz" ya da "kargo bedava" der. */
  freeReason: 'route' | 'threshold' | null;
  /** Ücretsiz kargoya kalan tutar (cent); zaten ücretsizse 0. "X € daha ekleyin" mesajının girdisi. */
  remainingForFreeCents: number;
  /** Ücret nereden geldi: `quote` canlı teklif, `tariff` sabit tarife; ekran bunu söyler ki hesaplanmamış sayı canlı fiyat sanılmasın. */
  source: 'quote' | 'tariff' | null;
}

export function resolveShippingFee(input: ShippingFeeInput): ShippingFeeResult {
  if (input.deliveryType === 'route') {
    return { feeCents: 0, freeReason: 'route', remainingForFreeCents: 0, source: null };
  }
  // Eşik canlı fiyata bakmaz: "eşik üzeri ücretsiz" bir sözdür ve maliyete bağlansaydı bazı adreslerde yalan olurdu.
  if (input.basketCents >= input.freeThresholdCents) {
    return { feeCents: 0, freeReason: 'threshold', remainingForFreeCents: 0, source: null };
  }
  const quoted = input.quotedFeeCents;
  const live = typeof quoted === 'number' && quoted >= 0;
  return {
    feeCents: live ? quoted : input.feeCents,
    freeReason: null,
    remainingForFreeCents: Math.max(0, input.freeThresholdCents - input.basketCents),
    source: live ? 'quote' : 'tariff',
  };
}

/** Asgari sepet tutuyor mu — tutmuyorsa checkout açılmaz (DOMAIN §6, parametrik). */
export function meetsMinBasket(basketCents: number, minBasketCents: number): { ok: boolean; missingCents: number } {
  const missing = Math.max(0, minBasketCents - basketCents);
  return { ok: missing === 0, missingCents: missing };
}

/** KDV paylaştırması için gereken asgari kalem bilgisi. */
export interface VatLine {
  /** Kalemin indirimli toplamı (cent, kanal tabanında). */
  totalCents: number;
  /** O kalemin KDV oranı (5.5 / 20). */
  vatRate: number;
}

export interface ShippingVatPart {
  vatRate: number;
  /** Kargo ücretinin bu orana düşen kısmı (cent). */
  amountCents: number;
  /** O kısmın içindeki KDV (cent) — fiyatlar KDV DAHİL taşındığı için ücretten ayrıştırılır. */
  vatCents: number;
}

/**
 * Kargo ücretinin KDV'si taşıdığı malın oranını izler: karışık oranlı sepette ücret kalem tutarlarına oransal bölünür ve her parça kendi
 * oranından vergilenir. Artan kuruş en büyük paya gider (Σ parça = ücret); kalemsiz sepette boş döner.
 */
export function apportionShippingVat(feeCents: number, lines: readonly VatLine[]): ShippingVatPart[] {
  if (feeCents <= 0 || lines.length === 0) return [];

  // Aynı orandaki kalemler birleştirilir: paylaştırma ORAN başına yapılır, kalem başına değil.
  const byRate = new Map<number, number>();
  for (const line of lines) {
    byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0) + line.totalCents);
  }

  const rates = [...byRate.keys()];
  const totals = rates.map((rate) => byRate.get(rate)!);
  const shares = distributeDiscount(totals, feeCents);

  return rates
    .map((vatRate, i) => ({ vatRate, amountCents: shares[i]!, vatCents: vatPortion(shares[i]!, vatRate) }))
    .filter((part) => part.amountCents > 0);
}

/**
 * Taşıyıcının KDV hariç teklifinden müşterinin ödeyeceği KDV dahil ücret. Ücretin KDV'si kalem oranlarına orantılı bölündüğü için
 * (`apportionShippingVat`) aynı ağırlıklarla geri çevrilir; böylece ücretin KDV hariç kısmı teklife eşit kalır.
 */
export function shippingPriceWithVat(netCents: number, lines: readonly VatLine[]): number {
  const total = lines.reduce((sum, l) => sum + Math.max(0, l.totalCents), 0);
  // Kalemsiz sepette oran yoktur; ücret de zaten sorulmaz.
  if (netCents <= 0 || total <= 0) return netCents;
  const netShare = lines.reduce((sum, l) => sum + Math.max(0, l.totalCents) / total / (1 + l.vatRate / 100), 0);
  return Math.round(netCents / netShare);
}
