// Kimlik anahtarı normalizasyonu — bağımlılıksız, saf.
// Telefon kimlik anahtarıdır (CHANNELS §3); eşleşmenin doğru olması için tek biçime indirilir.

/**
 * Telefonu E.164'e yakın tek biçime indirir (pazar varsayılanı FR/DE).
 * Pragmatik: boşluk/tire/parantez atılır; `00` → `+`; `+` yoksa ve `0` ile başlıyorsa
 * varsayılan ülke kodu uygulanır (FR=+33, DE=+49). Zamanı gelince libphonenumber ile güçlendirilir.
 */
export function normalizePhone(input: string, defaultCountry: 'FR' | 'DE' = 'FR'): string | null {
  const cleaned = input.replace(/[\s().-]/g, '');
  if (!cleaned) return null;

  let digits = cleaned;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  if (digits.startsWith('+')) {
    const rest = digits.slice(1);
    return /^\d{6,15}$/.test(rest) ? `+${rest}` : null;
  }

  // Ülke içi biçim: baştaki 0 düşer, ülke kodu eklenir.
  const cc = defaultCountry === 'DE' ? '49' : '33';
  const national = digits.replace(/^0/, '');
  return /^\d{5,14}$/.test(national) ? `+${cc}${national}` : null;
}

/** E-posta ikinci kimlik anahtarıdır (DOMAIN §10); trim + küçük harf. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return e.length > 0 ? e : null;
}
