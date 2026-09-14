import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autocompleteAddresses, lookupPlace, validateAddress } from './client';
import { streetLineOf } from './address';

/**
 * **Google istemcisinin SÖZLEŞMESİ** — servise ne gönderdiğimiz ve cevabı nasıl okuduğumuz.
 *
 * Ağa çıkılmaz: `fetch` taklit ediliyor; ölçülen şey istenen URL, başlıklar ve gövde. Üç kapının
 * üçü de "önce ülke" kararını taşımalı (`includedRegionCodes` · `regionCode`) — bu satırlar
 * düşerse Almanya sorgusu Fransız sokağı önerir ve hiçbir çıktı bunu ele vermez.
 */
const gerçekFetch = globalThis.fetch;
let sonUrl = '';
let sonInit: RequestInit | undefined;

function cevap(json: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => json } as unknown as Response;
}

function taklit(json: unknown, status = 200): void {
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    sonUrl = String(url);
    sonInit = init;
    return cevap(json, status);
  }) as unknown as typeof fetch;
}

const gövde = () => JSON.parse(String(sonInit?.body)) as Record<string, unknown>;
const başlık = (name: string) => (sonInit?.headers as Record<string, string>)[name];

beforeEach(() => {
  sonUrl = '';
  sonInit = undefined;
});

afterEach(() => {
  globalThis.fetch = gerçekFetch;
});

const ortak = { apiKey: 'anahtar', languageCode: 'de' };

