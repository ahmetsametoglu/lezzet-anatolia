import type { Business } from '@lezzet/types';

/**
 * Tedarik siparişinin işi: kalemlerin hedef depoları tek işe aitse o iş, hedef yoksa tedarikçinin varsayılan işi, o da yoksa Lezzet.
 * İki işin deposuna giden kalemler tek siparişte durmaz, çünkü iki işe alınan mal ayrı faturayla alınır (docs/feature/iki-is.md, karar 4).
 */
export function purchaseOrderBusinessOf(input: {
  targetBusinesses: readonly Business[];
  supplierDefault: Business | null | undefined;
}): { business: Business } | { problem: 'mixed_business' } {
  const distinct = [...new Set(input.targetBusinesses)];
  if (distinct.length > 1) return { problem: 'mixed_business' };
  return { business: distinct[0] ?? input.supplierDefault ?? 'lezzet' };
}
