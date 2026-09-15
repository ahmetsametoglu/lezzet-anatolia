import type { Granularity, PlaceDetailsResponse, PlacePrediction, ValidateAddressResponse } from './google.schema';

/*
  Google'ın ham cevabı değil, bizim okuduğumuz öneri, adres ve hüküm: servisin alan adları ekranlara taşınmaz, servis
  değişirse yalnız bu dosya değişir. Gelmeyen bilgi boş dizge değil `null`dır.
*/

/** Kademeler `@lezzet/types`in `AddressGeoPrecisionEnum`ıyla birebir. */
export type AddressPrecision = 'housenumber' | 'street' | 'locality' | 'municipality';

/** Hizmet verilen iki ülke; `CountryEnum` ile aynı küme, paket `types`e bağlanmasın diye ayrı yazılı. */
export type AddressCountry = 'FR' | 'DE';

/** Otomatik tamamlamanın bir satırı; seçilince `lookupPlace` ile açılır. */
export interface AddressPrediction {
  placeId: string;
  /** Google'ın yazdığı tam metin. */
  label: string;
  /** Kalın yazılan ana parça (sokak ve numara) ile alt satır (kod, şehir). */
  main: string;
  secondary: string | null;
}

/** Yer detayının forma yazılacak hâli. */
export interface ResolvedAddress {
  /** Sokak satırı, ülkenin yazımıyla: DE "Hauptstraße 12", FR "12 Rue du Marché". */
  line1: string;
  postalCode: string | null;
  city: string | null;
  country: AddressCountry | null;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  precision: AddressPrecision;
}

/** Adres doğrulamanın hükmü: bizim dört kademe ve servisin üç bayrağı. */
export interface AddressValidation {
  precision: AddressPrecision;
  /** Servisin ham kademesi; belirsiz hâlleri çağıran ayırt edebilsin. */
  granularity: Granularity;
  /** Adres eksiksiz doğrulandı. */
  complete: boolean;
  /** Bir bileşen doğrulanamadı (yeni yapı, tuhaf numara); yumuşak belirsizlik. */
  unconfirmed: boolean;
  /** Posta kodu değiştirildi: müşterinin yazdığı kod bu kapının kodu değil. */
  replacedPostalCode: boolean;
  /** Düzeltilmiş adres; teklifin metni servisin yazımıdır. */
  formattedAddress: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
}

export function toPrediction(prediction: PlacePrediction): AddressPrediction {
  const main = prediction.structuredFormat?.mainText.text ?? prediction.text.text;
  return {
    placeId: prediction.placeId,
    label: prediction.text.text,
    main,
    secondary: prediction.structuredFormat?.secondaryText?.text ?? null,
  };
}

/** Bileşen listesinden türe göre ilk metin; yoksa `null`. */
function componentOf(components: readonly { longText: string; shortText?: string | null; types: string[] }[], type: string, short = false): string | null {
  const found = components.find((c) => c.types.includes(type));
  if (!found) return null;
  return short ? (found.shortText ?? found.longText) : found.longText;
}

/**
 * Sokak satırının yazımı ülkeye bağlı: Almanca sokak-numara, Fransızca numara-sokak.
 * Biçimli adres posta kodu ve şehri de taşıdığı için forma olduğu gibi yazılmaz.
 */
export function streetLineOf(country: AddressCountry | null, route: string | null, number: string | null): string {
  if (route === null) return number ?? '';
  if (number === null) return route;
  return country === 'DE' ? `${route} ${number}` : `${number} ${route}`;
}

export function toResolvedAddress(response: PlaceDetailsResponse): ResolvedAddress | null {
  const components = response.addressComponents ?? [];
  const location = response.location ?? null;
  // Noktasız yer bizim için adres değil: koordinat bu kapının varlık sebebi.
  if (location === null) return null;

  const countryCode = componentOf(components, 'country', true);
  const country: AddressCountry | null = countryCode === 'DE' || countryCode === 'FR' ? countryCode : null;
  const number = componentOf(components, 'street_number');
  const route = componentOf(components, 'route');

  return {
    line1: streetLineOf(country, route, number),
    postalCode: componentOf(components, 'postal_code'),
    // Şehir `locality`; yedekleri `postal_town` ve arrondissement için `sublocality`, hiçbiri yoksa `null` kalır.
    city: componentOf(components, 'locality') ?? componentOf(components, 'postal_town') ?? componentOf(components, 'sublocality_level_1'),
    country,
    formattedAddress: response.formattedAddress ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
    precision: number !== null ? 'housenumber' : route !== null ? 'street' : componentOf(components, 'locality') !== null ? 'locality' : 'municipality',
  };
}

/** Servisin kademesinden bizim dört kademeye. */
function precisionOf(granularity: Granularity | null | undefined): AddressPrecision {
  switch (granularity) {
    case 'SUB_PREMISE':
    case 'PREMISE':
      return 'housenumber';
    case 'PREMISE_PROXIMITY':
    case 'BLOCK':
    case 'ROUTE':
      return 'street';
    default:
      return 'municipality';
  }
}

export function toValidation(response: ValidateAddressResponse): AddressValidation {
  const { verdict, address, geocode } = response.result;
  const granularity = verdict?.validationGranularity ?? verdict?.geocodeGranularity ?? 'GRANULARITY_UNSPECIFIED';
  const components = address?.addressComponents ?? [];
  return {
    precision: precisionOf(granularity),
    granularity,
    complete: verdict?.addressComplete === true,
    unconfirmed: verdict?.hasUnconfirmedComponents === true,
    replacedPostalCode: components.some((c) => c.componentType === 'postal_code' && c.replaced === true),
    formattedAddress: address?.formattedAddress ?? null,
    postalCode: address?.postalAddress?.postalCode ?? null,
    city: address?.postalAddress?.locality ?? null,
    latitude: geocode?.location?.latitude ?? null,
    longitude: geocode?.location?.longitude ?? null,
    placeId: geocode?.placeId ?? null,
  };
}
