import type { RegisterLine } from '@lezzet/types';

/** Kasaya yazılan tek kalem: adet artı, birim fiyat işaretli (iade fişinde eksi). */
export interface RegisterLinePart {
  quantity: number;
  unitPriceCents: number;
}

/**
 * Kalemi kuruşu tam tutan en çok iki parçaya böler, çünkü kasa birim fiyatı kuruşa yuvarlıyor (3 × 9,6667 toplamı 29,01 yazılıyor).
 * Kasa eksi adeti reddettiği için iade adedi artı, birim fiyatı eksi yazılır.
 */
export function splitRegisterLine(line: Pick<RegisterLine, 'qty' | 'amountCents'>): RegisterLinePart[] {
  const quantity = Math.abs(line.qty);
  if (quantity === 0) return [];
  const sign = line.amountCents < 0 ? -1 : 1;
  const total = Math.abs(line.amountCents);
  const unit = Math.floor(total / quantity);
  const withExtraCent = total - unit * quantity;
  const priced = (cents: number) => (cents === 0 ? 0 : sign * cents);

  const parts: RegisterLinePart[] = [];
  if (withExtraCent > 0) parts.push({ quantity: withExtraCent, unitPriceCents: priced(unit + 1) });
  if (quantity > withExtraCent) parts.push({ quantity: quantity - withExtraCent, unitPriceCents: priced(unit) });
  return parts;
}
