import { describe, expect, it } from 'vitest';
import { routePattern } from './route-pattern';

/**
 * Rota kalıbı (13.1 · `ANALYTICS §2`) — **bu testin konusu gizlilik, biçim değil.**
 *
 * Ham yol deftere yazılsaydı iki gerçek rota kimlik sızdırırdı: `/feedback/<token>` oturum yerine
 * geçen bir SIR, `/orders/<reference>` doğrudan kimliklendirici. İkisi de burada çivileniyor.
 */
describe('bilinen dinamik rotalar kalıba iner', () => {
  it('geri bildirim JETONU deftere girmez — oturum yerine geçen bir sır', () => {
    expect(routePattern('/feedback/8f3c1a9b2d4e5f60718293a4b5c6d7e8')).toBe('/feedback/[token]');
  });

  it('SİPARİŞ NUMARASI deftere girmez — doğrudan kimliklendirici', () => {
    expect(routePattern('/orders/LZA-2451')).toBe('/orders/[reference]');
  });

  it('ürün ve paket slug\'ı kalıba iner', () => {
    expect(routePattern('/product/cold-baklava-with-walnut')).toBe('/product/[slug]');
    expect(routePattern('/package/bayram-sofrasi')).toBe('/package/[slug]');
  });

  it('DERİNLİK kesilir — `/product/x/reviews` aynı sayfanın parçasıdır', () => {
    expect(routePattern('/product/kunefe/reviews')).toBe('/product/[slug]');
  });
});

describe('dil öneki düşer — aynı sayfa üç kez sayılmasın', () => {
  it.each(['/fr/product/baklava', '/de/product/baklava', '/tr/product/baklava'])('%s', (yol) => {
    expect(routePattern(yol)).toBe('/product/[slug]');
  });

  it('kök yol dilsiz kalır', () => {
    expect(routePattern('/fr')).toBe('/');
    expect(routePattern('/')).toBe('/');
  });
});

describe('sorgu dizesi TÜMÜYLE düşer', () => {
  it('ölçülecek parametre `meta`ya adıyla girer, yola değil', () => {
    expect(routePattern('/catalog?q=baklava&cat=tatli')).toBe('/catalog');
  });

  it('`pushState` ile açılan panel SAHTE page_view üretmez — aynı kalıpta kalır', () => {
    expect(routePattern('/product/kunefe?reviews=1')).toBe('/product/[slug]');
  });

  it('çapa da düşer', () => {
    expect(routePattern('/legal/privacy#cerezler')).toBe('/legal/privacy');
  });
});

describe('emniyet ağı — beyaz listede OLMAYAN rotada da kimlik maskelenir', () => {
  /**
   * Bu blok, beyaz listenin bir gün eksik kalacağı varsayımıyla var: yarın eklenen bir dinamik rota
   * listeye yazılmayı unutulduğunda ham değer sızmasın. Unutulmuş bir liste hata vermez.
   */
  it('uuid maskelenir', () => {
    expect(routePattern('/yeni-sayfa/3f8a1c22-5b7d-4e90-a1b2-c3d4e5f60718')).toBe('/yeni-sayfa/[id]');
  });

  it('uzun jeton maskelenir', () => {
    expect(routePattern('/davet/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/davet/[id]');
  });

  it('sayı maskelenir', () => {
    expect(routePattern('/kampanya/12345')).toBe('/kampanya/[id]');
  });

  it('STATİK segment maskelenmez — aşırı maskeleme kalıbı anlamsız kılardı', () => {
    expect(routePattern('/legal/privacy')).toBe('/legal/privacy');
    expect(routePattern('/account/orders')).toBe('/account/orders');
  });
});
