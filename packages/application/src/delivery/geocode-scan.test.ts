import { describe, expect, it } from 'vitest';

import { nextGeoState } from './geocode-scan';

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
