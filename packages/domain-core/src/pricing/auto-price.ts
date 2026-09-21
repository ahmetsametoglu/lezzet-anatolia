import type { Channel } from '@lezzet/types';
import { addVat, removeVat } from '@lezzet/helper';
import { priceForMargin } from './margin';
import { vatBaseOf } from './resolve-price';

/**
 * Otomatik fiyat: `auto_price` açık üründe fiyatı maliyetten hedef marja türetir, kanalın tabanına çevirir ve yuvarlar.
 * Yuvarlama yukarı, çünkü aşağı yuvarlanan fiyat hedefi kılpayı ıskalar ve ürün kendi marj-altı uyarısına düşer.
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
 * Hedef marjı sağlayan, o kanalda saklanacak fiyat (kuruş); maliyet yoksa `null`, çünkü maliyetsiz hesap fiyat uydurur.
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
 * Saklanan fiyatın HT karşılığı; ekran ve motor bu tek dönüşümü kullanır ki otomatik fiyat kendi uyarısını tetiklemesin.
 */
export function revenueHtOf(channel: Channel, amountCents: number, vatRate: number): number {
  return vatBaseOf(channel) === 'ttc' ? removeVat(amountCents, vatRate) : amountCents;
}

/**
 * Verilen marjı sağlayan fiyat, kanalın kendi tabanında; `autoPriceCents`ten farkı yuvarlamasızdır, operatörün yazdığı
 * yüzdenin birebir karşılığıdır. Marj eksi olabilir ama fiyat sıfırın altına inmez.
 */
export function channelPriceForMargin(
  channel: Channel,
  costCents: number | null,
  marginPercent: number,
  vatRate: number,
): number | null {
  if (costCents == null || costCents <= 0) return null;
  const ht = Math.max(0, priceForMargin(costCents, marginPercent));
  return vatBaseOf(channel) === 'ttc' ? addVat(ht, vatRate) : ht;
}
