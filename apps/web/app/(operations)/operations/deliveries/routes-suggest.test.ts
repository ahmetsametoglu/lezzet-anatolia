import { describe, expect, it } from 'vitest';
import {
  SUGGESTION_LIMIT,
  buildSuggestions,
  type LocatedPlace,
  type SuggestionInputs,
} from './routes-suggest';

// Rota önerisi motorunun kuralları (19.20). Test DB'siz — bu dosya saf karar.
//
// Ölçülen kararlar: kimin önerileceği (sinyal şartı), kimin ELENECEĞİ (zaten rotada / uzak) ve
// hangi sırayla duracağı. Üçü de sessizce bozulabilir: bir eleme kalkarsa liste haritanın kopyasına
// döner, bir ağırlık kayarsa güçlü kanıt listenin dibine düşer — ikisi de kırmızı vermez.

const STRASBOURG = { lat: 48.583, lng: 7.75 };
const NOW = Date.parse('2026-08-07T12:00:00Z');

function place(postalCode: string, coords: { lat: number; lng: number }, name = 'Yer'): LocatedPlace {
  return { country: 'FR', postalCode, places: [name], lat: coords.lat, lng: coords.lng };
}

/** Strasbourg'dan kuzeye doğru kabaca `km` kadar uzaklaşmış bir nokta (1° enlem ≈ 111 km). */
function northOf(km: number): { lat: number; lng: number } {
  return { lat: STRASBOURG.lat + km / 111, lng: STRASBOURG.lng };
}

function inputs(over: Partial<SuggestionInputs> = {}): SuggestionInputs {
  return {
    definedKeys: new Set(['FR:67000']),
    stats: {},
    requestOf: new Map(),
    now: NOW,
    ...over,
  };
}

