import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocoder } from './geocode-provider';

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

  it('FR DIŞINDA ağa hiç çıkmaz — BAN yalnız Fransız adreslerini bilir', async () => {
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
