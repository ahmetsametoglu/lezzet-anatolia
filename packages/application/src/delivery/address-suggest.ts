import { addressLineOf, searchAddresses } from '@lezzet/address';
import { autocompleteAddresses, lookupPlace, type AutocompleteLookup, type PlaceLookup } from '@lezzet/address/google';
import type { AddressGeoPrecision, Country } from '@lezzet/types';
import { googleMapsApiKey, traceGoogleFailure } from './google-maps';

/**
 * **Adres önerisi — sunucu kapısı** (13.09, "önce ülke, sonra listeden seç" kararı).
 *
 * ── FRANSA BURADAN GEÇMEZ ──────────────────────────────────────────────────
 * FR önerisi BAN'a TARAYICIDAN gidiyor (`use-address-search.hook` künyesi: kota IP başına, sunucudan
 * geçirmek tüm müşterileri tek IP'ye bağlardı). Almanya için tersi geçerli: Google'da kota projeye
 * bağlı, anahtar gizli — çağrı sunucudan. Bu kapı bu yüzden FR'de `unsupported_country` döner:
 * yanlışlıkla FR sorgusu buraya düşerse Google'a para ödemeyelim, hata da sessiz kalmasın.
 * **Bu iki kapı web'in sunucu eylemleri içindir. Native çekmecenin TEK kapısı `lookupAddressOptions`
 * (21.313, dosyanın sonunda) Fransa'yı da sunucudan — BAN'dan — geçirir.**
 *
 * ── İKİ ADIM, TEK OTURUM ───────────────────────────────────────────────────
 * `suggestAddresses` yazarken (her tuşta, gecikmeli), `resolveAddressSuggestion` seçince — aynı
 * `sessionToken` ile. Jetonu istemci üretir ve seçimle bırakır; fiyat oturum kademesinden kesilir
 * (`@lezzet/address/google` künyesi).
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

/*
  ── TEK KAPI, ÜLKEYE GÖRE SAĞLAYICI (21.313 · kullanıcı kararı 14.09) ─────────────────────────
  *"Bu ikisi de adrestir. Ülkesine göre farklı bir servis, farklı bir hizmet sağlayıcı devreye
  girebilir. Fakat bunlar aynı paket(te) oluşturulmalı."* Adres çekmecesi öneriyi ve seçimi TEK
  kapıdan ister; ülke yalnız sağlayıcıyı seçer: Fransa → BAN (`@lezzet/address`), Almanya → Google
  Places (`@lezzet/address/google`). Elle girilen adresin doğrulaması zaten bu desende (`geocoder()` —
  aynı iki sağlayıcı, tek port); öneri onun kardeşi.

  ── BEDELİ: BAN KOTASI ARTIK SUNUCUNUN IP'SİNDE ─────────────────────────────────────────────
  BAN'ın sınırı IP başına saniyede 50 istek; 09.08'de öneri bu yüzden CİHAZDAN çağrılıyordu (her
  müşteri kendi kotası). Tek kapıyla bütün müşteriler sunucunun kotasını paylaşır. Bugünkü ölçekte
  (tek şehir, gecikmeli arama — tuş başına değil duraklama başına bir istek) karşılığı yok; kota
  dolarsa kapı `busy` döner, çekmece "biraz sonra" der ve elle giriş açık kalır.

  Web'in Fransa önerisi hâlâ tarayıcıdan gidiyor (`apps/web/lib/address/use-address-search.hook.ts`);
  tek kapıya geçişi web şeridinin işi (not bırakıldı).
*/

/** Açılmış adres — sokak satırı, kod, şehir ve noktası (kaynağıyla). Google kodu/şehri vermeyebilir. */
export interface AddressLookupAddress {
  line1: string;
  postalCode: string | null;
  city: string | null;
  point: { lat: number; lng: number; precision: AddressGeoPrecision; source: 'ban' | 'google' };
}

/**
 * Öneri satırı. `address` sağlayıcı öneride tam adresi veriyorsa (BAN) doludur; vermiyorsa (Google
 * yalnız metin döner) `null` ve seçim `resolveAddressOption` ister.
 */
export interface AddressLookupOption {
  id: string;
  title: string;
  subtitle: string | null;
  address: AddressLookupAddress | null;
}

/** `busy`: sağlayıcının kotası doldu — geçici; hata değil, "biraz sonra". */
export type AddressLookupOutcome = { status: 'ok'; options: AddressLookupOption[] } | { status: 'busy' };

interface AddressLookupInput {
  country: Country;
  query: string;
  /** Google'ın ücret oturumu (yazma boyunca aynı, seçimle biter); BAN kullanmaz. */
  sessionToken: string;
  locale: string;
}

/** Fransa — BAN, YALNIZ KAPI DÜZEYİ (kullanıcı kararı 14.09: *"sadece kapı numarası olanlar gelsin"*). */
async function lookupFrance(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  const found = await searchAddresses({ query: input.query, kind: 'housenumber' });
  if (found.status === 'rate_limited') return { status: 'busy' };
  // Servis düştü ya da cevap sözleşmeyi bozdu: öneri yok, müşteri elle yazar (defter reddetmez — 10.08).
  if (found.status !== 'ok') return { status: 'ok', options: [] };
  return {
    status: 'ok',
    options: found.suggestions.map((row) => {
      const line1 = addressLineOf(row);
      return {
        id: row.id,
        title: line1,
        subtitle: `${row.postalCode} ${row.city}`,
        address: {
          line1,
          postalCode: row.postalCode,
          city: row.city,
          point: { lat: row.latitude, lng: row.longitude, precision: row.kind, source: 'ban' },
        },
      };
    }),
  };
}

/** Almanya — Google Places; öneri yalnız metin taşır, tam adres seçimle açılır (`resolveAddressOption`). */
async function lookupGermany(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  const outcome = await suggestAddresses({ ...input, country: 'DE' });
  // Anahtar yok / reddedildi: iz `traceGoogleFailure`da kaldı; müşteri elle yazar.
  if (outcome.status !== 'ok') return { status: 'ok', options: [] };
  return {
    status: 'ok',
    options: outcome.suggestions.map((row) => ({ id: row.placeId, title: row.main, subtitle: row.secondary, address: null })),
  };
}

/** Ülke → sağlayıcı. `geocoder()`un `pick`inin öneri tarafı: yeni bir ülke yeni bir satırdır, çağıran değişmez. */
const LOOKUP_PROVIDERS: Record<Country, (input: AddressLookupInput) => Promise<AddressLookupOutcome>> = {
  FR: lookupFrance,
  DE: lookupGermany,
};

export function lookupAddressOptions(input: AddressLookupInput): Promise<AddressLookupOutcome> {
  return LOOKUP_PROVIDERS[input.country](input);
}

/** Seçilen önerinin tam adresi. Öneride adresi zaten veren sağlayıcıda (BAN) ikinci adım yoktur: `null`. */
export async function resolveAddressOption(input: {
  country: Country;
  id: string;
  sessionToken: string;
  locale: string;
}): Promise<AddressLookupAddress | null> {
  if (input.country !== 'DE') return null;
  const outcome = await resolveAddressSuggestion({ placeId: input.id, sessionToken: input.sessionToken, locale: input.locale });
  if (outcome.status !== 'ok') return null;
  const found = outcome.address;
  return {
    line1: found.line1,
    postalCode: found.postalCode,
    city: found.city,
    point: { lat: found.latitude, lng: found.longitude, precision: found.precision, source: 'google' },
  };
}
