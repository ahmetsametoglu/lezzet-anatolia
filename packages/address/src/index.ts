/*
  Adres araması ve adres metni: tarayıcı, telefon ve sunucu aynı fonksiyonları kullanır. Google istemcisi (`/google`,
  yalnız sunucu) ve öneri kancası (`/react`) ayrı girişlerde durur ki telefon paketi onları yüklemesin.
  Önerileri gösteren yüzey kaynak künyesini çizer: Fransa için "Base Adresse Nationale" (Etalab 2.0), Almanya için Google logosu.
*/

export { MIN_QUERY_LENGTH } from './min-query-length';
export { searchAddresses } from './fr/ban-client';
export { addressLineOf } from './fr/address';
export type { AddressKind, AddressSuggestion } from './fr/address';
export { hasHouseNumber } from './house-number';
export { addressLine } from './address-line';
export { addressDefaultsOf, addressLabelKind } from './address-label';
export type { AddressLabelKind } from './address-label';
