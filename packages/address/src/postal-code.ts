import { POSTAL_CODE_PATTERN } from '@lezzet/types';

/**
 * Posta kodunun kimlik biçimi (boşluksuz, büyük harf): kod depo çözümünün anahtarıdır ve katmanlar farklı biçimlerse aynı kod
 * sessizce başka depoya çözülür. `delivery_zone_postal_code.postal_code` aynı biçimi `check` ile zorlar.
 */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Biçimin tek kaynağı `@lezzet/types`; uygulamalar deseni adres paketinden okumayı sürdürür. */
export { POSTAL_CODE_PATTERN };

export function isValidPostalCode(raw: string): boolean {
  return POSTAL_CODE_PATTERN.test(normalizePostalCode(raw));
}

/** Tek haneli önek hiçbir yeri işaret etmez. */
export const MIN_POSTAL_PREFIX_LENGTH = 2;

/** İki harflik ad parçası yüzlerce yerleşime uyar ve trigram indeksi üç harfin altında çalışmaz. */
export const MIN_PLACE_NAME_LENGTH = 3;

/** FR ve DE kodları tamamen sayısal olduğu için harfli terim yer adıdır. */
export function isPlaceNameQuery(term: string): boolean {
  return /\p{L}/u.test(term);
}

export function minPostalQueryLength(term: string): number {
  return isPlaceNameQuery(term) ? MIN_PLACE_NAME_LENGTH : MIN_POSTAL_PREFIX_LENGTH;
}
