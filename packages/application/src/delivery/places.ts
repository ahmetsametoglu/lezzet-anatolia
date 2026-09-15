import { PostalCodePlaceService, type Db } from '@lezzet/database';
import { placeLabel } from '@lezzet/domain-core';
import { normalizePostalCode } from '@lezzet/helper';
import type { Country, PlaceOption } from '@lezzet/types';

/** Yer çözümünden ayrı, çünkü ödeme çerezdeki kodu değil adresin kodunu sorar ve ikisi farklı olabilir. */
export async function placesForPostalCode(db: Db, country: Country, postalCode: string): Promise<string[]> {
  return new PostalCodePlaceService(db).findPlaces(country, postalCode);
}

/**
 * Servisin cevabı sözleşme şekline burada iner ki iki yüzey ayrı yazmasın; harfli terim servisin ad dalına gider. Depo tablosuna
 * bakılmaz: adres defterinin hizmet alanıyla ilgisi yok.
 */
export async function suggestPlaces(db: Db, prefix: string): Promise<PlaceOption[]> {
  const rows = await new PostalCodePlaceService(db).search(normalizePostalCode(prefix));
  return rows.map((row) => ({
    country: row.country,
    postalCode: row.postalCode,
    // Ad alan değil türevdir; çok yerleşimli kodda `null`.
    placeName: placeLabel(row.places),
    places: [...row.places],
    inRoute: row.inRoute,
  }));
}
