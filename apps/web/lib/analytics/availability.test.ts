import { describe, expect, it } from 'vitest';
import type { StorefrontVariant } from '@lezzet/application';
import { availabilityOf } from './availability';

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
