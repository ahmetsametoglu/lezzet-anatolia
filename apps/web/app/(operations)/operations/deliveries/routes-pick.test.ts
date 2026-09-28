import { describe, expect, it } from 'vitest';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import { boxPick } from './routes-pick';

// Kutu seçiminin süzgeci: taslaktaki ya da başka rotadaki kod eklenecekler listesine girerse bir kod iki rotaya düşer.
const nokta = (postalCode: string, country: 'FR' | 'DE' = 'FR'): ZoneMapPoint => ({ country, postalCode, lat: 48.5, lng: 7.7 });

const routes = [
  { id: 'secili', postalCodes: [{ country: 'FR', postalCode: '67000' }] },
  { id: 'komsu', postalCodes: [{ country: 'FR', postalCode: '67100' }] },
];

describe('boxPick', () => {
  it('boştaki kodlar eklenir, taslaktaki ve başka rotadaki dışarıda kalır', () => {
    const sonuc = boxPick([nokta('67200'), nokta('67000'), nokta('67100')], [{ country: 'FR', postalCode: '67000' }], routes, 'secili');
    expect(sonuc.add.map((p) => p.postalCode)).toEqual(['67200']);
    expect(sonuc.held).toBe(1);
  });

  it('seçili rotanın kendi kodu "başka rotada" sayılmaz', () => {
    const sonuc = boxPick([nokta('67000')], [], routes, 'secili');
    expect(sonuc.add.map((p) => p.postalCode)).toEqual(['67000']);
    expect(sonuc.held).toBe(0);
  });

  it('aynı kod iki kez gelse de bir kez eklenir; iki ülkenin aynı kodu ayrı kalır', () => {
    const sonuc = boxPick([nokta('67240'), nokta('67240'), nokta('67240', 'DE')], [], routes, 'secili');
    expect(sonuc.add.map((p) => `${p.country}:${p.postalCode}`)).toEqual(['DE:67240', 'FR:67240']);
  });
});
