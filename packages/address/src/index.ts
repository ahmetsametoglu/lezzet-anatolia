/*
  Adres kuralları ve metni: tarayıcı, telefon ve sunucu aynı saf fonksiyonları kullanır; domain-core ve database de bu kökü okur,
  çünkü posta kodu ve yer adı kuralı katmanlar arasında tek kalmalı. Ağa çıkan istemciler (`/fr` BAN, `/google` yalnız sunucu) ve
  kanca (`/react`) ayrı girişlerde durur: kök saf kalır ve her yüzey yalnız kullandığını yükler.
*/

export { MIN_QUERY_LENGTH } from './min-query-length';
export { addressLineOf } from './fr/address';
export type { AddressKind, AddressSuggestion } from './fr/address';
export { hasHouseNumber } from './house-number';
export { addressLine } from './address-line';
export { addressDefaultsOf, addressLabelKind } from './address-label';
export type { AddressLabelKind } from './address-label';
export { isValidPostalCode, normalizePostalCode } from './postal-code';
export { cityMatchesPlaces, normalizePlaceName, placeLabel } from './place-name';
export { addressVerdict } from './address-verdict';
export type { AddressCandidate, AddressVerdict } from './address-verdict';
export { doorCheckOf } from './door-check';
