import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureError } from '@lezzet/observability';
import { geocoder } from './geocode-provider';

/* İz bırakma ÖLÇÜLÜR, yazılmaz: birim projesinde DB yok ve sınanan şey "çağrıldı mı, hangi adla". */
vi.mock('@lezzet/observability', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  captureError: vi.fn(async () => {}),
}));

/**
 * **BAN adaptörünün SÖZLEŞMESİ** (11.9 · 11.11) — servise ne gönderdiğimiz.
 *
 * Bu dosyanın varlık sebebi ölçülmüş bir körlük: `locate` posta kodunu **sert süzgeç** olarak
 * gönderiyor ve bu doğru (kodu zaten biliyoruz), ama aynı kısıt *"adres aslında BAŞKA kodda"*
 * hâlini görmemizi yapısal olarak imkânsız kılıyordu. Kullanıcının vakasında (01.09) pinli sorgu
 * 0,717'lik Strasbourg **sokağını** döndürdü; pinsiz sorgu 0,973 ile **67380 Lingolsheim'daki
 * kapıyı** buluyor.
 *
 * Yani iki metodun **birbirinden farklı sorması** bir ayrıntı değil, özelliğin kendisi — ve bunu
 * hiçbir çıktı ele vermez: ikisi de makul görünen bir cevap döndürür. Testin işi tam olarak bu
 * farkı çivilemek.
 *
 * Ağa çıkılmaz: `fetch` taklit ediliyor ve **istenen URL'nin kendisi** ölçülüyor.
 */
const gerçekFetch = globalThis.fetch;
let sonUrl: string;

/** BAN'ın gerçek cevap şekli — tek özellik, `[boylam, enlem]` sırasıyla. */
function banCevabı(rows: { label: string; postcode: string; type: string; score: number }[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      type: 'FeatureCollection',
      features: rows.map((row, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [7.7455, 48.5839] },
        properties: {
          label: row.label,
          score: row.score,
          id: `id-${i}`,
          type: row.type,
          postcode: row.postcode,
          citycode: '67482',
          city: 'Strasbourg',
        },
      })),
    }),
  } as unknown as Response;
}

