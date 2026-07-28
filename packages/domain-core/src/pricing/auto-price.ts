import type { Channel } from '@lezzet/types';
import { addVat, removeVat } from '@lezzet/helper';
import { vatBaseOf } from './resolve-price';

/**
 * Otomatik fiyatlandırma — `Product.auto_price` açık ürünlerde satış fiyatını maliyetten TÜRETİR
 * (DOMAIN §"Maliyet ve hedef marj": kapalıysa sistem uyarır, açıksa günceller).
 *
 * `priceForMargin` hedef marjı sağlayan **HT** tutarı verir; bu dosyanın eklediği iki şey kanalın
 * kendi tabanı (b2c saklanan fiyat TTC'dir, b2b HT) ve yuvarlama. İkisi olmadan motor DB'ye
 * yazılabilir bir sayı üretmez.
 *
 * **Yuvarlama YUKARI:** aşağı yuvarlamak hedefi kılpayı ıskalar — %40 hedefle 14,03 € çıkan fiyatı
 * 14,00'a indirmek marjı hedefin altına düşürür ve ürün, "otomatik" olduğu hâlde marj-altı
 * uyarısına düşer. Bir kuruş fazla vermek, sistemin kendi kuralını bozmasından iyidir.
 */

/** Yuvarlama adımı (kuruş). 5 = perakende alışkanlığı; çağıran değiştirebilir. */
export const AUTO_PRICE_STEP_CENTS = 5;

export interface AutoPriceInput {
  channel: Channel;
  /** Birim maliyet (kuruş, KDV hariç). */
  costCents: number;
  /** Hedef marj — maliyet üzerine markup yüzdesi. */
  targetMarginPercent: number;
  vatRate: number;
  stepCents?: number;
}

/**
 * Hedef marjı sağlayan, o kanalda SAKLANACAK fiyat (kuruş).
 *
 * Maliyet yoksa/sıfırsa `null` — otomatik fiyat bir hesaptır, maliyetsiz hesap yoktur. Bu ürünler
 * sessizce 0 € olmaz; fiyatları elle girilmiş hâliyle kalır ve ekran maliyetsizliği zaten söyler.
 */
export function autoPriceCents(input: AutoPriceInput): number | null {
  const { channel, costCents, targetMarginPercent, vatRate, stepCents = AUTO_PRICE_STEP_CENTS } = input;
  if (costCents <= 0) return null;

  // Eşik `priceForMargin` gibi YUVARLANMAZ, yukarı alınır: o fonksiyon uyarı eşiğidir ve kuruşun
  // altını yuvarlar; burada aynı kuruş, yazdığımız fiyatın hedefi ıskalaması demek olurdu.
  const targetHt = Math.ceil(costCents * (1 + targetMarginPercent / 100));
  const step = Math.max(1, Math.round(stepCents));

  let price = Math.ceil((vatBaseOf(channel) === 'ttc' ? addVat(targetHt, vatRate) : targetHt) / step) * step;
  // KDV ekle-çıkar gidiş-dönüşü tek başına bir kuruş eritebilir (iki ayrı yuvarlama). Sonucu kendi
  // ölçütümüzle DOĞRULAYIP gerekirse bir adım yukarı alıyoruz: "hedefi sağlar" sözü hesaba değil,
  // sonuca bağlı olmalı.
  while (revenueHtOf(channel, price, vatRate) < targetHt) price += step;
  return price;
}

/**
 * Saklanan fiyatın HT karşılığı — marj karşılaştırmasının tabanı.
 *
 * Fiyat ekranı da aynı dönüşümü yapıyor; ikisi ayrı yazılsaydı motor "hedefi tutturdum" derken
 * ekran "marj-altı" diyebilirdi. Tek yerde durması, otomatik fiyatın kendi uyarısını
 * tetikleyememesini GARANTİ eder.
 */
export function revenueHtOf(channel: Channel, amountCents: number, vatRate: number): number {
  return vatBaseOf(channel) === 'ttc' ? removeVat(amountCents, vatRate) : amountCents;
}
