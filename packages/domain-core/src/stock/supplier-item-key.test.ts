import { describe, expect, it } from 'vitest';
import { matchSupplierItem, supplierItemKeyOf } from './supplier-item-key';

describe('tedarikçi kalem anahtarı (06.16 · kullanıcı kararı 14.09)', () => {
  it("kod varsa kod; yoksa adın slug'ı — boşluk tire, harf sade", () => {
    expect(supplierItemKeyOf('GZT-1000', 'Baklava')).toBe('GZT-1000');
    expect(supplierItemKeyOf('  ', 'Druivenmelasse 650gr')).toBe('druivenmelasse-650gr');
    expect(supplierItemKeyOf(null, 'Üzüm Pekmezi 650 g')).toBe('uzum-pekmezi-650-g');
  });

  it('ikisi de boşsa anahtar yok — uydurulmaz', () => {
    expect(supplierItemKeyOf(null, '   ')).toBeNull();
    expect(supplierItemKeyOf(null, null)).toBeNull();
    expect(supplierItemKeyOf('', '!!!')).toBeNull();
  });
});

const mappings = [
  { id: 'm1', supplierCode: 'GZT-1000', nameAtSupplier: 'Antep Baklava (fabrika)' },
  { id: 'm2', supplierCode: 'druivenmelasse-650gr', nameAtSupplier: 'Druivenmelasse 650gr' },
  { id: 'm3', supplierCode: 'BEH-77', nameAtSupplier: 'Tahini 500gr' },
];

describe('kalem eşleşmesi — nokta atışı', () => {
  it('kodla, büyük-küçük harf duyarsız', () => {
    expect(matchSupplierItem(mappings, { code: 'gzt-1000' })).toMatchObject({ status: 'found', record: { id: 'm1' } });
  });

  it("adla: türetilmiş anahtar ya da tedarikçideki adın slug'ı", () => {
    expect(matchSupplierItem(mappings, { name: 'DRUIVENMELASSE 650GR' })).toMatchObject({ status: 'found', record: { id: 'm2' } });
    expect(matchSupplierItem(mappings, { name: 'tahini 500gr' })).toMatchObject({ status: 'found', record: { id: 'm3' } });
  });

  it('parça ad ve yazım farkı bulmaz; boş kalem aranmaz', () => {
    expect(matchSupplierItem(mappings, { name: 'Tahini' })).toEqual({ status: 'none' });
    expect(matchSupplierItem(mappings, { name: 'Druivenmelasse 650 gr' })).toEqual({ status: 'none' });
    expect(matchSupplierItem(mappings, {})).toEqual({ status: 'none' });
  });

  it('iki kayda giden kalem "birden çok" — karar yöneticinin', () => {
    const doubled = [...mappings, { id: 'm4', supplierCode: 'X-1', nameAtSupplier: 'Tahini 500gr' }];
    expect(matchSupplierItem(doubled, { name: 'Tahini 500gr' })).toEqual({ status: 'ambiguous', count: 2 });
  });

  it('aynı kayda kod ve adla birlikte gidilirse tek sonuç', () => {
    expect(matchSupplierItem(mappings, { code: 'BEH-77', name: 'Tahini 500gr' })).toMatchObject({ status: 'found', record: { id: 'm3' } });
  });
});
