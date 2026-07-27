import { distributeDiscount, vatPortion } from '@lezzet/helper';

/**
 * Kargo ücreti ve KDV'si (07.3) — DOMAIN §6.
 *
 * - **Rota içi teslimat ücretsizdir** (müşteri beklemeyi kabul eder, kapıya biz gideriz).
 * - **Kargoda** eşik altı siparişten ücret alınır; eşik ve ücret parametriktir (`Setting`).
 * - Ücret `Order.shipping_fee`'ye yazılır, `total`'a dâhildir ve **KDV'ye tabidir**.
 *
 * Saf: eşik/ücret değerlerini çağıran ayarlardan getirir.
 */

export interface ShippingFeeInput {
  deliveryType: 'route' | 'shipping';
  /** Sepet ara toplamı (indirim sonrası, kanal tabanında — cent). */
  basketCents: number;
  /** Bu tutarın üstünde kargo ücretsiz (cent). */
  freeThresholdCents: number;
  /** Eşik altında alınan ücret (cent). */
  feeCents: number;
}

export interface ShippingFeeResult {
  feeCents: number;
  /** Ücret neden alınmadı — arayüz "rota içi teslimat ücretsiz" ya da "kargo bedava" der. */
  freeReason: 'route' | 'threshold' | null;
  /** Ücretsiz kargoya kalan tutar (cent); zaten ücretsizse 0. "X € daha ekleyin" mesajının girdisi. */
  remainingForFreeCents: number;
}

export function resolveShippingFee(input: ShippingFeeInput): ShippingFeeResult {
  if (input.deliveryType === 'route') {
    return { feeCents: 0, freeReason: 'route', remainingForFreeCents: 0 };
  }
  if (input.basketCents >= input.freeThresholdCents) {
    return { feeCents: 0, freeReason: 'threshold', remainingForFreeCents: 0 };
  }
  return {
    feeCents: input.feeCents,
    freeReason: null,
    remainingForFreeCents: Math.max(0, input.freeThresholdCents - input.basketCents),
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
 * **Kargo ücretinin KDV'si tek bir orana bağlı değildir:** taşıma bedeli, taşıdığı malın oranını
 * izler (FR uygulaması). Sepette hem %5,5 hem %20 ürün varsa ücret kalem tutarlarına **oransal**
 * bölünür ve her parça kendi oranından vergilenir.
 *
 * Kuruş kaybı olmaz: paylaştırma `distributeDiscount` ile yapılır, artan kuruş en büyük paya gider
 * (Σ parça = ücret — STACK §8).
 *
 * Tek oranlı sepette sonuç tek parçadır; oran bilinmiyorsa (kalemsiz) boş döner.
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
