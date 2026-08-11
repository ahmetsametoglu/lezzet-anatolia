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

  // Örnek yol bir zamanlar `/davet/…` idi ve 17.9'da GERÇEK bir rota oldu (davet karşılaması) —
  // test o gün "beyaz listede yok" varsayımını kaybedip beklenen kalıbı `/invite/[code]` okumaya
  // başladı. Uydurma yolun bir gün gerçekleşmesi bu bloğun doğasında var; örnek, hiçbir dile
  // karşılığı olmayan bir sözcükle değiştirildi.
  it('uzun jeton maskelenir', () => {
    expect(routePattern('/bilinmeyen/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/bilinmeyen/[id]');
  });

  it('sayı maskelenir', () => {
    expect(routePattern('/kampanya/12345')).toBe('/kampanya/[id]');
  });

  it('STATİK segment maskelenmez — aşırı maskeleme kalıbı anlamsız kılardı', () => {
    expect(routePattern('/legal/privacy')).toBe('/legal/privacy');
    expect(routePattern('/account/orders')).toBe('/account/orders');
  });
});

/**
 * **GERÇEK URL'LER — dış kelimeli** (denetim P2, 04.08).
 *
 * Önceki testler yalnız İÇ İngilizce yolla sınıyordu ve yeşildi; ama gerçek ziyaret
 * `/fr/produit/fistikli-baklava` diye geliyor. Yani testler geçerken üretim yanlış çalışıyordu —
 * girdinin gerçeği temsil etmediği bir test, olmayan bir güven üretir.
 */
describe('routePattern — gerçek dış URL', () => {
  it('üç dil AYNI kalıba çözülür — path boyutu üçe katlanmaz', () => {
    expect(routePattern('/fr/produit/fistikli-baklava')).toBe('/product/[slug]');
    expect(routePattern('/de/produkt/fistikli-baklava')).toBe('/product/[slug]');
    expect(routePattern('/tr/urun/fistikli-baklava')).toBe('/product/[slug]');
  });

  it('KISA slug da ham yazılmaz — kalıp tablosu onu değişken segment sayar', () => {
    // Emniyet ağı 20+ karakter arıyor; `fistikli-baklava` ondan kısa ve eskiden HAM yazılıyordu.
    // Sonucu: path boyutu katalog büyüklüğüyle çarpılıyordu.
    expect(routePattern('/fr/produit/kunefe')).not.toContain('kunefe');
  });

  it('dış kelimeli statik yollar da tanınır', () => {
    expect(routePattern('/fr/catalogue')).toBe('/catalog');
    expect(routePattern('/de/warenkorb')).toBe('/cart');
    expect(routePattern('/tr/odeme')).toBe('/checkout');
  });

  it('SIR taşıyan iki rota dış kelimeyle de maskelenir', () => {
    expect(routePattern('/fr/avis/AbCdEfGhIjKlMnOpQrStUvWx')).toBe('/feedback/[token]');
    expect(routePattern('/de/bestellungen/LZA-26-7K4M2P')).toBe('/orders/[reference]');
  });

  it('SABİT segment DEĞİŞKENİ yener — "yeni talep" bir talep kimliği değildir', () => {
    expect(routePattern('/fr/assistance/nouvelle')).toBe('/support/new');
    expect(routePattern('/fr/assistance/8f14e45f-ceea-467a-9f0a-1c2e3d4b5a67')).toBe('/support/[ticket]');
  });

  it('bilinen dinamik rotanın DERİN hâli aynı kalıba iner', () => {
    expect(routePattern('/fr/produit/baklava/avis')).toBe('/product/[slug]');
  });
});
