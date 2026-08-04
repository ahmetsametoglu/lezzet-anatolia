import { describe, expect, it } from 'vitest';
import { pickSimilar } from './similar';

/**
 * "Bunları da sevebilirsiniz" seçkisi (kullanıcı kararları 04.08).
 *
 * Sınanan şey KURAL, kart sayısı değil — ve üç kural birbirine benziyor ama ayrı davranıyorlar:
 * kendi ailesi TAMAMEN dışarıda, öteki ailelerden BİRER tane, dörtlü dolmazsa yalnız ikincisi
 * kalkar. Üçüncüsü ancak veri seyrekken çalışıyor, yani ötekiler yeşilken sessizce bozulabilir.
 * Saf test: DB yok, ama dosya entegrasyon kökünde çünkü sınır dizinle çiziliyor (`CLAUDE §4b`).
 */
const p = (id: string, familyId: string | null = null) => ({ id, familyId });

describe('pickSimilar', () => {
  it('ailesiz ürünlerde sıra korunur, yalnız tavan uygulanır', () => {
    const out = pickSimilar([p('a'), p('b'), p('c'), p('d'), p('e')], 4, null);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('öteki ailelerden yalnız İLK üye öne geçer', () => {
    const out = pickSimilar([p('a', 'F1'), p('b', 'F1'), p('c', 'F2'), p('d'), p('e')], 4, null);
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'd', 'e']);
  });

  it('bakılan ürünün KENDİ ailesi hiç görünmez', () => {
    const out = pickSimilar([p('kardes1', 'BENIM'), p('kardes2', 'BENIM'), p('x'), p('y')], 4, 'BENIM');
    expect(out.map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('kendi ailesi dörtlüyü doldurmak için bile GERİ ÇAĞRILMAZ', () => {
    // Kritik dal: üçüncü kural (kuralın kalkması) yalnız ÖTEKİ aileleri serbest bırakır. Kendi
    // ailesi yedeğe hiç girmediği için burada kart sayısı ikide kalır — ve bu doğru davranıştır,
    // o aile zaten sayfanın üstündeki çeşit kartlarında duruyor.
    const out = pickSimilar([p('k1', 'BENIM'), p('k2', 'BENIM'), p('k3', 'BENIM'), p('x'), p('y')], 4, 'BENIM');
    expect(out.map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('ailesiz üründe `null` kendi ailesi SAYILMAZ — bütün ailesizleri elemek en sinsi hata olurdu', () => {
    const out = pickSimilar([p('a'), p('b'), p('c', 'F1')], 4, null);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('tek aile şeridi ELE GEÇİREMEZ — aile dışı HER ürün ailedaşlardan önce gelir', () => {
    // Yedi üyeli bir aile + iki ailesiz ürün. Aile önce BİR kart alır, aile dışı adaylar biter,
    // ancak ondan sonra dördüncü kart için aileye dönülür: ikinci üye bir doldurmadır, tercih değil.
    const aile = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].map((id) => p(id, 'BASKA'));
    const out = pickSimilar([...aile, p('x'), p('y')], 4, 'BENIM');
    expect(out.map((x) => x.id)).toEqual(['b1', 'x', 'y', 'b2']);
  });

  it('aile dışı adaylar yetiyorsa aileden İKİNCİ kart hiç gelmez', () => {
    const aile = ['b1', 'b2', 'b3'].map((id) => p(id, 'BASKA'));
    const out = pickSimilar([...aile, p('x'), p('y'), p('z')], 4, 'BENIM');
    expect(out.filter((x) => x.familyId === 'BASKA')).toHaveLength(1);
    expect(out.map((x) => x.id)).toEqual(['b1', 'x', 'y', 'z']);
  });

  it('yedekler öncelikli listenin ARDINA eklenir, araya karışmaz', () => {
    const out = pickSimilar([p('a', 'F1'), p('b', 'F1'), p('c', 'F2')], 3, null);
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('aday yoksa boş döner — uydurma öneri yapılmaz', () => {
    expect(pickSimilar([], 4, null)).toEqual([]);
  });
});
