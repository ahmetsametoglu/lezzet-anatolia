import { emToDp, mapTokens, parseToken } from './parse';

describe('token çevirisi', () => {
  it('px kademesini dp sayısına, birimsiz sayıyı sayıya çevirir', () => {
    expect(parseToken('52px')).toBe(52);
    expect(parseToken('14.5px')).toBe(14.5);
    expect(parseToken('1.15')).toBe(1.15);
    expect(parseToken('700')).toBe(700);
  });

  it('birim taşıyan öteki değerleri OLDUĞU GİBİ bırakır', () => {
    expect(parseToken('0.18em')).toBe('0.18em');
    expect(parseToken('#343b41')).toBe('#343b41');
    expect(parseToken('rgba(21, 23, 15, 0.45)')).toBe('rgba(21, 23, 15, 0.45)');
  });

  it('anahtar kümesini koruyarak haritalar', () => {
    expect(mapTokens({ a: '20px', b: '0.1em' })).toEqual({ a: 20, b: '0.1em' });
  });

  it('em harf aralığını yazı boyuna göre dp’ye çevirir', () => {
    expect(emToDp('0.18em', 10)).toBeCloseTo(1.8);
    expect(emToDp('0.12em', 14)).toBeCloseTo(1.68);
  });

  it('tanınmayan harf aralığında SESSİZ 0 dönmez, fırlatır', () => {
    // Sıfır "aralık yok" demektir; bozuk token'ı sağlıklı gibi okutmak yasak (CLAUDE §1).
    expect(() => emToDp('2px', 10)).toThrow(/em/);
  });
});