describe('otomatik tamamlama', () => {
  it('ülkeyle SINIRLAR, oturum jetonunu ve anahtarı taşır, adres türlerini ister', async () => {
    taklit({ suggestions: [{ placePrediction: { placeId: 'p1', text: { text: 'Hauptstraße 12, 77694 Kehl' }, structuredFormat: { mainText: { text: 'Hauptstraße 12' }, secondaryText: { text: '77694 Kehl' } } } }] });

    const sonuç = await autocompleteAddresses({ ...ortak, query: 'Hauptstr 12', country: 'DE', sessionToken: 'oturum-1' });

    expect(sonUrl).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(başlık('x-goog-api-key')).toBe('anahtar');
    expect(gövde()).toMatchObject({ input: 'Hauptstr 12', includedRegionCodes: ['DE'], sessionToken: 'oturum-1', languageCode: 'de' });
    // Sokak (`route`) YOK — öneri yalnız kapı düzeyinde (kullanıcı kararı 14.09).
    expect(gövde().includedPrimaryTypes).toEqual(['street_address', 'premise', 'subpremise']);
    expect(sonuç).toEqual({
      status: 'ok',
      suggestions: [{ placeId: 'p1', label: 'Hauptstraße 12, 77694 Kehl', main: 'Hauptstraße 12', secondary: '77694 Kehl' }],
    });
  });

  it('yakınlık ipucu SIRALAMA tercihi olarak gider (`locationBias`), süzgeç olarak değil', async () => {
    taklit({});
    await autocompleteAddresses({ ...ortak, query: 'Hauptstr', country: 'DE', sessionToken: 's', near: { latitude: 48.57, longitude: 7.81 } });

    expect(gövde().locationBias).toEqual({ circle: { center: { latitude: 48.57, longitude: 7.81 }, radius: 30_000 } });
    expect(gövde().locationRestriction).toBeUndefined();
  });

  it('boş cevap (alan hiç gelmez) SIFIR öneridir, arıza değil', async () => {
    taklit({});
    await expect(autocompleteAddresses({ ...ortak, query: 'xyzxyz', country: 'DE', sessionToken: 's' })).resolves.toEqual({ status: 'ok', suggestions: [] });
  });

  it('kısa sorguda ağa hiç çıkmaz', async () => {
    taklit({});
    await expect(autocompleteAddresses({ ...ortak, query: 'Ha', country: 'DE', sessionToken: 's' })).resolves.toEqual({ status: 'too_short' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('403 anahtar/fatura arızasını ADIYLA döner — "servis yok"tan ayrı', async () => {
    taklit({}, 403);
    await expect(autocompleteAddresses({ ...ortak, query: 'Hauptstr 12', country: 'DE', sessionToken: 's' })).resolves.toEqual({ status: 'denied' });
  });

  it('429 sınır aşımı, ağ hatası geçici yokluk', async () => {
    taklit({}, 429);
    await expect(autocompleteAddresses({ ...ortak, query: 'Hauptstr 12', country: 'DE', sessionToken: 's' })).resolves.toMatchObject({ status: 'rate_limited' });

    globalThis.fetch = vi.fn(async () => {
      throw new Error('ağ düştü');
    }) as unknown as typeof fetch;
    await expect(autocompleteAddresses({ ...ortak, query: 'Hauptstr 12', country: 'DE', sessionToken: 's' })).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('yer detayı', () => {
  it('DAR alan maskesiyle sorar, aynı jetonla oturumu kapatır, bileşenleri forma çevirir', async () => {
    taklit({
      formattedAddress: 'Hauptstraße 12, 77694 Kehl, Deutschland',
      location: { latitude: 48.5727, longitude: 7.8156 },
      addressComponents: [
        { longText: '12', shortText: '12', types: ['street_number'] },
        { longText: 'Hauptstraße', shortText: 'Hauptstr.', types: ['route'] },
        { longText: 'Kehl', shortText: 'Kehl', types: ['locality', 'political'] },
        { longText: '77694', shortText: '77694', types: ['postal_code'] },
        { longText: 'Deutschland', shortText: 'DE', types: ['country', 'political'] },
      ],
    });

    const sonuç = await lookupPlace({ ...ortak, placeId: 'p1', sessionToken: 'oturum-1' });

    expect(sonUrl).toContain('https://places.googleapis.com/v1/places/p1?');
    expect(sonUrl).toContain('sessionToken=oturum-1');
    expect(başlık('x-goog-fieldmask')).toBe('addressComponents,formattedAddress,location');
    expect(sonuç).toEqual({
      status: 'ok',
      address: {
        line1: 'Hauptstraße 12',
        postalCode: '77694',
        city: 'Kehl',
        country: 'DE',
        formattedAddress: 'Hauptstraße 12, 77694 Kehl, Deutschland',
        latitude: 48.5727,
        longitude: 7.8156,
        precision: 'housenumber',
      },
    });
  });

  it('numarasız sokak `street` kademesinde, kodsuz yerde kod `null` — uydurulmaz', async () => {
    taklit({
      location: { latitude: 48.5, longitude: 7.8 },
      addressComponents: [
        { longText: 'Hauptstraße', types: ['route'] },
        { longText: 'Kehl', types: ['locality'] },
        { longText: 'Deutschland', shortText: 'DE', types: ['country'] },
      ],
    });
    const sonuç = await lookupPlace({ ...ortak, placeId: 'p2', sessionToken: 's' });
    expect(sonuç).toMatchObject({ status: 'ok', address: { line1: 'Hauptstraße', postalCode: null, precision: 'street' } });
  });

  it('noktasız cevap adres sayılmaz', async () => {
    taklit({ addressComponents: [] });
    await expect(lookupPlace({ ...ortak, placeId: 'p3', sessionToken: 's' })).resolves.toEqual({ status: 'invalid_response' });
  });
});

describe('sokak satırının yazımı ülkeye bağlı', () => {
  it('Almanca sokak-numara, Fransızca numara-sokak', () => {
    expect(streetLineOf('DE', 'Hauptstraße', '12')).toBe('Hauptstraße 12');
    expect(streetLineOf('FR', 'Rue du Marché', '12')).toBe('12 Rue du Marché');
    expect(streetLineOf('DE', 'Hauptstraße', null)).toBe('Hauptstraße');
  });
});

describe('adres doğrulama', () => {
  const doğrulama = (overrides: Record<string, unknown> = {}) => ({
    result: {
      verdict: { validationGranularity: 'PREMISE', addressComplete: true, hasReplacedComponents: false, hasUnconfirmedComponents: false },
      address: {
        formattedAddress: 'Hauptstraße 12, 77694 Kehl, Deutschland',
        postalAddress: { regionCode: 'DE', postalCode: '77694', locality: 'Kehl', addressLines: ['Hauptstraße 12'] },
        addressComponents: [{ componentName: { text: '77694' }, componentType: 'postal_code', confirmationLevel: 'CONFIRMED', replaced: false }],
      },
      geocode: { location: { latitude: 48.5727, longitude: 7.8156 }, placeId: 'p1' },
      ...overrides,
    },
  });

  it('sokak satırını, kodu ve şehri birlikte gönderir — Google yanlış bileşeni bağlamdan düzeltir', async () => {
    taklit(doğrulama());
    await validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'Hauptstraße 12', postalCode: '77694', city: 'Kehl' });
    expect(sonUrl).toBe('https://addressvalidation.googleapis.com/v1:validateAddress');
    expect(gövde().address).toEqual({ regionCode: 'DE', addressLines: ['Hauptstraße 12'], postalCode: '77694', locality: 'Kehl' });
  });

  it('gövde YALNIZ adresi taşır — üst düzey dil alanını Google 400 ile reddediyor (ölçüldü 13.09)', async () => {
    taklit(doğrulama());
    await validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'Hauptstraße 12', postalCode: '77694', city: 'Kehl' });
    expect(Object.keys(gövde())).toEqual(['address']);
  });

  it('öteki 4xx İSTEĞİMİZİN hatasıdır — ADIYLA döner (`rejected`), geçici yokluğa karışmaz', async () => {
    // Yaşandı 13.09: gövdedeki fazla bir alan 400 aldı ve `unavailable` diye okunup gizlendi.
    taklit({ error: { status: 'INVALID_ARGUMENT' } }, 400);
    await expect(validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'Hauptstraße 12', postalCode: '77694', city: 'Kehl' })).resolves.toEqual({ status: 'rejected' });
  });

  it('PREMISE + doğrulanmış kod → kapı kademesi, nokta ve düzeltilmiş adres', async () => {
    taklit(doğrulama());
    const sonuç = await validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'Hauptstraße 12', postalCode: '77694', city: 'Kehl' });
    expect(sonuç).toEqual({
      status: 'ok',
      validation: {
        precision: 'housenumber',
        granularity: 'PREMISE',
        complete: true,
        unconfirmed: false,
        replacedPostalCode: false,
        formattedAddress: 'Hauptstraße 12, 77694 Kehl, Deutschland',
        postalCode: '77694',
        city: 'Kehl',
        latitude: 48.5727,
        longitude: 7.8156,
        placeId: 'p1',
      },
    });
  });

  it('servis kodu DEĞİŞTİRDİYSE bunu bayrakla söyler — "yanlış kod" sinyali', async () => {
    taklit(
      doğrulama({
        verdict: { validationGranularity: 'PREMISE', addressComplete: true, hasReplacedComponents: true, hasUnconfirmedComponents: false },
        address: {
          formattedAddress: 'Hauptstraße 12, 77694 Kehl, Deutschland',
          postalAddress: { regionCode: 'DE', postalCode: '77694', locality: 'Kehl' },
          addressComponents: [{ componentName: { text: '77694' }, componentType: 'postal_code', confirmationLevel: 'CONFIRMED', replaced: true }],
        },
      }),
    );
    const sonuç = await validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'Hauptstraße 12', postalCode: '02000', city: 'Kehl' });
    expect(sonuç).toMatchObject({ status: 'ok', validation: { replacedPostalCode: true, postalCode: '77694', precision: 'housenumber' } });
  });

  it('tanımadığı kademeyi düşürmez, `GRANULARITY_UNSPECIFIED` sayar', async () => {
    taklit(doğrulama({ verdict: { validationGranularity: 'YENI_KADEME' } }));
    const sonuç = await validateAddress({ apiKey: 'anahtar', country: 'DE', line1: 'x', postalCode: '77694', city: 'Kehl' });
    expect(sonuç).toMatchObject({ status: 'ok', validation: { granularity: 'GRANULARITY_UNSPECIFIED', precision: 'municipality' } });
  });
});
