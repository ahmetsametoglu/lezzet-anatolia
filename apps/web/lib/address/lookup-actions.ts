'use server';

import { getLocale } from 'next-intl/server';
import {
  geocoder,
  resolveAddressSuggestion,
  suggestAddresses,
  type AddressPointCandidate,
  type AddressResolveOutcome,
  type AddressSuggestOutcome,
} from '@lezzet/application';
import type { Country } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';

/**
 * Adres penceresinin sunucu kapıları (v1, 13.09) — Almanya önerisi (Google Places), seçilen önerinin
 * açılışı ve elle girilen adresin doğrulanması (Fransa'da BAN, Almanya'da Google Address Validation).
 *
 * Fransa önerisi buradan GEÇMEZ: BAN'a tarayıcıdan gidiliyor (`use-address-search.hook` künyesi —
 * kota IP başına). Google'da kota projeye bağlı ve anahtar gizli: çağrı sunucudan.
 *
 * Yalnız GİRİŞLİ müşteri: adres defteri hesaba bağlı, Google da oturum başına ücret keser — kapıyı
 * ziyaretçiye açmak faturayı herkese açmak olurdu.
 *
 * Fırlatmaz; her başarısızlık boş liste ya da `null` döner ve ekran elle girişe düşer. Google'ın adlı
 * hataları uygulama katmanında iz bırakır (`traceGoogleFailure`).
 */

/** Almanya öneri satırı — şekli uygulama katmanının sonucundan TÜRER (paket değişirse burası izler). */
export type GermanSuggestion = Extract<AddressSuggestOutcome, { status: 'ok' }>['suggestions'][number];
/** Seçilen önerinin açılmış hâli: sokak satırı, kod, şehir, nokta, incelik. */
export type ResolvedGermanAddress = Extract<AddressResolveOutcome, { status: 'ok' }>['address'];

/**
 * Doğrulanmış nokta — öneriden seçilen ya da elle girilip doğrulanan kapının noktası, inceliği ve
 * KAYNAĞI (BAN / Google); kayda ADAY olarak gider.
 *
 * **Kaynak ZORUNLU (14.09):** noktanın kaynağı düştüğünde uygulama katmanı `ban` varsayıyordu ve
 * Almanya'nın Google noktası `ban` diye yazılıyordu (ölçüldü: 90451 Nürnberg, `geo_source = ban`).
 * Kaynak yaşlanma kuralını belirliyor — Google noktası 30 günden uzun saklanamaz (`geocode-scan`),
 * yanlış etiketli nokta o kuralın dışına düşüyordu.
 */
export type CheckedPoint = Required<AddressPointCandidate>;

export async function suggestGermanAddressesAction(input: { query: string; sessionToken: string }): Promise<GermanSuggestion[]> {
  if (!(await currentCustomerId())) return [];
  const outcome = await suggestAddresses({ country: 'DE', query: input.query, sessionToken: input.sessionToken, locale: await getLocale() });
  return outcome.status === 'ok' ? outcome.suggestions : [];
}

export async function resolveGermanAddressAction(input: { placeId: string; sessionToken: string }): Promise<ResolvedGermanAddress | null> {
  if (!(await currentCustomerId())) return null;
  const outcome = await resolveAddressSuggestion({ placeId: input.placeId, sessionToken: input.sessionToken, locale: await getLocale() });
  return outcome.status === 'ok' ? outcome.address : null;
}

/**
 * Elle girilen adresi doğrular — tarama işinin kullandığı AYNI kapı (`geocoder().locate`): Fransa'da
 * BAN, Almanya'da Google Address Validation. Bulunursa nokta ve incelik döner ve kayda aday olarak
 * gider (sunucu yine makullük süzgecinden geçirir — `resolveAddressPoint`). Bulunamazsa `null`: adres
 * yine kaydedilir (defter hiçbir hâlde reddetmez, kullanıcı kararı 10.08), noktasını tarama arar.
 */
export async function checkAddressAction(input: { line1: string; postalCode: string; city: string; country: Country }): Promise<CheckedPoint | null> {
  if (!(await currentCustomerId())) return null;
  const outcome = await geocoder().locate(input);
  return outcome.status === 'ok' ? { lat: outcome.point.lat, lng: outcome.point.lng, precision: outcome.precision, source: outcome.source } : null;
}
