import { describe, expect, it } from 'vitest';
import { shipConflicts, shipCountryEntries, shipCountryLines } from './ship-countries';
import type { ShipCountryField } from './warehouses-types';

const blank = { line1: '', postalCode: '', city: '' };
const kehl = { line1: 'Rheinstraße 10', postalCode: '77694', city: 'Kehl' };
const field = (country: 'FR' | 'DE', enabled: boolean, handover = blank): ShipCountryField => ({ country, enabled, handover });

// Kapı bu satırları olduğu gibi yazar: yarım adres taşıyıcıyı eksik adrese gönderir, boş adres de "depo adresi" anlamına gelmeli.
describe('shipCountryEntries', () => {
  it('boş teslim noktası paketin depodan verildiği demektir, işaretsiz ülke yazılmaz', () => {
    expect(shipCountryEntries([field('FR', true), field('DE', true)], 'FR')).toEqual({
      entries: [
        { country: 'FR', handover: null },
        { country: 'DE', handover: null },
      ],
      error: null,
    });
    expect(shipCountryEntries([field('FR', true), field('DE', false, kehl)], 'FR').entries).toEqual([{ country: 'FR', handover: null }]);
  });

  it('yarım teslim noktası reddedilir', () => {
    const result = shipCountryEntries([field('DE', true, { ...blank, city: 'Kehl' })], 'FR');
    expect(result.entries).toBeNull();
    expect(result.error).toContain('Almanya');
  });

  it('deponun kendi ülkesinde teslim noktası yazılmaz', () => {
    expect(shipCountryEntries([field('FR', true, kehl), field('DE', true, kehl)], 'FR').entries).toEqual([
      { country: 'FR', handover: null },
      { country: 'DE', handover: kehl },
    ]);
  });
});

describe('shipConflicts', () => {
  const bordeaux = { id: 'bdx', code: 'BDX', name: 'Bordeaux', shipsTo: ['DE' as const] };

  it('işaretli ülkeye başka aktif depo kargo yapıyorsa o depo döner; deponun kendisi çakışma sayılmaz', () => {
    const fields = [field('FR', true), field('DE', true)];
    expect(shipConflicts(fields, [bordeaux], 'str').get('DE')?.code).toBe('BDX');
    expect(shipConflicts(fields, [bordeaux], 'bdx').size).toBe(0);
    expect(shipConflicts([field('DE', false)], [bordeaux], 'str').size).toBe(0);
  });
});

describe('shipCountryLines', () => {
  it('deponun ülkesi önce gelir; teslim noktalı ülke paketin nerede hazırlanıp nerede verildiğini yazar', () => {
    const lines = shipCountryLines({
      countryCode: 'FR',
      address: { line1: '12 rue du Marché', postalCode: '67000', city: 'Strasbourg' },
      shipCountries: [
        { country: 'DE', handover: kehl },
        { country: 'FR', handover: null },
      ],
    });
    expect(lines.map((line) => line.sentence)).toEqual([
      'Paket depodan taşıyıcıya verilir. Tarife yurt içi Fransa.',
      "Paket Strasbourg'da hazırlanır, Kehl'deki teslim noktasında taşıyıcıya verilir. Tarife yurt içi Almanya.",
    ]);
    expect(lines[1]?.place).toBe('Teslim noktası: Rheinstraße 10 · 77694 Kehl');
  });
});
