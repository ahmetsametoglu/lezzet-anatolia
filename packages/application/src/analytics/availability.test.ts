import { describe, expect, it } from 'vitest';
import type { StorefrontVariant } from '../catalog/storefront-types';
import { availabilityOf, bundleAvailabilityOf } from './availability';

/**
 * Görüntüleme anındaki satılabilirlik — sınanan şey KURAL, alan kopyalama değil.
 *
 * İki kural kırılgan ve ikisi de ürün kararı: ürün düzeyinde EN İYİ hâl yazılır (bir boyu tükenmiş
 * ürün tükenmiş sayılmaz) ve "satışa kapalı" stok hâllerinin ÖNÜNDE gelir (fiyatı olmayan ürünün
 * stoğu konuşulmaz). Ters çevrilseler hiçbir şey patlamaz — yalnız "çok bakılıp az alınan" listesi
 * yanlış ürünlerle dolar, ki alanın var olma sebebi tam olarak onu engellemekti.
 */
function variant(over: Partial<StorefrontVariant>): StorefrontVariant {
  return {
    id: 'v1',
    label: '500 g',
    netWeightG: 500,
    priceCents: 1200,
    comparisonCents: null,
    limitLabel: null,
    stockId: null,
    stockStatus: 'available',
    soldOut: false,
    ...over,
  } as StorefrontVariant;
}

describe('availabilityOf', () => {
  it('fiyatı olan ve stokta olan varyant → satılabilir', () => {
    expect(availabilityOf([variant({})])).toBe('sellable');
  });

  it('hiçbir varyantın fiyatı yoksa → satışa kapalı (stok hâline BAKILMADAN)', () => {
    expect(availabilityOf([variant({ priceCents: null, stockStatus: 'available' })])).toBe('closed');
  });

  it('bir boyu tükendiyse ürün tükenmiş SAYILMAZ — en iyi hâl yazılır', () => {
    const variants = [variant({ id: 'v1', stockStatus: 'out_of_stock', soldOut: true }), variant({ id: 'v2', stockStatus: 'available' })];
    expect(availabilityOf(variants)).toBe('sellable');
  });

  it('yalnız kargo deposundaysa satılabilirdir (bilinen sınır: `shipping` ayrı yazılmıyor)', () => {
    expect(availabilityOf([variant({ stockStatus: 'shipping' })])).toBe('sellable');
  });

  it('ağda var ama buraya ulaşmıyorsa → burada yok', () => {
    expect(availabilityOf([variant({ stockStatus: 'elsewhere' })])).toBe('not_here');
  });

  it('hepsi tükendiyse → tükendi', () => {
    expect(availabilityOf([variant({ stockStatus: 'out_of_stock', soldOut: true })])).toBe('sold_out');
  });

  it('fiyatsız varyant stok kararına KARIŞMAZ', () => {
    // Fiyatsız varyant "satılamaz"dır; onun stoğuna bakıp ürünü satılabilir saymak yanlış olurdu.
    const variants = [variant({ id: 'v1', priceCents: null, stockStatus: 'available' }), variant({ id: 'v2', stockStatus: 'out_of_stock' })];
    expect(availabilityOf(variants)).toBe('sold_out');
  });
});

/**
 * PAKETİN satılabilirliği — kardeşiyle aynı dört kovaya yazar ama BAŞKA veriden türer.
 *
 * Sınanan iki kural da "ölçülemeyeni olumsuz sayma" ekseninde: yer bilinmiyorsa (`route: null`)
 * paket "buraya gelmiyor" DEĞİLDİR, ve fiyatı olmayan paketin stoğu hiç konuşulmaz. İkisi de ters
 * çevrilse hata vermez — yalnız defter, satılabilir paketleri satılamaz diye sayar ve "hiç
 * bakılmıyor" sanılan paketler aslında yanlış sınıflanmış olur.
 */
describe('bundleAvailabilityOf', () => {
  const pack = (over: Partial<Parameters<typeof bundleAvailabilityOf>[0]> = {}) => ({
    priceCents: 2500,
    soldOut: false,
    route: 'local' as const,
    ...over,
  });

  it('fiyatı olan, stoğu olan, rotası olan paket → satılabilir', () => {
    expect(bundleAvailabilityOf(pack())).toBe('sellable');
  });

  it('fiyatı yoksa → satışa kapalı, stok hâline BAKILMADAN', () => {
    // Sıra kardeşininkiyle aynı gerekçeyle: fiyatsızlık bir stok hâli değil, bir satış kararıdır.
    expect(bundleAvailabilityOf(pack({ priceCents: null, soldOut: false }))).toBe('closed');
  });

  it('buraya gönderilemiyorsa → burada yok (tükenmişten ÖNCE gelir)', () => {
    expect(bundleAvailabilityOf(pack({ route: 'not_shippable_here', soldOut: true }))).toBe('not_here');
  });

  it('tükendiyse → tükendi', () => {
    expect(bundleAvailabilityOf(pack({ soldOut: true }))).toBe('sold_out');
  });

  it('rota `unavailable` ise tükenmiş sayılır — paket BÖLÜNMEZ, bir parçası yoksa paket yok', () => {
    expect(bundleAvailabilityOf(pack({ route: 'unavailable' }))).toBe('sold_out');
  });

  it('YER BİLİNMİYORSA (`route: null`) "burada yok" DEĞİLDİR — ölçülemeyen olumsuz sayılmaz', () => {
    // Misafir henüz posta kodu vermemiştir. `not_here` yazmak, sormadığımız bir soruya olumsuz
    // cevap uydurmak olurdu (CLAUDE §1); o hâlde yalnız `soldOut` konuşur.
    expect(bundleAvailabilityOf(pack({ route: null }))).toBe('sellable');
    expect(bundleAvailabilityOf(pack({ route: null, soldOut: true }))).toBe('sold_out');
  });
});
