import { addVat, removeVat } from '@lezzet/helper';
import type { Channel } from '@lezzet/types';

/** Kanalın KDV tabanı: B2C dahil (TTC), B2B hariç (HT) — DOMAIN §5. */
export type VatBase = 'ttc' | 'ht';

export function vatBaseOf(channel: Channel): VatBase {
  return channel === 'b2c' ? 'ttc' : 'ht';
}

/** Bir orandaki tutar (cent): kalemde siparişin fiyat tabanında, kargoda her zaman KDV dahil. */
export interface RateAmount {
  vatRate: number;
  amountCents: number;
}

/** Bir oranın KDV kırılımı (cent). `netCents + vatCents === grossCents` her zaman tutar. */
export interface RateVat {
  vatRate: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
}

/**
 * Siparişin oran bazında KDV kırılımı; borç, aktarım ve kâr bu tek hesaptan okur. KDV dahil fiyatta kalem ve kargo aynı oranda birlikte
 * bölünür; KDV hariç fiyatta KDV kalemin oran toplamına eklenir, kargonun içinden ayrılır. Ters yüklemede oran sıfırdır.
 */
export function vatByRate(
  goods: readonly RateAmount[],
  shipping: readonly RateAmount[],
  pricesIncludeVat: boolean,
  zeroRated = false,
): RateVat[] {
  const sumByRate = (parts: readonly RateAmount[]) => {
    const byRate = new Map<number, number>();
    for (const part of parts) {
      const vatRate = zeroRated ? 0 : part.vatRate;
      byRate.set(vatRate, (byRate.get(vatRate) ?? 0) + part.amountCents);
    }
    return byRate;
  };
  const goodsByRate = sumByRate(goods);
  const shippingByRate = sumByRate(shipping);
  const rates = [...new Set([...goodsByRate.keys(), ...shippingByRate.keys()])].sort((a, b) => a - b);

  return rates.map((vatRate) => {
    const goodsCents = goodsByRate.get(vatRate) ?? 0;
    const shippingCents = shippingByRate.get(vatRate) ?? 0;
    if (pricesIncludeVat) {
      const grossCents = goodsCents + shippingCents;
      const netCents = removeVat(grossCents, vatRate);
      return { vatRate, grossCents, netCents, vatCents: grossCents - netCents };
    }
    const grossCents = addVat(goodsCents, vatRate) + shippingCents;
    const netCents = goodsCents + removeVat(shippingCents, vatRate);
    return { vatRate, grossCents, netCents, vatCents: grossCents - netCents };
  });
}

/** KDV dahil toplam (cent): müşterinin borcu her fiyat tabanında budur. */
export function grossTotalCents(
  goods: readonly RateAmount[],
  shipping: readonly RateAmount[],
  pricesIncludeVat: boolean,
  zeroRated = false,
): number {
  return vatByRate(goods, shipping, pricesIncludeVat, zeroRated).reduce((sum, line) => sum + line.grossCents, 0);
}

/**
 * Müşteri özetinin KDV satırları: KDV hariç fiyatlı kalemlere eklenen KDV, oran başına. KDV dahil fiyatta ve ters yüklemede boştur;
 * kargo ücreti KDV dahil olduğu için girmez.
 */
export function addedVatOf(goods: readonly RateAmount[], pricesIncludeVat: boolean, zeroRated = false): RateVat[] {
  if (pricesIncludeVat) return [];
  return vatByRate(goods, [], false, zeroRated).filter((line) => line.vatCents > 0);
}
