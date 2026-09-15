import { MIN_QUERY_LENGTH } from '../min-query-length';
import { toPrediction, toResolvedAddress, toValidation, type AddressCountry, type AddressPrediction, type AddressValidation, type ResolvedAddress } from './address';
import { AutocompleteResponseSchema, PlaceDetailsResponseSchema, ValidateAddressResponseSchema } from './google.schema';

/*
  Google Maps Platform istemcisi: otomatik tamamlama, yer detayı ve adres doğrulama. Anahtarı çağıran verir ve paket env
  okumaz; fırlatmaz, log yazmaz, her başarısızlık adlı döner (izi `application/delivery/google-maps.ts` tutar).
*/

const PLACES_BASE = 'https://places.googleapis.com/v1';
const VALIDATION_URL = 'https://addressvalidation.googleapis.com/v1:validateAddress';

/** Öneri yardımcıdır; uzun bekleyen bir alan yazmayı engeller. */
const DEFAULT_TIMEOUT_MS = 6000;

/** Servis sınır aşımında süre söylemezse. */
const DEFAULT_RETRY_AFTER_MS = 5000;

/** Yakınlık ipucunun yarıçapı: süzgeç değil sıralama; 30 km Strasbourg'dan Kehl'e ve çevre köylere yeter. */
const BIAS_RADIUS_METERS = 30_000;

/** Yer değil kapı istenir, çünkü teslimat kapı düzeyinde: kapı, bina, daire. */
const ADDRESS_TYPES = ['street_address', 'premise', 'subpremise'];

export type GoogleFailure =
  | { status: 'rate_limited'; retryAfterMs: number }
  /** 401/403: anahtar yok, kısıtlı ya da fatura kapalı; yapılandırma arızası. */
  | { status: 'denied' }
  /** Öteki 4xx: isteğimiz sözleşmeye uymuyor; bizim hatamız ve geçici değil, `unavailable`a karışırsa kimse aramaz. */
  | { status: 'rejected' }
  | { status: 'unavailable' }
  | { status: 'invalid_response' };

export type AutocompleteLookup = { status: 'ok'; suggestions: AddressPrediction[] } | { status: 'too_short' } | GoogleFailure;
export type PlaceLookup = { status: 'ok'; address: ResolvedAddress } | GoogleFailure;
export type ValidationLookup = { status: 'ok'; validation: AddressValidation } | GoogleFailure;

interface CommonInput {
  apiKey: string;
  /** Cevabın dili (BCP-47); Google adresi o dilde biçimler. */
  languageCode: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AutocompleteInput extends CommonInput {
  query: string;
  /** Sonuçlar bu ülkeyle sınırlı (`includedRegionCodes`). */
  country: AddressCountry;
  /** Otomatik tamamlama ve yer detayı aynı jetonla giderse oturum fiyatı uygulanır; jetonu çağıran üretir, seçimle biter. */
  sessionToken: string;
  /** Müşterinin bilinen yeri; yakın olan öne alınır, süzgeç değil. */
  near?: { latitude: number; longitude: number };
}

export interface PlaceInput extends CommonInput {
  placeId: string;
  /** Otomatik tamamlamayla aynı jeton; oturumu kapatır. */
  sessionToken: string;
}

/** Bu uç dil parametresi almıyor. */
export interface ValidateInput extends Omit<CommonInput, 'languageCode'> {
  country: AddressCountry;
  /** Sokak satırı, numara dâhil. */
  line1: string;
  /** Kod ve şehir daima gider: bağlamsız soruda Google rastgele bir kapı seçiyor. */
  postalCode: string;
  city: string;
}

/** Serbest metinden adres tahminleri, yalnız `country` içinde. */
export async function autocompleteAddresses(input: AutocompleteInput): Promise<AutocompleteLookup> {
  const query = input.query.trim();
  if (query.length < MIN_QUERY_LENGTH) return { status: 'too_short' };

  const body = {
    input: query,
    includedRegionCodes: [input.country],
    includedPrimaryTypes: ADDRESS_TYPES,
    languageCode: input.languageCode,
    sessionToken: input.sessionToken,
    ...(input.near
      ? { locationBias: { circle: { center: { latitude: input.near.latitude, longitude: input.near.longitude }, radius: BIAS_RADIUS_METERS } } }
      : {}),
  };

  const result = await call(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    apiKey: input.apiKey,
    body,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  if (result.status !== 'ok') return result;

  const parsed = AutocompleteResponseSchema.safeParse(result.json);
  if (!parsed.success) return { status: 'invalid_response' };
  const predictions = (parsed.data.suggestions ?? []).flatMap((row) => (row.placePrediction ? [toPrediction(row.placePrediction)] : []));
  return { status: 'ok', suggestions: predictions };
}

/** Seçilen tahminin adresi: bileşenler, nokta, biçimli adres. */
export async function lookupPlace(input: PlaceInput): Promise<PlaceLookup> {
  const params = new URLSearchParams({ languageCode: input.languageCode, sessionToken: input.sessionToken });
  const result = await call(`${PLACES_BASE}/places/${encodeURIComponent(input.placeId)}?${params.toString()}`, {
    method: 'GET',
    apiKey: input.apiKey,
    // Alan maskesi zorunlu ve dar: fatura istenen en yüksek kademeden kesilir.
    fieldMask: 'addressComponents,formattedAddress,location',
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  if (result.status !== 'ok') return result;

  const parsed = PlaceDetailsResponseSchema.safeParse(result.json);
  if (!parsed.success) return { status: 'invalid_response' };
  const address = toResolvedAddress(parsed.data);
  return address === null ? { status: 'invalid_response' } : { status: 'ok', address };
}

/**
 * "Bu kapı var mı": doğrulama, düzeltilmiş adres ve nokta tek çağrıda.
 * Gövdede dil yok: bu uç `languageCode` alanını tanımıyor ve isteğin tamamını 400 ile reddediyor.
 */
export async function validateAddress(input: ValidateInput): Promise<ValidationLookup> {
  const body = {
    address: { regionCode: input.country, addressLines: [input.line1.trim()], postalCode: input.postalCode, locality: input.city },
  };

  const result = await call(VALIDATION_URL, { method: 'POST', apiKey: input.apiKey, body, timeoutMs: input.timeoutMs, signal: input.signal });
  if (result.status !== 'ok') return result;

  const parsed = ValidateAddressResponseSchema.safeParse(result.json);
  if (!parsed.success) return { status: 'invalid_response' };
  return { status: 'ok', validation: toValidation(parsed.data) };
}

async function call(
  url: string,
  options: { method: 'GET' | 'POST'; apiKey: string; body?: unknown; fieldMask?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ status: 'ok'; json: unknown } | GoogleFailure> {
  // Zaman aşımı elle kuruluyor: `AbortSignal.timeout` ve `AbortSignal.any` her motorda yok.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const relay = () => controller.abort();
  options.signal?.addEventListener('abort', relay);

  try {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-goog-api-key': options.apiKey,
    };
    if (options.fieldMask) headers['x-goog-fieldmask'] = options.fieldMask;

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (response.status === 429) return { status: 'rate_limited', retryAfterMs: retryAfterOf(response) };
    if (response.status === 401 || response.status === 403) return { status: 'denied' };
    if (response.status >= 400 && response.status < 500) return { status: 'rejected' };
    if (!response.ok) return { status: 'unavailable' };

    return { status: 'ok', json: await response.json() };
  } catch {
    // Ağ hatası, iptal ve zaman aşımı geçici sayılır.
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', relay);
  }
}

function retryAfterOf(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header === null) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}
