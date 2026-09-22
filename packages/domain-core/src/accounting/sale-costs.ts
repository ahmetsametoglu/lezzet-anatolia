import type { DeliveryType } from '@lezzet/types';

/** Ayarlardaki birim maliyetler (cent). */
export interface UnitCosts {
  routeDeliveryCents: number;
  packagingCents: number;
  doorPackagingCents: number;
}

export interface SaleCosts {
  /** `null` = bilinmiyor: kargoda teklif alınamadıysa maliyet koli bildirilince yazılır. */
  deliveryCostCents: number | null;
  packagingCostCents: number;
}

/**
 * Siparişin sipariş anında yazılan doğrudan maliyetleri; sonradan değişen ayar geçmiş kârı oynatmasın diye o anın değeridir.
 * Kargoda maliyet seçilen servisin teklif fiyatıdır; teklif yoksa bilinmez ve sıfır yazılmaz, yoksa kâr şişerdi.
 */
export function costsAtSale(deliveryType: DeliveryType, unit: UnitCosts, shippingQuoteCents: number | null = null): SaleCosts {
  if (deliveryType === 'route') return { deliveryCostCents: unit.routeDeliveryCents, packagingCostCents: unit.packagingCents };
  if (deliveryType === 'shipping') return { deliveryCostCents: shippingQuoteCents, packagingCostCents: unit.packagingCents };
  return { deliveryCostCents: 0, packagingCostCents: unit.doorPackagingCents };
}