beforeEach(() => {
  sonUrl = '';
  globalThis.fetch = vi.fn(async (url: unknown) => {
    sonUrl = String(url);
    return banCevabı([{ label: '192c Rue du Maréchal Foch 67380 Lingolsheim', postcode: '67380', type: 'housenumber', score: 0.973 }]);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = gerçekFetch;
});

const sorgu = { line1: '192c Rue du Maréchal Foch', postalCode: '67000', city: 'Strasbourg', country: 'FR' as const };

/** `URLSearchParams` boşluğu `+` yazar; okunur karşılaştırma için geri çevrilir. */
const okunur = (url: string) => decodeURIComponent(url).replace(/\+/g, ' ');

describe('BAN adaptörü · locate (kısıtlı)', () => {
  it('posta kodunu SERT SÜZGEÇ olarak gönderir', () => {
    // Bu doğru davranış ve korunmalı: kodu zaten biliyoruz, başka kodda çıkan sonuç `locate`in
    // aradığı cevap değil. Kısıtın KÖRLÜĞÜNÜ `elsewhere` açıyor, `locate` değil.
    return geocoder()
      .locate(sorgu)
      .then(() => {
        expect(sonUrl).toContain('postcode=67000');
      });
  });

  it('sorguya şehri de katar — pinli aramada bağlam skoru yükseltir', async () => {
    await geocoder().locate(sorgu);

    expect(okunur(sonUrl)).toContain('Strasbourg');
  });
});

describe('BAN adaptörü · elsewhere (kısıtsız)', () => {
  it('POSTA KODUNU GÖNDERMEZ — körlüğü açan tek şey bu', async () => {
    /* Bu satır düşerse özellik sessizce ölür: `elsewhere` yine bir cevap döndürür, yalnız
       "başka kodda" hâlini bir daha hiç bulamaz ve her adres "kapı doğrulanamadı" der. */
    await geocoder().elsewhere(sorgu);

    expect(sonUrl).not.toContain('postcode');
  });

  it('ŞEHRİ de sorguya koymaz — yanlış kodun şehri de çoğu zaman yanlıştır', async () => {
    /* Müşteri Strasbourg yazdı, adres Lingolsheim'da. Şehri sorguya koymak aynı yanlışı ikinci kez
       dayatır ve doğru cevabın skorunu düşürürdü. */
    await geocoder().elsewhere(sorgu);

    expect(okunur(sonUrl)).not.toContain('Strasbourg');
    expect(okunur(sonUrl)).toContain('192c Rue du Maréchal Foch');
  });

  it('adayları servisin dediği gibi taşır — eşik uygulamaz, yeniden sıralamaz', async () => {
    // Ayıklama KARARIN işi (`addressVerdict`); adaptör yorumlamaz. İkisi karışsaydı eşik iki yerde
    // yaşar ve bir gün ayrışırdı.
    const sonuç = await geocoder().elsewhere(sorgu);

    expect(sonuç).toEqual({
      status: 'ok',
      candidates: [
        {
          label: '192c Rue du Maréchal Foch 67380 Lingolsheim',
          postalCode: '67380',
          city: 'Strasbourg',
          precision: 'housenumber',
          score: 0.973,
        },
      ],
    });
  });

  it('FR DIŞINDA anahtar yokken ağa hiç çıkmaz — BAN yalnız Fransız adreslerini bilir, Google anahtarsız kapalı', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const sonuç = await geocoder().elsewhere({ ...sorgu, country: 'DE' });

    expect(sonuç).toEqual({ status: 'unsupported_country' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('servis düşerse FIRLATMAZ, adlı bir yokluk döner', async () => {
    // "Doğrulayamadım" ile "adres yanlış" ayrı şeyler: çağıran bu hâlde SUSAR, müşteriyi suçlamaz.
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ağ düştü');
    }) as unknown as typeof fetch;

    await expect(geocoder().elsewhere(sorgu)).resolves.toEqual({ status: 'unavailable' });
  });
});

/**
 * **Google adaptörünün SÖZLEŞMESİ** (13.09 — Almanya). Aynı iki soru, ama BAN'dan farklı cevaplanır:
 * ikisi de kodu ve şehri gönderir ve tek çağrıyla cevaplanır, çünkü Google yanlış kodu bağlamdan
 * kendisi düzeltir. Kod DEĞİŞTİRİLDİYSE kapı istenen kodda yoktur (`no_match`) ve doğrusu
 * `elsewhere`in adayında gelir — `addressVerdict` oradan "yanlış kod" teklifini kurar. Ağa
 * çıkılmaz; gövde ölçülür.
 */
const almanSorgu = { line1: 'Hauptstraße 12', postalCode: '02000', city: 'Kehl', country: 'DE' as const };
let sonGövde: Record<string, unknown> | null;

function googleCevabı(input: { granularity: string; replaced: boolean; postalCode: string; complete?: boolean; unconfirmed?: boolean }): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      result: {
        verdict: {
          validationGranularity: input.granularity,
          addressComplete: input.complete ?? true,
          hasReplacedComponents: input.replaced,
          hasUnconfirmedComponents: input.unconfirmed ?? false,
        },
        address: {
          formattedAddress: `Hauptstraße 12, ${input.postalCode} Kehl, Deutschland`,
          postalAddress: { regionCode: 'DE', postalCode: input.postalCode, locality: 'Kehl' },
          addressComponents: [{ componentName: { text: input.postalCode }, componentType: 'postal_code', replaced: input.replaced }],
        },
        geocode: { location: { latitude: 48.5727, longitude: 7.8156 }, placeId: 'p1' },
      },
    }),
  } as unknown as Response;
}