describe('buildSuggestions', () => {
  it('SİNYALİ OLMAYAN kod önerilmez — yakınlık tek başına sebep değil', () => {
    // Bölge havuzundaki yüzlerce kodun neredeyse hepsi "yakın"; yakınlık sebep sayılsaydı öneri
    // listesi haritanın kopyası olur ve hiçbir şey söylemezdi.
    const rows = buildSuggestions([place('67100', northOf(5))], inputs());
    expect(rows).toEqual([]);
  });

  it('zaten bir rotada olan kod önerilmez', () => {
    const rows = buildSuggestions([place('67000', northOf(2))], inputs({
      stats: { '67000': { orderCount: 9, revenueCents: 100_000, waitingCount: 4 } },
    }));
    expect(rows).toEqual([]);
  });

  it('üç sinyalin HER BİRİ tek başına öneri doğurur', () => {
    const only = (over: Partial<SuggestionInputs>) =>
      buildSuggestions([place('67100', northOf(5))], inputs(over)).map((row) => row.postalCode);

    expect(only({ stats: { '67100': { orderCount: 0, revenueCents: 0, waitingCount: 1 } } })).toEqual(['67100']);
    expect(only({ stats: { '67100': { orderCount: 2, revenueCents: 5_000, waitingCount: 0 } } })).toEqual(['67100']);
    expect(
      only({ requestOf: new Map([['67100', { requestCount: 3, lastSeenAt: '2026-08-01T00:00:00Z' }]]) }),
    ).toEqual(['67100']);
  });

  it('UZAKLIK ELEMEZ — kanıtı olan kod ne kadar uzak olursa olsun listeye girer', () => {
    // Kullanıcı kararı 07.08: bir zamanlar 80 km'lik tavan vardı ve onu ekran koymuştu. Kaldırıldı —
    // uzak bir kodu rotaya almak anlamsız olabilir ama bu operatörün kararıdır, ekranın değil.
    const rows = buildSuggestions([place('75011', northOf(400), 'Paris')], inputs({
      requestOf: new Map([['75011', { requestCount: 5, lastSeenAt: '2026-08-06T00:00:00Z' }]]),
    }));
    expect(rows.map((row) => row.postalCode)).toEqual(['75011']);
  });

  it('uzaklık SIRALAMAYA da girmez — sıralamanın tek ölçütü kanıt', () => {
    const far = place('75011', northOf(400), 'Paris');
    const near = place('67500', northOf(10));
    const rows = buildSuggestions([near, far], inputs({
      requestOf: new Map([
        ['75011', { requestCount: 90, lastSeenAt: '2026-08-06T00:00:00Z' }],
        ['67500', { requestCount: 2, lastSeenAt: '2026-08-06T00:00:00Z' }],
      ]),
    }));
    // Uzaktaki kanıtı güçlü olduğu için ÜSTTE; yakınlık onu aşağı itmiyor.
    expect(rows.map((row) => row.postalCode)).toEqual(['75011', '67500']);
  });

  it('sıra sinyalin AĞIRLIĞINA göre: bekleyen kişi > sipariş > soru', () => {
    const rows = buildSuggestions(
      [place('67100', northOf(5)), place('67200', northOf(6)), place('67300', northOf(7))],
      inputs({
        stats: {
          // 1 bekleyen = 10 puan
          '67100': { orderCount: 0, revenueCents: 0, waitingCount: 1 },
          // 1 sipariş = 6 puan
          '67200': { orderCount: 1, revenueCents: 4_000, waitingCount: 0 },
        },
        // 3 soru = 3 puan
        requestOf: new Map([['67300', { requestCount: 3, lastSeenAt: '2026-08-06T00:00:00Z' }]]),
      }),
    );
    expect(rows.map((row) => row.postalCode)).toEqual(['67100', '67200', '67300']);
  });

  it('eşit sinyalde sıra KODA göre — aynı ekranı iki kez açan aynı listeyi görmeli', () => {
    const rows = buildSuggestions(
      [place('67900', northOf(50)), place('67100', northOf(5))],
      inputs({
        stats: {
          '67900': { orderCount: 0, revenueCents: 0, waitingCount: 2 },
          '67100': { orderCount: 0, revenueCents: 0, waitingCount: 2 },
        },
      }),
    );
    expect(rows.map((row) => row.postalCode)).toEqual(['67100', '67900']);
  });

  it('tavanı aşan öneri kesilir — liste değil DAVET', () => {
    const many = Array.from({ length: SUGGESTION_LIMIT + 4 }, (_unused, i) => place(`679${i}0`, northOf(3 + i)));
    const stats = Object.fromEntries(
      many.map((row, i) => [row.postalCode, { orderCount: many.length - i, revenueCents: 0, waitingCount: 0 }]),
    );
    const rows = buildSuggestions(many, inputs({ stats }));
    expect(rows).toHaveLength(SUGGESTION_LIMIT);
    // Kesilen KUYRUKTUR, baş değil: en güçlü kanıt her hâlükârda listede kalmalı.
    expect(rows[0]!.postalCode).toBe(many[0]!.postalCode);
  });

  it('talep yaşı DAKİKA olarak, sunucunun "şimdi"sine göre hesaplanır', () => {
    const rows = buildSuggestions([place('67100', northOf(5))], inputs({
      requestOf: new Map([['67100', { requestCount: 1, lastSeenAt: '2026-08-07T09:00:00Z' }]]),
    }));
    expect(rows[0]!.lastAskedMinutes).toBe(180);
  });

  it('talep sayacında olmayan kodun yaşı NULL — sıfır değil (soru hiç sorulmadı)', () => {
    const rows = buildSuggestions([place('67100', northOf(5))], inputs({
      stats: { '67100': { orderCount: 2, revenueCents: 9_000, waitingCount: 0 } },
    }));
    expect(rows[0]!.lastAskedMinutes).toBeNull();
  });
});

/*
  `distanceKm` testleri BURADAN KALKTI (27.08): fonksiyon motorun kopyasıydı, söküldü.
  Kapsam kaybı yok — motorun kendi testi (`domain-core/delivery/distance.test.ts`) aynı iki iddiayı
  ve fazlasını taşıyor: aynı nokta sıfır, komşu şehir onlarca km, simetri, ve kopyada hiç
  olmayan "koordinat yoksa NULL" dalı.
*/
