import { toPrediction, toResolvedAddress, toValidation, type AddressCountry, type AddressPrediction, type AddressValidation, type ResolvedAddress } from './address';
import { AutocompleteResponseSchema, PlaceDetailsResponseSchema, ValidateAddressResponseSchema } from './google.schema';

/*
  GOOGLE MAPS PLATFORM İSTEMCİSİ — Almanya adresleri için üç kapı (kullanıcı kararı 13.09; Address
  Validation kararı 02.09 `INTEGRATIONS.md`).

  ── ANAHTAR ÇAĞIRANDAN GELİR, PAKET ENV OKUMAZ ─────────────────────────────
  Env'i tek yer okur (uygulama katmanının fabrikası). Bu paket yalnız "şu anahtarla şu soruyu sor"
  bilir; anahtar yoksa fabrika bu paketi hiç çağırmaz ve **adlı yokluk** döner.

  ── SUNUCUDAN ÇAĞRILIR, TARAYICIDAN DEĞİL ─────────────────────────────────
  BAN anahtarsız ve kotası IP başına olduğu için tarayıcıdan çağrılıyor; Google'da kota projeye
  bağlı ve anahtar gizli. Tarayıcıya inen bir anahtar herkesin anahtarıdır — çağrı sunucu eyleminden
  geçer. Paket yine izomorfik yazıldı (`fetch` + `AbortController`), çünkü mobil arka uç da çağırır.

  ── OTURUM JETONU FİYATIN KENDİSİ ──────────────────────────────────────────
  Otomatik tamamlama + seçilen yerin detayı aynı `sessionToken` ile giderse oturum olarak
  fiyatlanır (13.09 fiyat sayfası: oturum kullanımı ücretsiz, tek tek istekler 10.000/ay sonrası
  ücretli). Jetonu çağıran üretir (yazmaya başlarken bir UUID), seçimle biter, bir daha kullanılmaz.

  ── FIRLATMAZ, HER BAŞARISIZLIK ADLI ──────────────────────────────────────
  `rate_limited` · `denied` (401/403 — anahtar, kısıt, fatura) · `rejected` (öteki 4xx — isteğimiz
  sözleşmeye uymuyor) · `unavailable` (ağ, zaman aşımı, 5xx) · `invalid_response`. `denied` ile
  `rejected` geçici DEĞİL ve `unavailable`dan AYRI ki log bunu söyleyebilsin. Adres önerisi
  yardımcıdır: servis düşerse müşteri elle yazar, ekran çökmez. Log yazmak çağıranın işi (bu paket
  `observability` bilmez — BAN paketiyle aynı gerekçe); iz `application/delivery/google-maps.ts`de.

  ── POLİTİKA (okundu 13.09) ────────────────────────────────────────────────
  · Önerilerin gösterildiği yerde Google logosu (harita yokken) — çizen YÜZEYİN işi.
  · Places içeriği önbelleğe alınmaz; süresiz saklanabilen tek şey `placeId`. Koordinat 30 gün.
    Yaşlanma kuralı uygulama katmanında (`geocode-scan`).
*/

const PLACES_BASE = 'https://places.googleapis.com/v1';
const VALIDATION_URL = 'https://addressvalidation.googleapis.com/v1:validateAddress';

/** Ağa çıkmadan önceki en kısa sorgu — BAN paketiyle aynı eşik, aynı gerekçe. */
export const MIN_QUERY_LENGTH = 3;

/** Ağ beklemesinin tavanı. Öneri yardımcıdır; on saniye bekleyen bir alan yazmayı engeller. */
const DEFAULT_TIMEOUT_MS = 6000;

/** Sınır aşımında servis süre söylemezse. */
const DEFAULT_RETRY_AFTER_MS = 5000;

/**
 * Yakınlık ipucunun yarıçapı (metre) — bir SÜZGEÇ değil, sıralama tercihi (`locationBias`).
 * Müşterinin posta kodu merkezinden 30 km: Strasbourg'dan Kehl'e ve çevre köylere yeter, ülkenin
 * öbür ucundaki aynı adlı sokağı da elemez (BAN'daki `near` ipucuyla aynı davranış).
 */
const BIAS_RADIUS_METERS = 30_000;

/**
 * Adres türleri — kafe, dükkân gibi yerler değil, KAPILAR istensin. Beş tavanı Google'ın;
 * dördü adresin kendisi: kapı · bina · daire · sokak.
 */
const ADDRESS_TYPES = ['street_address', 'premise', 'subpremise', 'route'];

