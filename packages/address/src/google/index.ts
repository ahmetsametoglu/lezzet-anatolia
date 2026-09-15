/*
  Almanya adres araması ve doğrulaması (Google); anahtar gizli ve kota projeye bağlı olduğu için yalnız sunucu çağırır.
  Places içeriği önbelleğe alınmaz: süresiz saklanabilen tek şey `placeId`, koordinat en çok 30 gün.
*/

export { autocompleteAddresses, lookupPlace, validateAddress } from './client';
export type { AutocompleteLookup, PlaceLookup } from './client';
export type { AddressValidation } from './address';
