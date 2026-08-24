import { describe, expect, it } from 'vitest';
import { campaignsByProduct, EMPTY_SCOPE_CAMPAIGNS, type ScopeCampaign, type ScopeCampaigns } from './campaign';

/**
 * KARIŞIK LİSTEDE HANGİ KAMPANYA ROZET OLUR (21.100 · MB-22b).
 *
 * **Neden testi olan bir kural:** fonksiyon iki ayrı üstünlük kararı veriyor ve ikisi de sessizce
 * bozulabilir — yanlış kampanya seçildiğinde ekran yine bir rozet çizer, yalnız YANLIŞ olanı. Hata
 * vermez, boş kalmaz, gözle de anlaşılmaz; müşteriye söylenen indirim ile operatörün açtığı
 * kampanya ayrışır.
 *
 * İki karar birbirinden farklı ve karıştırılmaları çok kolay:
 *   1. **Kesitler arası:** koleksiyon kategoriyi yener — KOŞULSUZ olarak, eşiğine bakılmadan.
 *      Ölçüt `getCatalogData`'nın etkin kesit sırasıdır, kampanyanın cazipliği değil.
 *   2. **Kesit içinde:** iki koleksiyon birden kampanyalıysa KOŞULSUZ olan kazanır — müşteriye
 *      şartsız söylenebilen tek şey odur.
 *
 * Biri ötekinin yerine uygulanırsa (ör. "koşulsuz kategori, eşikli koleksiyonu yensin") kod daha
 * "mantıklı" görünür ama listenin sırası ile kartın rozeti ayrışır. Test o ayrımı çiviliyor.
 */
function campaign(over: Partial<ScopeCampaign> = {}): ScopeCampaign {
  return {
    id: 'c1',
    label: null,
    type: 'percent',
    percent: 15,
    amountCents: null,
    minBasketCents: null,
    ...over,
  };
}

function scopes(over: Partial<ScopeCampaigns> = {}): ScopeCampaigns {
  return { byCategory: new Map(), byCollection: new Map(), ...over };
}

describe('campaignsByProduct', () => {
  it('ürünün KATEGORİSİNDE kampanya varsa ona düşer', () => {
    const kampanyalar = scopes({ byCategory: new Map([['kat-1', campaign({ id: 'kategori' })]]) });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: 'kat-1' }], new Map());
    expect(sonuc.get('u1')?.id).toBe('kategori');
  });

  it('ürünün KOLEKSİYONUNDA kampanya varsa ona düşer', () => {
    const kampanyalar = scopes({ byCollection: new Map([['kol-1', campaign({ id: 'koleksiyon' })]]) });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: 'kat-1' }], new Map([['u1', ['kol-1']]]));
    expect(sonuc.get('u1')?.id).toBe('koleksiyon');
  });

  it('KOLEKSİYON KATEGORİYİ YENER — eşikli olsa bile', () => {
    // Kritik dal: koleksiyonunki 60 € eşik istiyor, kategorininki koşulsuz. "Daha cazip olan
    // kazansın" diye düzeltmek kolay ve YANLIŞ olurdu — ölçüt kesit sırası, cazibe değil.
    const kampanyalar = scopes({
      byCategory: new Map([['kat-1', campaign({ id: 'kategori', minBasketCents: null })]]),
      byCollection: new Map([['kol-1', campaign({ id: 'koleksiyon', minBasketCents: 6000 })]]),
    });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: 'kat-1' }], new Map([['u1', ['kol-1']]]));
    expect(sonuc.get('u1')?.id).toBe('koleksiyon');
  });

  it('İKİ KOLEKSİYON birden kampanyalıysa KOŞULSUZ olan kazanır', () => {
    const kampanyalar = scopes({
      byCollection: new Map([
        ['kol-esikli', campaign({ id: 'esikli', minBasketCents: 6000 })],
        ['kol-kosulsuz', campaign({ id: 'kosulsuz', minBasketCents: null })],
      ]),
    });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: null }], new Map([['u1', ['kol-esikli', 'kol-kosulsuz']]]));
    expect(sonuc.get('u1')?.id).toBe('kosulsuz');
  });

  it('koşulsuz olan ÖNCE gelse de kazanır — sıra değil KOŞUL belirler', () => {
    // Aynı kural, liste ters sırada. Döngü "ilk bulduğunu al" diye yazılsaydı bu geçer, öteki
    // düşerdi; ikisi birlikte kuralın sıradan bağımsız olduğunu söylüyor.
    const kampanyalar = scopes({
      byCollection: new Map([
        ['kol-kosulsuz', campaign({ id: 'kosulsuz', minBasketCents: null })],
        ['kol-esikli', campaign({ id: 'esikli', minBasketCents: 6000 })],
      ]),
    });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: null }], new Map([['u1', ['kol-kosulsuz', 'kol-esikli']]]));
    expect(sonuc.get('u1')?.id).toBe('kosulsuz');
  });

  it('KATEGORİSİ OLMAYAN ürün yalnız koleksiyonlarına bakar', () => {
    const kampanyalar = scopes({ byCategory: new Map([['kat-1', campaign({ id: 'kategori' })]]) });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: null }], new Map());
    expect(sonuc.has('u1')).toBe(false);
  });

  it('kampanyasız ürün haritaya HİÇ girmez — `undefined` ile "kampanya yok" ayrımı korunur', () => {
    const kampanyalar = scopes({ byCategory: new Map([['kat-1', campaign()]]) });
    const sonuc = campaignsByProduct(kampanyalar, [{ id: 'u1', categoryId: 'kat-2' }], new Map());
    expect(sonuc.size).toBe(0);
  });

  it('hiç kampanya yoksa ürünler HİÇ dolaşılmaz — boş harita döner', () => {
    const sonuc = campaignsByProduct(EMPTY_SCOPE_CAMPAIGNS, [{ id: 'u1', categoryId: 'kat-1' }], new Map([['u1', ['kol-1']]]));
    expect(sonuc.size).toBe(0);
  });

  it('aynı kampanya birden çok ürüne düşebilir — küme ürün başına çözülür', () => {
    const kampanyalar = scopes({ byCategory: new Map([['kat-1', campaign({ id: 'ortak' })]]) });
    const sonuc = campaignsByProduct(
      kampanyalar,
      [
        { id: 'u1', categoryId: 'kat-1' },
        { id: 'u2', categoryId: 'kat-1' },
        { id: 'u3', categoryId: 'kat-9' },
      ],
      new Map(),
    );
    expect(sonuc.get('u1')?.id).toBe('ortak');
    expect(sonuc.get('u2')?.id).toBe('ortak');
    expect(sonuc.has('u3')).toBe(false);
  });
});
