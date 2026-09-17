import { hasAllLocales, missingLocales, type LocalizedText, type ProductAllergen } from '@lezzet/types';

/**
 * Ürün yayına hazır mı — kuralın son sözü veritabanındaki `product_publish_requires_*` kısıtlarında; burası yazmadan önce aynı soruyu sorup hangi alanın hangi dilde eksik olduğunu söyler, kısıt bunu söyleyemez.
 * Motor veritabanısız ve saftır (STACK §4): girdi ürünün alanları, çıktı eksiklerin listesi.
 */

/**
 * Yayın kontrolüne giren ürün alanları — `Product`un dar bir görünümü.
 * Alanların hepsi opsiyonel: çağıran formun kısmi gönderimini mevcut kayıtla birleştirir ve eksik alan zaten "yayına engel" demektir.
 */
export interface PublishCandidate {
  name?: LocalizedText | null;
  description?: LocalizedText | null;
  ingredients?: LocalizedText | null;
  storageInstructions?: LocalizedText | null;
  /** Alerjen beyanı — `null` girilmedi; boş liste "içermez" beyanıdır ve yayına engel değildir. */
  allergens?: readonly ProductAllergen[] | null;
  /** Aile etiketi YALNIZ aile üyesinde aranır (kartta okunan odur). */
  familyId?: string | null;
  familyLabel?: LocalizedText | null;
}

/** Bir alanın eksiği: hangi alan, hangi diller. */
export interface PublishGap {
  field: 'name' | 'description' | 'ingredients' | 'storageInstructions' | 'allergens' | 'familyLabel';
  /** Eksik diller; dilden bağımsız alanda (alerjen) boş. */
  missing: Array<'tr' | 'fr' | 'de'>;
}

/** Yayına engel olan eksikler, formdaki sırayla; boş dizi = ürün `active` yapılabilir. */
export function productPublishGaps(product: PublishCandidate): PublishGap[] {
  const gaps: PublishGap[] = [];
  const check = (field: PublishGap['field'], value: LocalizedText | null | undefined) => {
    if (!hasAllLocales(value)) gaps.push({ field, missing: missingLocales(value) });
  };

  check('name', product.name);
  check('description', product.description);
  check('ingredients', product.ingredients);
  check('storageInstructions', product.storageInstructions);
  if (product.allergens == null) gaps.push({ field: 'allergens', missing: [] });
  // Koşullu alan — kısıttaki `family_id is null or …` ile birebir; ayrışırlarsa ekran "eksik yok" derken veritabanı yayını reddeder.
  // Görsel alt metni aranmaz: formda yok ve boşsa müşteride üç dilde zorunlu olan ürün adına düşer.
  if (product.familyId) check('familyLabel', product.familyLabel);

  return gaps;
}

/** Kısayol — çağıranın `.length === 0` yazmasına gerek kalmasın. */
export function canPublishProduct(product: PublishCandidate): boolean {
  return productPublishGaps(product).length === 0;
}
