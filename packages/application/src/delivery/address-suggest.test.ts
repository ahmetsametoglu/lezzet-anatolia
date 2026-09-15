import { addressLineOf, type AddressSuggestion } from '@lezzet/address';
import type * as AddressModule from '@lezzet/address';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
  Ağsız: BAN istemcisi taklit, Google anahtarı yok sayılıyor. Sınanan şey ülkeye göre dağıtım ve cevabın çekmece satırına
  çevrilmesi.
*/

const ban = vi.hoisted(() => ({ reply: { status: 'unavailable' } as unknown }));

vi.mock('@lezzet/address', async (importOriginal) => {
  const actual = await importOriginal<typeof AddressModule>();
  return { ...actual, searchAddresses: vi.fn(async () => ban.reply) };
});
vi.mock('./google-maps', () => ({
  googleMapsApiKey: () => null,
  traceGoogleFailure: (_kind: string, result: unknown) => result,
}));

const { searchAddresses } = await import('@lezzet/address');
const { lookupAddressOptions, resolveAddressOption } = await import('./address-suggest');

const ROW: AddressSuggestion = {
  id: '67482_1234_00012',
  label: '12 Rue des Orfèvres 67000 Strasbourg',
  kind: 'housenumber',
  houseNumber: '12',
  street: 'Rue des Orfèvres',
  postalCode: '67000',
  city: 'Strasbourg',
  cityCode: '67482',
  score: 0.97,
  latitude: 48.5818,
  longitude: 7.7501,
};

const INPUT = { query: '12 rue des orf', sessionToken: 's-1', locale: 'fr' };

beforeEach(() => {
  vi.mocked(searchAddresses).mockClear();
  ban.reply = { status: 'unavailable' };
});

describe('lookupAddressOptions — Fransa (BAN)', () => {
  it('BAN\'a KAPI DÜZEYİNDE sorar ve öneriyi tam adresiyle, kaynağı `ban` noktasıyla döner', async () => {
    ban.reply = { status: 'ok', suggestions: [ROW] };
    const outcome = await lookupAddressOptions({ ...INPUT, country: 'FR' });

    expect(vi.mocked(searchAddresses)).toHaveBeenCalledWith({ query: INPUT.query, kind: 'housenumber' });
    expect(outcome).toEqual({
      status: 'ok',
      options: [
        {
          id: ROW.id,
          title: addressLineOf(ROW),
          subtitle: '67000 Strasbourg',
          address: {
            line1: addressLineOf(ROW),
            postalCode: '67000',
            city: 'Strasbourg',
            point: { lat: 48.5818, lng: 7.7501, precision: 'housenumber', source: 'ban' },
          },
        },
      ],
    });
  });

  it('kota dolunca `busy` — hata değil, "biraz sonra"', async () => {
    ban.reply = { status: 'rate_limited' };
    expect(await lookupAddressOptions({ ...INPUT, country: 'FR' })).toEqual({ status: 'busy' });
  });

  it('servis düşünce boş liste — müşteri elle yazar, kapı fırlatmaz', async () => {
    ban.reply = { status: 'unavailable' };
    expect(await lookupAddressOptions({ ...INPUT, country: 'FR' })).toEqual({ status: 'ok', options: [] });
  });

  it('BAN önerisi tam adresle geldiği için ikinci adım yok — açılış `null`', async () => {
    expect(await resolveAddressOption({ country: 'FR', id: ROW.id, sessionToken: 's-1', locale: 'fr' })).toBeNull();
  });
});

describe('lookupAddressOptions — Almanya (Google)', () => {
  it('BAN\'a hiç gitmez; anahtar yokken boş liste döner', async () => {
    expect(await lookupAddressOptions({ ...INPUT, country: 'DE' })).toEqual({ status: 'ok', options: [] });
    expect(vi.mocked(searchAddresses)).not.toHaveBeenCalled();
  });

  it('anahtar yokken seçimin açılışı da `null` — çekmece elle giriş kartına düşer', async () => {
    expect(await resolveAddressOption({ country: 'DE', id: 'place-1', sessionToken: 's-1', locale: 'de' })).toBeNull();
  });
});
