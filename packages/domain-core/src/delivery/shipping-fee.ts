import { distributeDiscount, vatPortion } from '@lezzet/helper';
import type { AddressDeliveryType } from '@lezzet/types';

/**
 * Kargo ücreti ve KDV'si (07.3) — DOMAIN §6.
 *
 * - **Rota içi teslimat ücretsizdir** (müşteri beklemeyi kabul eder, kapıya biz gideriz).
 * - **Kargoda** eşik altı siparişten ücret alınır; eşik ve ücret parametriktir (`Setting`).
 * - Ücret `Order.shipping_fee`'ye yazılır, `total`'a dâhildir ve **KDV'ye tabidir**.
 *
 * Saf: eşik/ücret değerlerini çağıran ayarlardan getirir.
 *
 * **`pickup` bu motorun sorusu DEĞİLDİR ve girdi tipi onu dışlıyor** (`AddressDeliveryType`, 26.08).
 * Yerinde satışta taşıma yoktur; "kargo ücreti kaç" sorusunun cevabı "0" değil — sorunun kendisi
 * geçersizdir. Sıfır döndürseydi motor cevabı olmayan bir soruya cevap vermiş olur, `freeReason`
 * da müşteri sözleşmesine hiç ulaşamayacak bir değer taşırdı. Yerinde satış siparişi
 * `shipping_fee`ye doğrudan 0 yazar, buraya hiç uğramaz.
 *
 * Dışlamanın TİPTE olması bilinçli: enum 26.08'de genişleyince `pickup` sessizce `else` dalına
 * düşüp KARGO ÜCRETİ ödüyordu. Bugün aynı hatayı yapan çağıran derlemede durur, ekranda değil.
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
   * **CANLI TEKLİF** (07.12) — müşterinin seçtiği kargo seçeneğinin sunucuda yeniden hesaplanmış
   * fiyatı (cent). `null` = teklif alınamadı ya da seçim yapılmadı → sabit tarife geçerli.
   *
   * **Fiyat modeli HİBRİT ve motor bu yüzden değişmedi, yalnız GİRDİSİ genişledi** (07.12 kararı):
   * canlı teklif ücretin *tutarını* belirler, ücretsiz kargo eşiği ise *alınıp alınmayacağını*.
   * Eşik canlı fiyata bakmaz — 100 €'yu geçen sepet, taşıma bize kaça mal olursa olsun ücretsiz
   * gider; bu bir pazarlama sözüdür ve maliyete bağlanamaz.
   */
  quotedFeeCents?: number | null;
}

export interface ShippingFeeResult {
  feeCents: number;
  /** Ücret neden alınmadı — arayüz "rota içi teslimat ücretsiz" ya da "kargo bedava" der. */
  freeReason: 'route' | 'threshold' | null;
  /** Ücretsiz kargoya kalan tutar (cent); zaten ücretsizse 0. "X € daha ekleyin" mesajının girdisi. */
  remainingForFreeCents: number;
  /**
   * Ücret NEREDEN geldi — `quote` canlı teklif, `tariff` sabit tarife.
   *
   * **Ekranın bunu söylemesi gerekiyor** (07.12): teklif alınamadığında sessizce sabit tarifeye
   * düşmek, müşteriye "canlı fiyat" diye hesaplanmamış bir sayı göstermek olurdu. Ücret
   * alınmadığında (rota / eşik) kaynak sorusu doğmaz — `null`.
   */
  source: 'quote' | 'tariff' | null;
}

export function resolveShippingFee(input: ShippingFeeInput): ShippingFeeResult {
  if (input.deliveryType === 'route') {
    return { feeCents: 0, freeReason: 'route', remainingForFreeCents: 0, source: null };
  }
  // **EŞİK CANLI FİYATA BAKMAZ** (künye: `quotedFeeCents`): eşik bir pazarlama sözüdür, taşımanın
  // bize maliyeti ne olursa olsun tutar. Sırayı ters çevirmek (önce teklif, sonra eşik) sözü
  // maliyete bağlardı ve "100 € üzeri ücretsiz" cümlesi bazı adreslerde yalan olurdu.
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
