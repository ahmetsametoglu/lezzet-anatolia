import { autocompleteAddresses, lookupPlace, type AutocompleteLookup, type PlaceLookup } from '@lezzet/address-google';
import type { Country } from '@lezzet/types';
import { googleMapsApiKey, traceGoogleFailure } from './google-maps';

/**
 * **Adres önerisi — sunucu kapısı** (13.09, "önce ülke, sonra listeden seç" kararı).
 *
 * ── FRANSA BURADAN GEÇMEZ ──────────────────────────────────────────────────
 * FR önerisi BAN'a TARAYICIDAN gidiyor (`use-address-search.hook` künyesi: kota IP başına, sunucudan
 * geçirmek tüm müşterileri tek IP'ye bağlardı). Almanya için tersi geçerli: Google'da kota projeye
 * bağlı, anahtar gizli — çağrı sunucudan. Bu kapı bu yüzden FR'de `unsupported_country` döner:
 * yanlışlıkla FR sorgusu buraya düşerse Google'a para ödemeyelim, hata da sessiz kalmasın.
 *
 * ── İKİ ADIM, TEK OTURUM ───────────────────────────────────────────────────
 * `suggestAddresses` yazarken (her tuşta, gecikmeli), `resolveAddressSuggestion` seçince — aynı
 * `sessionToken` ile. Jetonu istemci üretir ve seçimle bırakır; fiyat oturum kademesinden kesilir
 * (`@lezzet/address-google` künyesi).
 *
 * Fırlatmaz; her hâl adlı. `not_configured` anahtar yokluğu — ekran elle girişe düşer, kimseyi
 * durdurmaz. `denied` (yapılandırma) ve `rejected` (sözleşme) geçici DEĞİL: bu kapı iz bırakır
 * (`traceGoogleFailure`), müşteriye yine "şu an öneri yok" denir. Sonuç tipleri paketin cevabından
 * TÜRER — pakete yeni bir hâl eklendiğinde (13.09: `rejected`) burada elle eşleme unutulmasın.
 */
export type AddressSuggestOutcome = AutocompleteLookup | { status: 'not_configured' } | { status: 'unsupported_country' };

export type AddressResolveOutcome = PlaceLookup | { status: 'not_configured' };

/** Sitenin dili → Google'ın cevap dili. Türkçe arayüzde adres yine ülkesinin dilinde biçimlenir. */
function languageFor(country: Country, locale: string): string {
  if (locale === 'fr' || locale === 'de') return locale;
  return country === 'DE' ? 'de' : 'fr';
}

export async function suggestAddresses(input: {
  country: Country;
  query: string;
  sessionToken: string;
  locale: string;
  near?: { lat: number; lng: number } | null;
}): Promise<AddressSuggestOutcome> {
  if (input.country !== 'DE') return { status: 'unsupported_country' };
  const apiKey = googleMapsApiKey();
  if (apiKey === null) return { status: 'not_configured' };

  const result = await autocompleteAddresses({
    apiKey,
    languageCode: languageFor(input.country, input.locale),
    query: input.query,
    country: input.country,
    sessionToken: input.sessionToken,
    ...(input.near ? { near: { latitude: input.near.lat, longitude: input.near.lng } } : {}),
  });
  return traceGoogleFailure('address_suggest', result);
}

export async function resolveAddressSuggestion(input: { placeId: string; sessionToken: string; locale: string }): Promise<AddressResolveOutcome> {
  const apiKey = googleMapsApiKey();
  if (apiKey === null) return { status: 'not_configured' };
  const result = await lookupPlace({ apiKey, languageCode: languageFor('DE', input.locale), placeId: input.placeId, sessionToken: input.sessionToken });
  return traceGoogleFailure('address_resolve', result);
}
