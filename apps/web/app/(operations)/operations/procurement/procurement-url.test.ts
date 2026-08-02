import { describe, expect, it } from 'vitest';
import { parseProcurementUrl, procurementUrl, toOrderFilters } from './procurement-url';

/**
 * URL sözleşmesi saf mantıktır (DB yok) → birim test. Önemi: süzgeçler SUNUCUDA uygulanıyor
 * (`listRows`), yani bu ayrıştırma yanlışsa ekran sessizce yanlış listeyi gösterir — ve sipariş
 * listesi sayfalanan bir okuma olduğu için ikinci sayfa da AYNI ölçütü taşımak zorunda.
 */
const SUPPLIER = '22222222-2222-4222-8222-222222222222';

describe('parseProcurementUrl', () => {
  it('boş parametrelerde varsayılana düşer', () => {
    expect(parseProcurementUrl({})).toEqual({ tab: 'suggestions', status: 'all', supplier: '' });
  });

  it('tanınmayan değerleri sessizce varsayılana çevirir (bozuk link ekranı kırmaz)', () => {
    const s = parseProcurementUrl({ tab: 'hacked', status: 'gonderilmedi' });
    expect(s.tab).toBe('suggestions');
    expect(s.status).toBe('all');
  });

  it('durum süzgeci ENUM kümesinden gelir — yeni bir durum elle eklenmeyi beklemez', () => {
    expect(parseProcurementUrl({ tab: 'orders', status: 'partially_received' }).status).toBe('partially_received');
  });

  it('dizi gelen parametrede ilk değeri alır (?tab=a&tab=b)', () => {
    expect(parseProcurementUrl({ tab: ['orders', 'suppliers'] }).tab).toBe('orders');
  });
});

describe('procurementUrl', () => {
  it('varsayılan durumda parametre YAZMAZ (temiz adres)', () => {
    expect(procurementUrl(parseProcurementUrl({}))).toBe('/operations/procurement');
  });

  it('süzgeçleri yalnız KENDİ sekmesinde yazar', () => {
    // Sipariş sekmesinde süzgeç adreste taşınır…
    expect(procurementUrl({ tab: 'orders', status: 'sent', supplier: SUPPLIER })).toBe(
      `/operations/procurement?tab=orders&status=sent&supplier=${SUPPLIER}`,
    );
    // …ama başka sekmeye geçince düşer: görünmeyen bir daraltmayı taşımak, sekme dönüşünde
    // operatörün göremediği bir süzgeci yürürlükte tutmak olurdu.
    expect(procurementUrl({ tab: 'suppliers', status: 'sent', supplier: SUPPLIER })).toBe(
      '/operations/procurement?tab=suppliers',
    );
  });

  it('gidiş-dönüş korunur (durum → URL → durum)', () => {
    const state = { tab: 'orders', status: 'draft', supplier: SUPPLIER } as const;
    const url = new URL(procurementUrl(state), 'http://x');
    expect(parseProcurementUrl(Object.fromEntries(url.searchParams))).toEqual(state);
  });
});

describe('toOrderFilters', () => {
  it("'all' ve boş değer SÜZGEÇ DEĞİLDİR — servise `undefined` gider", () => {
    expect(toOrderFilters({ tab: 'orders', status: 'all', supplier: '' })).toEqual({
      status: undefined,
      supplierId: undefined,
    });
  });

  it('seçili süzgeçleri servis sözleşmesine çevirir', () => {
    expect(toOrderFilters({ tab: 'orders', status: 'received', supplier: SUPPLIER })).toEqual({
      status: 'received',
      supplierId: SUPPLIER,
    });
  });
});
