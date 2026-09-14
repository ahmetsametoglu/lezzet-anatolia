import type { Granularity, PlaceDetailsResponse, PlacePrediction, ValidateAddressResponse } from './google.schema';

/*
  DIŞARIYA VERİLEN ŞEKİL — Google'ın ham cevabı değil, bizim okuduğumuz öneri / adres / hüküm.

  Gerekçe `@lezzet/address-fr/address.ts` ile aynı: servisin alan adları ona ait (`longText`,
  `structuredFormat`, `validationGranularity`) ve ekranlarımız bunları bilmek zorunda değil; servis
  değişirse yalnız BU dosya değişsin.

  ÖLÇÜLEMEYEN DEĞER BOŞ DEĞİLDİR (CLAUDE §1): posta kodu gelmeyen bir yer (`route` sonucu) için
  `postalCode` `null` döner — boş dizge yazılsaydı "kodu olmayan adres" ile "kod gelmedi" aynı şeye inerdi.
*/

/** Kademeler `@lezzet/types`in `AddressGeoPrecisionEnum`ıyla birebir — çeviri tablosu tek yerde. */
export type AddressPrecision = 'housenumber' | 'street' | 'locality' | 'municipality';

/** Hizmet verdiğimiz iki ülke — `CountryEnum` ile aynı küme; paket `types`e bağlanmıyor (yalın kalsın). */
export type AddressCountry = 'FR' | 'DE';

/** Otomatik tamamlamanın bir satırı — seçilince `lookupPlace` ile açılır. */
export interface AddressPrediction {
  placeId: string;
  /** Tam metin — Google'ın kendi yazımı, biz yeniden kurmayız. */
  label: string;
  /** Kalın yazılan ana parça (sokak + numara) ve alt satır (kod, şehir). */
  main: string;
  secondary: string | null;
}

/** Yer detayının forma yazılacak hâli. */
export interface ResolvedAddress {
  /** Sokak satırı — ülkenin yazımıyla: DE "Hauptstraße 12", FR "12 Rue du Marché". */
  line1: string;
  postalCode: string | null;
  city: string | null;
  country: AddressCountry | null;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  precision: AddressPrecision;
}

/** Adres doğrulamanın hükmü — bizim dört kademe + servisin söylediği üç bayrak. */
export interface AddressValidation {
  precision: AddressPrecision;
  /** Servisin ham kademesi — `OTHER`/belirsiz hâlleri çağıran ayırt edebilsin. */
  granularity: Granularity;
  /** Adres eksiksiz doğrulandı (servisin `addressComplete`i). */
  complete: boolean;
  /** Bir bileşen doğrulanamadı (yeni yapı, tuhaf numara) — yumuşak belirsizlik. */
  unconfirmed: boolean;
  /** Posta kodu DEĞİŞTİRİLDİ: müşterinin yazdığı kod bu kapının kodu değil — "yanlış kod" sinyali. */
  replacedPostalCode: boolean;
  /** Düzeltilmiş adres — teklifin metni servisin yazımıdır. */
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

/** Bileşen listesinden türe göre metin — ilk eşleşen; yoksa `null`. */
function componentOf(components: readonly { longText: string; shortText?: string | null; types: string[] }[], type: string, short = false): string | null {
  const found = components.find((c) => c.types.includes(type));
  if (!found) return null;
  return short ? (found.shortText ?? found.longText) : found.longText;
}

/**
 * Sokak satırının YAZIMI ülkeye bağlıdır: Almanca sokak-numara ("Hauptstraße 12"), Fransızca
 * numara-sokak ("12 Rue du Marché"). Servisin `formattedAddress`i posta kodunu ve şehri de taşır;
 * formda onların kendi alanları var, etiketi olduğu gibi basmak aynı bilgiyi iki kez yazdırırdı.
 */
export function streetLineOf(country: AddressCountry | null, route: string | null, number: string | null): string {
  if (route === null) return number ?? '';
  if (number === null) return route;
  return country === 'DE' ? `${route} ${number}` : `${number} ${route}`;
}

export function toResolvedAddress(response: PlaceDetailsResponse): ResolvedAddress | null {
  const components = response.addressComponents ?? [];
  const location = response.location ?? null;
  // Noktasız yer bizim için bir adres değil: koordinat bu kapının varlık sebebi.
  if (location === null) return null;

  const countryCode = componentOf(components, 'country', true);
  const country: AddressCountry | null = countryCode === 'DE' || countryCode === 'FR' ? countryCode : null;
  const number = componentOf(components, 'street_number');
  const route = componentOf(components, 'route');

  return {
    line1: streetLineOf(country, route, number),
    postalCode: componentOf(components, 'postal_code'),
    /* Şehir `locality`; İngiliz tipi `postal_town` ve Fransız arrondissement'ı için `sublocality`
       yedek — hiçbiri yoksa `null` kalır, uydurulmaz. */
    city: componentOf(components, 'locality') ?? componentOf(components, 'postal_town') ?? componentOf(components, 'sublocality_level_1'),
    country,
    formattedAddress: response.formattedAddress ?? null,
    latitude: location.latitude,
    longitude: location.longitude,
    precision: number !== null ? 'housenumber' : route !== null ? 'street' : componentOf(components, 'locality') !== null ? 'locality' : 'municipality',
  };
}

/** Servisin kademesi → bizim dört kademe (`AddressGeoPrecisionEnum`). */
export function precisionOf(granularity: Granularity | null | undefined): AddressPrecision {
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
