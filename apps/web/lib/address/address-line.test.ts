import { describe, expect, it } from 'vitest';
import { addressLine } from './address-line';

/*
  ADRESİN TEK SATIRI — telefon görünümünde sepetin adres künyesi, ödeme ekranının adres kartı ve sipariş detayının özeti
  aynı satırı okur (14.09). Kural: kat/daire (`line2`) boş değilse sokağın peşine girer; yutulursa teslimat adresi eksik
  görünür, boşken arkasında virgül bırakmaz. Sipariş adresi anlık görüntüdür ve eksik parça taşıyabilir — atlanır.
*/
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
