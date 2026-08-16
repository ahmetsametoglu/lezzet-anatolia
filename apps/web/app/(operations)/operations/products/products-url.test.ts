import { describe, expect, it } from 'vitest';
import { parseProductsUrl, productsUrl, toProductFilters } from './products-url';

/**
 * URL sözleşmesi saf mantıktır (DB yok) → birim test. Önemi: süzgeçler artık SUNUCUDA uygulanıyor,
 * yani bu ayrıştırma yanlışsa ekran sessizce yanlış listeyi gösterir. Ayrıca gidiş-dönüş
 * (durum → URL → durum) bozulursa paylaşılan link farklı bir görünüm açar.
 */
const CAT = '11111111-1111-4111-8111-111111111111';

describe('parseProductsUrl', () => {
  it('boş parametrelerde varsayılana düşer', () => {
    expect(parseProductsUrl({})).toEqual({ tab: 'products', q: '', cat: 'all', status: 'all', incomplete: false, creating: false, productId: '', selected: '' });
  });

  it('tanınmayan değerleri sessizce varsayılana çevirir (bozuk link ekranı kırmaz)', () => {
    const s = parseProductsUrl({ tab: 'hacked', status: 'silinmis', cat: '', incomplete: 'evet' });
    expect(s.tab).toBe('products');
    expect(s.status).toBe('all');
    expect(s.cat).toBe('all');
    expect(s.incomplete).toBe(false); // yalnız '1' true sayılır
  });

  it('geçerli değerleri okur ve aramayı kırpar', () => {
    const s = parseProductsUrl({ tab: 'collections', q: '  baklava ', cat: CAT, status: 'candidate', incomplete: '1' });
    expect(s).toEqual({ tab: 'collections', q: 'baklava', cat: CAT, status: 'candidate', incomplete: true, creating: false, productId: '', selected: '' });
  });

  it('dizi gelen parametrede ilk değeri alır (?tab=a&tab=b)', () => {
    expect(parseProductsUrl({ tab: ['categories', 'products'] }).tab).toBe('categories');
  });
});

describe('productsUrl', () => {
  it('varsayılan durumda parametre YAZMAZ (temiz adres)', () => {
    expect(productsUrl(parseProductsUrl({}))).toBe('/operations/products');
  });

  it('yalnız varsayılandan sapan alanları yazar', () => {
    const url = productsUrl({ tab: 'products', q: 'börek', cat: 'all', status: 'passive', incomplete: false, creating: false, productId: '', selected: '' });
    expect(url).toBe('/operations/products?q=b%C3%B6rek&status=passive');
  });

  it('gidiş-dönüş korunur: durum → URL → durum', () => {
    const state = { tab: 'categories' as const, q: 'su böreği', cat: CAT, status: 'active' as const, incomplete: true, creating: false, productId: '', selected: '' };
    const parsed = parseProductsUrl(Object.fromEntries(new URLSearchParams(productsUrl(state).split('?')[1] ?? '')));
    expect(parsed).toEqual(state);
  });

  // Oluşturma niyeti adreste: paylaşılan link doğrudan forma düşer, yenileme formu kapatmaz.
  it('oluşturma niyeti `new=1` olarak yazılır ve sekmeyle birlikte okunur', () => {
    const url = productsUrl({ tab: 'categories', q: '', cat: 'all', status: 'all', incomplete: false, creating: true, productId: '', selected: '' });
    expect(url).toBe('/operations/products?tab=categories&new=1');
    const parsed = parseProductsUrl({ tab: 'categories', new: '1' });
    expect(parsed.creating).toBe(true);
    expect(parsed.tab).toBe('categories');
  });

  it('niyet varsayılanda YAZILMAZ ve tanınmayan değer kapalı sayılır', () => {
    expect(productsUrl(parseProductsUrl({ new: 'evet' }))).toBe('/operations/products');
    expect(parseProductsUrl({ new: 'evet' }).creating).toBe(false);
  });
});

describe('toProductFilters', () => {
  it("'all' ve boş değerler süzgeç olarak HİÇ geçilmez (undefined)", () => {
    expect(toProductFilters(parseProductsUrl({}))).toEqual({
      query: undefined,
      categoryId: undefined,
      status: undefined,
      onlyIncomplete: undefined,
    });
  });

  it('dolu süzgeçleri servis şekline çevirir', () => {
    const f = toProductFilters(parseProductsUrl({ q: 'baklava', cat: CAT, status: 'passive', incomplete: '1' }));
    expect(f).toEqual({ query: 'baklava', categoryId: CAT, status: 'passive', onlyIncomplete: true });
  });
});
