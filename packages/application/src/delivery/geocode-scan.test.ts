import { describe, expect, it } from 'vitest';

import type { Address } from '@lezzet/types';

import { geocodeAddressesScan, nextGeoState } from './geocode-scan';
import { fakeGeocoder } from './geocode.testkit';

const NOW = '2026-08-31T10:00:00.000Z';

describe('nextGeoState', () => {
  it('çözülen adresin noktası ve künyesi birlikte yazılır', () => {
    // Beş alan bölünemez: nokta olmadan kademe yazmak `address_geo_meta` kısıtını ihlal eder.
    const decision = nextGeoState(
      {
        status: 'ok',
        point: { lat: 48.5734, lng: 7.7521 },
        precision: 'housenumber',
        source: 'ban',
        score: 0.96,
      },
      { geoAttempts: 2 },
      NOW,
    );

    expect(decision.bucket).toBe('located');
    expect(decision.patch).toEqual({
      lat: 48.5734,
      lng: 7.7521,
      geoPrecision: 'housenumber',
      geoSource: 'ban',
      geoAt: NOW,
      geoCheckedAt: NOW,
      // Çözülen satırın sayacı SIFIRLANIR: adres bir gün değişip yeniden kuyruğa düşerse eski
      // başarısızlıklar onu baştan tüketilmiş saymamalı.
      geoAttempts: 0,
    });
  });

  it('kaba eşleşme ATILMAZ, kaba olduğu söylenir', () => {
    // `municipality` bir kapıyı değil belediye merkezini gösterir — nokta yazılır ama kademesiyle,
    // çünkü sıralama motoru onu "yaklaşık" diye okuyabilmeli.
    const decision = nextGeoState(
      { status: 'ok', point: { lat: 48.58, lng: 7.75 }, precision: 'municipality', source: 'ban', score: 0.5 },
      { geoAttempts: 0 },
      NOW,
    );

    expect(decision.bucket).toBe('located');
    expect(decision.patch.geoPrecision).toBe('municipality');
  });

  it('CEVAPLI ret sayacı artırır', () => {
    const decision = nextGeoState({ status: 'no_match' }, { geoAttempts: 1 }, NOW);

    expect(decision.bucket).toBe('noMatch');
    expect(decision.patch).toEqual({ geoCheckedAt: NOW, geoAttempts: 2 });
  });

  it('GEÇİCİ arıza sayacı TÜKETMEZ — yalnız damga ilerler', () => {
    // Ayrımın sebebi: servisin düştüğü bir öğleden sonra sayaç tüketilseydi yüzlerce adres kalıcı
    // "çözülemez" damgası yerdi ve kimse bir daha denemezdi.
    for (const outcome of [
      { status: 'unavailable' } as const,
      { status: 'rate_limited', retryAfterMs: 1000 } as const,
      { status: 'invalid_response' } as const,
    ]) {
      const decision = nextGeoState(outcome, { geoAttempts: 1 }, NOW);

      expect(decision.bucket).toBe('deferred');
      expect(decision.patch).toEqual({ geoCheckedAt: NOW });
      expect(decision.patch.geoAttempts).toBeUndefined();
    }
  });

  it('desteklenmeyen ülke de sayacı tüketmez — ikinci kaynak gelince çözülsün', () => {
    // Bugün Almanya bu dalda: BAN yalnız Fransa. Sayaç tüketilseydi o satırlar üç turda kuyruktan
    // düşer ve ikinci sağlayıcı takıldığında bir daha hiç denenmezdi.
    const decision = nextGeoState({ status: 'unsupported_country' }, { geoAttempts: 2 }, NOW);

    expect(decision.bucket).toBe('deferred');
    expect(decision.patch).toEqual({ geoCheckedAt: NOW });
  });

  it('hiçbir dalda nokta YARIM yazılmaz', () => {
    // `address_geo_point` kısıtı yarım noktayı reddeder; kararın hiçbir dalı onu üretmemeli.
    const outcomes = [
      { status: 'no_match' } as const,
      { status: 'unavailable' } as const,
      { status: 'unsupported_country' } as const,
    ];

    for (const outcome of outcomes) {
      const { patch } = nextGeoState(outcome, { geoAttempts: 0 }, NOW);

      expect(patch.lat).toBeUndefined();
      expect(patch.lng).toBeUndefined();
      expect(patch.geoPrecision).toBeUndefined();
    }
  });
});

/*
  TARAMANIN KENDİSİ — `rows` ENJEKSİYONUYLA, DB'SİZ.

  `geocodeAddressesScan` normalde iki şey yapar: kuyruğu okur ve satırları günceller. Burada birinci
  yarısı `rows` ile atlanıyor, ikinci yarısı sahte bir servisle sınanıyor — asıl ölçülen şey
  **hangi adresin sorulduğu** — yani gizlilik kısıtının çalışma anında da tutması.

  Kova sayımı burada ÖLÇÜLMÜYOR ve bilerek: sayaç yazmanın başarısına bağlı ve sahte bir istemci
  gerçek yazmayı taklit edemez (şema doğrulaması, hata dönüşü). O yarı entegrasyonun işi; karar
  yarısı zaten `nextGeoState` testleriyle kapsanıyor.

  `rows` bir kolaylık değil, yaşanmış bir arızanın çaresi (03.08 `translate-user-text`): küresel
  tarayan bir işin testi sahte cevabı 29 GERÇEK satıra yazdı. Burada aynı hata 29 adrese yanlış
  koordinat yazmak olurdu — üstelik paylaşılan veritabanında başka şeridin verisine.
*/
describe('geocodeAddressesScan — sorulan adres', () => {
  const adres = (over: Partial<Address> = {}): Address =>
    ({
      id: '00000000-0000-4000-8000-000000000001',
      customerId: '00000000-0000-4000-8000-000000000002',
      label: null,
      recipient: 'Ayşe Yılmaz',
      line1: '8 rue de Bischwiller',
      line2: null,
      postalCode: '67100',
      city: 'Strasbourg',
      phone: '+33612345678',
      country: 'FR',
      isDefault: true,
      createdAt: NOW,
      lat: null,
      lng: null,
      geoPrecision: null,
      geoSource: null,
      geoAt: null,
      geoCheckedAt: null,
      geoAttempts: 0,
      ...over,
    }) as Address;

  it('servise DÖRT alan gider — müşteri adı ve telefonu GİTMEZ', async () => {
    // Gizlilik kısıtı sözleşmede duruyor (`GeocodeQuery`), ama bir tip kaza eseri genişleyebilir;
    // bu test onu çalışma anında da çiviliyor.
    const fake = fakeGeocoder({ status: 'unavailable' });
    await geocodeAddressesScan(fakeDb(), { geocoder: fake, rows: [adres()] });

    expect(fake.calls).toHaveLength(1);
    expect(Object.keys(fake.calls[0] ?? {}).sort()).toEqual(['city', 'country', 'line1', 'postalCode']);
    expect(JSON.stringify(fake.calls[0])).not.toContain('Ayşe');
    expect(JSON.stringify(fake.calls[0])).not.toContain('+33612345678');
  });

});

/** Yazma tarafını yutan en küçük sahte istemci — testin ölçtüğü şey yazma DEĞİL, karar ve sorgu. */
function fakeDb() {
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
  };
  return { from: () => chain } as never;
}
