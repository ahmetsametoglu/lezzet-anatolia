import type { z } from 'zod';

import type { BanFeature, BanResultTypeSchema } from './ban.schema';

/*
  Servisin ham cevabı değil, bizim okuduğumuz adres önerisi: BAN'ın alan adları ekranlara taşınmaz, servis değişirse
  yalnız bu dosya değişir. Gelmeyen bilgi boş dizge değil `null`dır.
*/

/** Önerinin inceliği: kapı numarası > sokak > mevki > komün. */
export type AddressKind = z.infer<typeof BanResultTypeSchema>;

export interface AddressSuggestion {
  /** BAN'ın kalıcı kimliği varsa o, yoksa komün+sokak kimliği; liste anahtarı. */
  id: string;
  /** Servisin yazdığı tam satır. */
  label: string;
  kind: AddressKind;
  /** Yalnız `kind === 'housenumber'` olduğunda dolu. */
  houseNumber: string | null;
  /** Komün sonucunda `null`. */
  street: string | null;
  postalCode: string;
  city: string;
  /** INSEE komün kodu; bir posta kodu birden çok komüne bakabildiği için daha kesin. */
  cityCode: string;
  /** Servisin eşleşme güveni (0..1). */
  score: number;
  latitude: number;
  longitude: number;
}

/**
 * Önerinin formun sokak alanına yazılacak hâli; `label` posta kodu ve şehri de taşıdığı için olduğu gibi yazılmaz.
 * Kapı numarası başa gelir: "12 Rue du Marché".
 */
export function addressLineOf(suggestion: AddressSuggestion): string {
  const { houseNumber, street, label } = suggestion;
  if (street === null) return label;
  return houseNumber === null ? street : `${houseNumber} ${street}`;
}

export function toSuggestion(feature: BanFeature): AddressSuggestion {
  const p = feature.properties;
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    id: p.banId ?? p.id,
    label: p.label,
    kind: p.type,
    houseNumber: p.housenumber ?? null,
    street: p.street ?? (p.type === 'street' ? (p.name ?? null) : null),
    postalCode: p.postcode,
    city: p.city,
    cityCode: p.citycode,
    score: p.score,
    latitude,
    longitude,
  };
}
