import { describe, expect, it } from 'vitest';
import { matchesCatalogFilter } from './products-types';

/**
 * Katalog araması (kategori/koleksiyon) CLIENT'ta süzülür — bu listeler sayfalı değil, bütün geliyor.
 * Saf fonksiyon olduğu için birim test: eşleşme yanlışsa ekran sessizce "kayıt yok" der ve operatör
 * var olan kaydı bulamaz. Ürün araması buraya girmez, o sunucuda (keyset paginasyon).
 */
const row = (tr: string, slug: string, fr = '', de = '') => ({ name: { tr, fr, de }, slug });

describe('matchesCatalogFilter', () => {
  it('boş terim her satırı geçirir (süzgeç yok)', () => {
    expect(matchesCatalogFilter(row('Baklava', 'baklava'), '')).toBe(true);
    expect(matchesCatalogFilter(row('Baklava', 'baklava'), '   ')).toBe(true);
  });

  it('Türkçe harf ve aksan farkını yutar', () => {
    const r = row('Su Böreği', 'su-boregi');
    expect(matchesCatalogFilter(r, 'böreği')).toBe(true);
    expect(matchesCatalogFilter(r, 'boregi')).toBe(true);
    expect(matchesCatalogFilter(r, 'BÖREK')).toBe(false); // "börek" ≠ "böreği" gövdesi
    expect(matchesCatalogFilter(r, 'bore')).toBe(true);
  });

  it('parçalı yazımı bulur (kelime başı şart değil)', () => {
    expect(matchesCatalogFilter(row('Şerbetli Tatlılar', 'serbetli-tatlilar'), 'tatli')).toBe(true);
    expect(matchesCatalogFilter(row('Şerbetli Tatlılar', 'serbetli-tatlilar'), 'serbetli tat')).toBe(true);
  });

  it('ÜÇ dilin adını birden tarar — FR adı yazılınca da bulur', () => {
    const r = row('Bayram Sofrası', 'bayram-sofrasi', 'Table de fête', 'Festtafel');
    expect(matchesCatalogFilter(r, 'fete')).toBe(true);
    expect(matchesCatalogFilter(r, 'fête')).toBe(true);
    expect(matchesCatalogFilter(r, 'festtafel')).toBe(true);
  });

  it('slug üzerinden de bulur (operatör linkten kopyalayıp arar)', () => {
    expect(matchesCatalogFilter(row('Kuru Baklava', 'kuru-baklava'), 'kuru-baklava')).toBe(true);
  });

  it('eşleşmeyeni geçirmez', () => {
    expect(matchesCatalogFilter(row('Baklava', 'baklava'), 'börek')).toBe(false);
  });

  it('boş dilli satırda patlamaz', () => {
    expect(matchesCatalogFilter({ name: {}, slug: 'x' }, 'baklava')).toBe(false);
    expect(matchesCatalogFilter({ name: {}, slug: 'x' }, '')).toBe(true);
  });
});
