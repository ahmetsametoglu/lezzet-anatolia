import { describe, expect, it } from 'vitest';
import { normalizePlaceName } from './place-name';

/**
 * Beklentiler SQL'deki `place_search_text()`in ürettiği değerlerle aynı sabitlerdir, karşılaştırma değil: o taraf bu dosyadan
 * görünmez ve birbirine eşitlenen iki çağrı ikisi birden kaysa da yeşil kalırdı.
 */
describe('yazım farkı anlam farkı değildir', () => {
  it('ligatür açılır — müşteri "Hoenheim" yazar, veri "Hœnheim" tutar', () => {
    expect(normalizePlaceName('Hœnheim')).toBe('hoenheim');
    expect(normalizePlaceName('HOENHEIM')).toBe('hoenheim');
  });

  it('diyakritik ve tire silinir', () => {
    expect(normalizePlaceName('Vitry-le-François')).toBe('vitry le francois');
    expect(normalizePlaceName('Sélestat')).toBe('selestat');
  });

  it('Alman eszett açılır', () => {
    expect(normalizePlaceName('Weißenburg')).toBe('weissenburg');
    expect(normalizePlaceName('Straßburg')).toBe('strassburg');
  });
});
