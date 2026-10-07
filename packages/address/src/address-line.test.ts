import { describe, expect, it } from 'vitest';
import { addressLine, placeLineOf } from './address-line';

/* Sepet, ödeme ve sipariş detayı aynı satırı okur; yutulan kat/daire teslimat adresini eksik gösterir, sipariş kopyasının eksik parçası atlanır. */
describe('addressLine', () => {
  const base = { line1: '8 rue de Bischwiller', postalCode: '67100', city: 'Strasbourg' };

  it('kat/daire yoksa sokak, posta kodu ve şehir', () => {
    expect(addressLine({ ...base, line2: null })).toBe('8 rue de Bischwiller, 67100 Strasbourg');
  });

  it('kat/daire sokağın peşine girer', () => {
    expect(addressLine({ ...base, line2: '3. kat, zil: Yılmaz' })).toBe('8 rue de Bischwiller, 3. kat, zil: Yılmaz, 67100 Strasbourg');
  });

  it('boş kat/daire satırı arkasında virgül bırakmaz', () => {
    expect(addressLine({ ...base, line2: '' })).toBe('8 rue de Bischwiller, 67100 Strasbourg');
  });

  it('eksik parça atlanır, "undefined" basılmaz', () => {
    expect(addressLine({ line1: '8 rue de Bischwiller', city: 'Strasbourg' })).toBe('8 rue de Bischwiller, Strasbourg');
  });
});

describe('placeLineOf', () => {
  it('adres adı yoksa kod ve yer adı', () => {
    expect(placeLineOf({ postalCode: '67100', placeName: 'Strasbourg' })).toBe('67100 Strasbourg');
  });

  it('seçili adresin adı başa yazılır', () => {
    expect(placeLineOf({ label: 'Ev', postalCode: '67100', placeName: 'Strasbourg' })).toBe('Ev · 67100 Strasbourg');
  });

  it('boş ad satırı ayraçla başlatmaz', () => {
    expect(placeLineOf({ label: '  ', postalCode: '67100', placeName: 'Strasbourg' })).toBe('67100 Strasbourg');
  });

  it('yer adı bilinmiyorsa yalnız kod', () => {
    expect(placeLineOf({ label: 'Ev', postalCode: '67100', placeName: null })).toBe('Ev · 67100');
  });
});
