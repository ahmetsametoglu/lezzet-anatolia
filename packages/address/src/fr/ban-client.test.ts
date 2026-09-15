import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAddresses } from './ban-client';

/** BAN'ın kapı sonucu — yalnız şemanın istediği alanlar. */
const door = (label: string, houseNumber: string) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [7.71, 48.56] },
  properties: {
    label,
    score: 0.97,
    id: '67267_0530_00192_c',
    type: 'housenumber',
    postcode: '67380',
    citycode: '67267',
    city: 'Lingolsheim',
    housenumber: houseNumber,
    street: 'Rue du Maréchal Foch',
  },
});

/** Her çağrıda YENİ cevap — gövde bir kez okunur. */
const answer = (features: unknown[]) => async () => new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200 });

const queryOf = (call: unknown[] | undefined) => new URL(String(call?.[0])).searchParams;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchAddresses — sonda yazılan kapı numarası (14.09)', () => {
  it('boş cevapta numarayı başa alıp aynı süzgeçle bir kez daha sorar', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(answer([]))
      .mockImplementationOnce(answer([door('192c Rue du Maréchal Foch 67380 Lingolsheim', '192c')]));
    vi.stubGlobal('fetch', fetchMock);

    const found = await searchAddresses({ query: 'rue du Maréchal Foch 192c', kind: 'housenumber' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryOf(fetchMock.mock.calls[1]).get('q')).toBe('192c rue du Maréchal Foch');
    expect(queryOf(fetchMock.mock.calls[1]).get('type')).toBe('housenumber');
    expect(found).toMatchObject({ status: 'ok', suggestions: [{ houseNumber: '192c', postalCode: '67380' }] });
  });

  it('sonda numara yoksa ya da ilk soru bir şey bulduysa ikinci soru yok', async () => {
    const fetchMock = vi.fn().mockImplementation(answer([]));
    vi.stubGlobal('fetch', fetchMock);
    await searchAddresses({ query: 'rue du Maréchal Foch', kind: 'housenumber' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockImplementation(answer([door('12 Rue des Orfèvres 67000 Strasbourg', '12')]));
    await searchAddresses({ query: 'Rue des Orfèvres 12', kind: 'housenumber' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