export type GoogleFailure =
  | { status: 'rate_limited'; retryAfterMs: number }
  /** 401/403 — anahtar yok, kısıtlı ya da fatura kapalı. Yapılandırma arızası; müşteriye "şu an yok" denir. */
  | { status: 'denied' }
  /**
   * Öteki 4xx — isteğimiz Google'ın sözleşmesine uymuyor. BİZİM hatamız ve geçici DEĞİL: `unavailable`a
   * karışınca "servis düştü" diye okunur, kimse aramaz (yaşandı 13.09: gövdedeki `languageCode` 400
   * aldı ve paket bunu `unavailable` diye bildirdi).
   */
  | { status: 'rejected' }
  | { status: 'unavailable' }
  | { status: 'invalid_response' };

export type AutocompleteLookup = { status: 'ok'; suggestions: AddressPrediction[] } | { status: 'too_short' } | GoogleFailure;
export type PlaceLookup = { status: 'ok'; address: ResolvedAddress } | GoogleFailure;
export type ValidationLookup = { status: 'ok'; validation: AddressValidation } | GoogleFailure;

interface CommonInput {
  apiKey: string;
  /** Cevabın dili (BCP-47) — müşterinin sitedeki dili; Google adresi o dilde biçimler. */
  languageCode: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AutocompleteInput extends CommonInput {
  query: string;
  /** Sonuçlar bu ülkeyle SINIRLIDIR (`includedRegionCodes`) — "önce ülke" kararının servise yansıması. */
  country: AddressCountry;
  sessionToken: string;
  /** Müşterinin bilinen yeri — öneriler buna yakın olanı öne alır; süzgeç değil. */
  near?: { latitude: number; longitude: number };
}

export interface PlaceInput extends CommonInput {
  placeId: string;
  /** Otomatik tamamlamayla AYNI jeton — oturumu kapatır ve fiyatı oturum kademesine bağlar. */
  sessionToken: string;
}

/** Dil alanı YOK — bu uç dil parametresi almıyor (`validateAddress` künyesi). */
export interface ValidateInput extends Omit<CommonInput, 'languageCode'> {
  country: AddressCountry;
  /** Sokak satırı (numara dâhil). */
  line1: string;
  /**
   * Kod ve şehir DAİMA gider: Google yanlış bileşeni bağlamdan düzeltir (`replacedPostalCode`).
   * Bağlamsız soru rastgele bir kapı seçiyor — ölçüldü 13.09: yalnız "Hauptstraße 1" gönderildi,
   * Google 84544 Aschau am Inn'i seçti; müşteri 77694 Kehl'deydi.
   */
  postalCode: string;
  city: string;
}

/** Serbest metinden adres tahminleri — yalnız `country` içinde. */
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

/** Seçilen tahminin adresi — bileşenler, nokta, biçimli adres (Essentials alan maskesi). */
export async function lookupPlace(input: PlaceInput): Promise<PlaceLookup> {
  const params = new URLSearchParams({ languageCode: input.languageCode, sessionToken: input.sessionToken });
  const result = await call(`${PLACES_BASE}/places/${encodeURIComponent(input.placeId)}?${params.toString()}`, {
    method: 'GET',
    apiKey: input.apiKey,
    // Alan maskesi ZORUNLU (maskesiz istek hata döner) ve DAR: Essentials kademesi — Pro/Enterprise
    // alanı istenmez, fatura en yüksek istenen kademeden kesilir.
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
 * "Bu kapı var mı" — doğrulama + düzeltilmiş adres + nokta, tek çağrıda (02.09 kararı).
 *
 * Gövdede dil YOK: bu uçta üst düzey `languageCode` alanı tanımlı değil ve gönderilince Google
 * isteğin tamamını 400 ile reddediyor (ölçüldü 13.09, gerçek anahtarla: `Unknown name
 * "languageCode": Cannot find field`). Sahte `fetch`li birim testi bunu göremiyordu — gövdenin
 * alan listesini artık test sabitliyor.
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

/* Tek okuma yolu: üç uç aynı hata ailesinden geçsin. */
async function call(
  url: string,
  options: { method: 'GET' | 'POST'; apiKey: string; body?: unknown; fieldMask?: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<{ status: 'ok'; json: unknown } | GoogleFailure> {
  /* Zaman aşımı ELLE kuruluyor: `AbortSignal.timeout`/`AbortSignal.any` her motorda yok. */
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
    /* Ağ hatası, iptal ve zaman aşımı burada birleşir ve hepsi GEÇİCİ sayılır. */
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
