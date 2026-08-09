import type { z } from 'zod';

import { BanResultTypeSchema, type BanFeature } from './ban.schema';

/*
  DIŞARIYA VERİLEN ŞEKİL — servisin ham cevabı değil, bizim okuduğumuz adres önerisi.

  İki gerekçe: (1) BAN'ın alan adları Fransızca sisteme ait (`citycode`, `banId`, `context`) ve
  bizim ekranlarımız bunları bilmek zorunda değil; (2) servis değişirse (kapanan alan adı örneği
  aşağıda) yalnız BU dosya değişsin, çağıran hiç değişmesin.

  ÖLÇÜLEMEYEN DEĞER SIFIR/BOŞ DEĞİLDİR (CLAUDE §1): sokak sonucunda kapı numarası YOKTUR ve
  `houseNumber` `null` döner — boş dizge `''` yazılsaydı "numarası olmayan bir adres" ile "numara
  bilgisi gelmedi" aynı şeye inerdi.
*/

export const AddressKindSchema = BanResultTypeSchema;
/** Önerinin inceliği: kapı numarası > sokak > mevki > komün. */
export type AddressKind = z.infer<typeof AddressKindSchema>;

export interface AddressSuggestion {
  /** BAN'ın kalıcı kimliği varsa o, yoksa komün+sokak kimliği. Liste anahtarı olarak kullanılır. */
  id: string;
  /** İnsanın okuduğu tam satır — servisin kendi yazdığı hâl, biz yeniden kurmayız. */
  label: string;
  kind: AddressKind;
  /** Kapı numarası — YALNIZ `kind === 'housenumber'` olduğunda dolu. */
  houseNumber: string | null;
  /** Sokak adı; komün sonucunda `null`. */
  street: string | null;
  postalCode: string;
  city: string;
  /** INSEE komün kodu — posta kodundan farklı ve daha kesin (bir posta kodu birden çok komüne bakabilir). */
  cityCode: string;
  /** Servisin eşleşme güveni (0..1). Sıralama servisin, biz yeniden sıralamayız. */
  score: number;
  latitude: number;
  longitude: number;
  /** Ters sorguda noktaya uzaklık (metre); düz aramada `null`. */
  distanceMeters: number | null;
}

/**
 * Adres satırının FORMA yazılacak hâli — `line1` alanına konacak metin.
 *
 * Etiketin tamamı yazılmaz: `label` posta kodunu ve şehri de taşıyor, oysa formda onların kendi
 * alanları var ve etiketi olduğu gibi basmak aynı bilgiyi iki kez yazdırırdı. Kapı numarası
 * varsa başa gelir (Fransız yazımı: "12 Rue du Marché").
 */
export function addressLineOf(suggestion: AddressSuggestion): string {
  const { houseNumber, street, label } = suggestion;
  if (street === null) return label;
  return houseNumber === null ? street : `${houseNumber} ${street}`;
}

/** Ham BAN özelliği → bizim öneri. Tek yer; iki uç (`/search`, `/reverse`) da buradan geçer. */
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
    distanceMeters: p.distance ?? null,
  };
}
