import type { FulfillmentAdjustment, ReturnDisposition } from '@lezzet/types';

/** Bir kalemin geri gelen adetlerinden bir akıbete ayrılan pay. */
export interface ReturnPart {
  disposition: ReturnDisposition;
  qty: number;
  note?: string | null;
}

/**
 * Payları sıralı düzeltmelere çevirir: hedef adet her payda bir öncekinden düşer, "müşteride kaldı" ise adedi düşürmez (DOMAIN §8).
 * Pay yoksa, tam sayı değilse ya da toplamı karşılanan adedi aşıyorsa `null` döner ve ekran onayı açmaz.
 */
export function returnAdjustments(
  orderItemId: string,
  fulfilledQty: number,
  parts: readonly ReturnPart[],
): FulfillmentAdjustment[] | null {
  const used = parts.filter((part) => part.qty !== 0);
  if (used.length === 0 || used.some((part) => !Number.isInteger(part.qty) || part.qty < 0)) return null;
  if (used.reduce((sum, part) => sum + part.qty, 0) > fulfilledQty) return null;

  let current = fulfilledQty;
  return used.map((part) => {
    const note = part.note?.trim() || null;
    if (part.disposition === 'goodwill') {
      return { orderItemId, fulfilledQty: current, returnDisposition: 'goodwill', goodwillQty: part.qty, note };
    }
    current -= part.qty;
    return { orderItemId, fulfilledQty: current, returnDisposition: part.disposition, note };
  });
}

/** Paylardan sonra müşteride kalan karşılanan adet — önizleme bunu motora sorar; "müşteride kaldı" adedi düşürmez. */
export function keptQtyAfter(fulfilledQty: number, parts: readonly ReturnPart[]): number {
  return fulfilledQty - parts.reduce((sum, part) => (part.disposition === 'goodwill' ? sum : sum + part.qty), 0);
}
