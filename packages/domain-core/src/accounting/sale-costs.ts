import type { DeliveryType } from '@lezzet/types';

/** Ayarlardaki birim maliyetler (cent). */
export interface UnitCosts {
  routeDeliveryCents: number;
  packagingCents: number;
  doorPackagingCents: number;
}

export interface SaleCosts {
  /** `null` = bilinmiyor: kargo maliyeti koli taşıyıcıya bildirilince yazılır. */
  deliveryCostCents: number | null;
  packagingCostCents: number;
}

/**
 * Siparişin sipariş anında yazılan doğrudan maliyetleri; sonradan değişen ayar geçmiş kârı oynatmasın diye o anın değeridir.
 * Kargoda maliyet taşıyıcı fiyatıdır ve sipariş anında bilinmez, sıfır yazılsaydı kâr şişerdi.
 */
export function costsAtSale(deliveryType: DeliveryType, unit: UnitCosts): SaleCosts {
  if (deliveryType === 'route') return { deliveryCostCents: unit.routeDeliveryCents, packagingCostCents: unit.packagingCents };
  if (deliveryType === 'shipping') return { deliveryCostCents: null, packagingCostCents: unit.packagingCents };
  return { deliveryCostCents: 0, packagingCostCents: unit.doorPackagingCents };
}