describe('Google adaptörü (DE) · Address Validation', () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-anahtar';
    sonGövde = null;
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      sonUrl = String(url);
      sonGövde = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return googleCevabı({ granularity: 'PREMISE', replaced: true, postalCode: '77694' });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('locate kodu ve şehri KISITLI gönderir; kod DEĞİŞTİRİLDİYSE kapı istenen kodda yoktur', async () => {
    const sonuç = await geocoder().locate(almanSorgu);

    expect(sonUrl).toBe('https://addressvalidation.googleapis.com/v1:validateAddress');
    expect(sonGövde?.address).toEqual({ regionCode: 'DE', addressLines: ['Hauptstraße 12'], postalCode: '02000', locality: 'Kehl' });
    expect(sonuç).toEqual({ status: 'no_match' });
  });

  it('kod doğrulanmışsa kapı kademesinde nokta ve `google` kaynağı döner', async () => {
    globalThis.fetch = vi.fn(async () => googleCevabı({ granularity: 'PREMISE', replaced: false, postalCode: '77694' })) as unknown as typeof fetch;

    const sonuç = await geocoder().locate({ ...almanSorgu, postalCode: '77694' });

    expect(sonuç).toEqual({ status: 'ok', point: { lat: 48.5727, lng: 7.8156 }, precision: 'housenumber', source: 'google', score: 0.95 });
  });

  it('elsewhere AYNI soruyu kod ve şehirle sorar, aynı sorgu için ağa İKİNCİ KEZ çıkmaz — düzeltilmiş adres tek aday', async () => {
    /* Bağlamsız soru canlıda başka şehri seçti (13.09: yalnız "Hauptstraße 1" → 84544 Aschau am Inn,
       müşteri 77694 Kehl'de). Google yanlış kodu sokak ve şehirden düzeltir; bağlamı atmak onu kör
       eder. İkinci soru ilkinin cevabında olduğu için ücretli uca bir kez gidilir. */
    const kodlayıcı = geocoder();
    await kodlayıcı.locate(almanSorgu);
    const sonuç = await kodlayıcı.elsewhere(almanSorgu);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(sonGövde?.address).toEqual({ regionCode: 'DE', addressLines: ['Hauptstraße 12'], postalCode: '02000', locality: 'Kehl' });
    expect(sonuç).toEqual({
      status: 'ok',
      candidates: [{ label: 'Hauptstraße 12, 77694 Kehl, Deutschland', postalCode: '77694', city: 'Kehl', precision: 'housenumber', score: 0.95 }],
    });
  });

  it('sokak düzeyi eşiğin ALTINDA kalır — teklif edilmez, yalnız kaba nokta yazılır', async () => {
    globalThis.fetch = vi.fn(async () => googleCevabı({ granularity: 'ROUTE', replaced: false, postalCode: '77694', complete: false })) as unknown as typeof fetch;

    const sonuç = await geocoder().locate({ ...almanSorgu, postalCode: '77694' });

    expect(sonuç).toMatchObject({ status: 'ok', precision: 'street', score: 0.6 });
  });

  it('403 (anahtar/fatura) çağırana geçici yokluk olarak döner — kapı susar, satış durmaz — ama ADIYLA iz bırakır', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;

    await expect(geocoder().locate(almanSorgu)).resolves.toEqual({ status: 'unavailable' });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: { flow: 'address_validation', status: 'denied' } }));
  });

  it('400 (isteğimiz sözleşmeye uymuyor) da susar ve `rejected` adıyla iz bırakır — `unavailable`a karışıp kaybolmaz', async () => {
    // Yaşandı 13.09: gövdedeki fazla alan 400 aldı ve hiçbir yere yazılmadı.
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400, headers: new Headers(), json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;

    await expect(geocoder().locate(almanSorgu)).resolves.toEqual({ status: 'unavailable' });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: { flow: 'address_validation', status: 'rejected' } }));
  });

  it('FR sorgusu Google\'a GİTMEZ — anahtar varken de BAN', async () => {
    await geocoder().locate(sorgu);

    expect(sonUrl).toContain('data.geopf.fr');
  });
});
