import { hasAllLocales, missingLocales, type LocalizedText } from '@lezzet/types';

/**
 * Ürün yayına hazır mı — kuralın son sözü veritabanındaki `product_publish_requires_all_locales` kısıtında; burası yazmadan önce aynı soruyu sorup hangi alanın hangi dilde eksik olduğunu söyler, kısıt bunu söyleyemez.
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
  /** Aile etiketi YALNIZ aile üyesinde aranır (kartta okunan odur). */
  familyId?: string | null;
  familyLabel?: LocalizedText | null;
}

/** Bir alanın eksiği: hangi alan, hangi diller. */
export interface PublishGap {
  field: 'name' | 'description' | 'ingredients' | 'storageInstructions' | 'familyLabel';
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
  // Koşullu alan — kısıttaki `family_id is null or …` ile birebir; ayrışırlarsa ekran "eksik yok" derken veritabanı yayını reddeder.
  // Görsel alt metni aranmaz: formda yok ve boşsa müşteride üç dilde zorunlu olan ürün adına düşer.
  if (product.familyId) check('familyLabel', product.familyLabel);

  return gaps;
}

/** Kısayol — çağıranın `.length === 0` yazmasına gerek kalmasın. */
export function canPublishProduct(product: PublishCandidate): boolean {
  return productPublishGaps(product).length === 0;
}
