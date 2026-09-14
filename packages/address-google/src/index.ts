/*
  @lezzet/address-google — Google Maps Platform üstünden adres arama ve doğrulama (Almanya).

  Fransa'nın karşılığı `@lezzet/address-fr` (BAN — anahtarsız, ücretsiz, tarayıcıdan). Burası
  ANAHTARLI ve sunucudan çağrılır; anahtarı fabrika verir, paket env okumaz (`client.ts` künyesi).

  NE YAPAR: serbest metinden tahmin (`autocompleteAddresses`), seçilen tahminin adresi ve noktası
  (`lookupPlace`), "bu kapı var mı" hükmü (`validateAddress`). NE YAPMAZ: gecikme, önbellek, ekran
  durumu, log — yüzeyin ve uygulama katmanının işi. Paket fırlatmaz; her başarısızlık ADLI döner.

  KAYNAK GÖSTERİMİ: harita olmadan gösterilen Places içeriğinin yanında Google Maps logosu
  (asgari 16 dp) zorunlu — bunu ÇİZEN yüzeydir. Koordinat 30 günden uzun saklanmaz; süresiz
  saklanabilen tek şey `placeId` (politika, okundu 13.09).
*/

export { autocompleteAddresses, lookupPlace, validateAddress } from './client';
export type { AutocompleteInput, AutocompleteLookup, GoogleFailure, PlaceInput, PlaceLookup, ValidateInput, ValidationLookup } from './client';
export type { AddressCountry, AddressPrecision, AddressPrediction, AddressValidation, ResolvedAddress } from './address';
