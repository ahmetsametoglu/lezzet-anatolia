/**
 * Ürün sayfasının açılış boyu: bağlantının istediği boy (paketin kalemi) ürünün aktif boyları arasındaysa o, değilse kartın
 * fiyatını taşıyan birincil boy, o da yoksa sıranın ilki. İstenen boy satıştan kalkmışsa sayfa kırılmaz, kartın boyuna düşer.
 */
export function openingVariantOf<V extends { id: string }>(
  variants: readonly V[],
  requestedId: string | null,
  primaryId: string | null,
): V | undefined {
  return variants.find((v) => v.id === requestedId) ?? variants.find((v) => v.id === primaryId) ?? variants[0];
}
