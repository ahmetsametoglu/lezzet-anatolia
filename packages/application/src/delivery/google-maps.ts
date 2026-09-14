import { captureError, SOURCES } from '@lezzet/observability';

/**
 * Google Maps Platform anahtarı — **env'i okuyan TEK yer** (13.09).
 *
 * İki kapı aynı anahtarı kullanıyor: adres önerisi (Places Autocomplete + Place Details, sepetteki
 * adres formu) ve adres doğrulama (Address Validation, sipariş anı — 11.11). İkisi ayrı ayrı env
 * okusaydı biri bir gün başka bir değişken adı öğrenir, öteki öğrenmezdi.
 *
 * **Anahtar YOKKEN adlı yokluk:** çağıranlar `googleMapsConfigured()` ile sorar ve müşteriye "şu an
 * öneri yok / doğrulama kapalı" der; hiçbir yol fırlatmaz (`routeMatrixProvider` deseni). Anahtar
 * geldiği gün (`GOOGLE_MAPS_API_KEY`) yalnız env değişir, kod değişmez.
 *
 * Anahtar SUNUCUDA kalır: paket tarayıcıya inmez, çağrılar sunucu eyleminden geçer
 * (`@lezzet/address-google` künyesi — kota projeye bağlı, anahtar herkesin olurdu).
 */
export function googleMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

export function googleMapsConfigured(): boolean {
  return googleMapsApiKey() !== null;
}

/** Hangi Google kapısı — log bağlamı; adres metni YAZILMAZ (`CLAUDE §1`: kimlik evet, içerik hayır). */
type GoogleFlow = 'address_validation' | 'address_suggest' | 'address_resolve';

/**
 * Geçici OLMAYAN iki Google arızasının izi — cevabı olduğu gibi geri verir (13.09).
 *
 * `denied` (401/403: anahtar, API kısıtı, fatura) ve `rejected` (öteki 4xx: isteğimiz sözleşmeye
 * uymuyor) kendi kendine düzelmez, ama çağıranların hepsi müşteriye "şu an yok" deyip SUSUYOR
 * (FAIL-OPEN) — iz bırakılmazsa kimse fark etmez. Ölçüldü 13.09: anahtar kısıtındaki 403 ve
 * gövdedeki fazla alanın 400'ü, bu kapı yokken `unavailable`a karışıp hiçbir yere yazılmıyordu.
 * Geçici hâller (`unavailable`, `rate_limited`) yazılmaz: servisin düştüğü bir öğleden sonra her
 * siparişe bir satır, sinyal değil gürültüdür.
 */
export async function traceGoogleFailure<T extends { status: string }>(flow: GoogleFlow, result: T): Promise<T> {
  if (result.status === 'denied' || result.status === 'rejected') {
    await captureError(new Error(`Google ${flow}: ${result.status}`), {
      source: SOURCES.applicationDelivery,
      context: { flow, status: result.status },
    });
  }
  return result;
}
