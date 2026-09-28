/**
 * Şirket kartının "SIRET · KDV" satırı, web telefon görünümü ile native aynı satırı kurar. Biri eksikse yalnız olan yazılır,
 * ikisi de yoksa satır hiç çizilmez; boş bir yer tutucu olmayan bir kimliği varmış gibi gösterirdi.
 */
export function companyIdentifiers(
  company: { siret?: string | null; vatNumber: string | null },
  template: string,
): string | null {
  const { siret, vatNumber } = company;
  if (siret && vatNumber) return template.replace('{siret}', siret).replace('{vat}', vatNumber);
  return siret || vatNumber || null;
}
