import { describe, expect, it } from 'vitest';
import { parseWarehousesUrl, warehousesUrl } from './warehouses-url';

// URL sözleşmesi: tek soru, tek parametre. Test edilen şey adresin PAYLAŞILABİLİR kalması —
// bozuk ya da farklı yazılmış bir bağlantı ekranı kırmamalı, aynı tesise açmalı.

describe('parseWarehousesUrl', () => {
  it('kodu büyük harfe çeker — `?depo=str` yazan bağlantı da çalışır', () => {
    expect(parseWarehousesUrl({ depo: 'str' }).code).toBe('STR');
  });

  it('boşlukları kırpar', () => {
    expect(parseWarehousesUrl({ depo: '  kehl ' }).code).toBe('KEHL');
  });

  it('parametre yoksa LİSTE görünümü (boş kod)', () => {
    expect(parseWarehousesUrl({}).code).toBe('');
  });

  it('tekrarlanan parametrede ilkini alır — ikisini birleştirmek olmayan bir kod üretirdi', () => {
    expect(parseWarehousesUrl({ depo: ['STR', 'COL'] }).code).toBe('STR');
  });
});

describe('warehousesUrl', () => {
  it('boş kod parametresiz adres verir (temiz liste adresi)', () => {
    expect(warehousesUrl({ code: '' })).toBe('/operations/warehouses');
  });

  it('kod adrese yazılır', () => {
    expect(warehousesUrl({ code: 'STR' })).toBe('/operations/warehouses?depo=STR');
  });

  it('gidiş-dönüş bozulmaz', () => {
    expect(parseWarehousesUrl({ depo: 'KEHL' })).toEqual({ code: 'KEHL' });
    expect(warehousesUrl(parseWarehousesUrl({ depo: 'kehl' }))).toBe('/operations/warehouses?depo=KEHL');
  });
});
