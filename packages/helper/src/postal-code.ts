/**
 * Posta kodunun kimlik biçimi (boşluksuz, büyük harf): kod depo çözümünün anahtarıdır ve katmanlar farklı biçimlerse aynı kod
 * sessizce başka depoya çözülür. `delivery_zone_postal_code.postal_code` aynı biçimi `check` ile zorlar.
 */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** İki pazarın (FR, DE) biçimi aynı beş hane; üçüncü bir ülke açılırsa kural burada dallanır. */
export function isValidPostalCode(raw: string): boolean {
  return /^\d{5}$/.test(normalizePostalCode(raw));
}
