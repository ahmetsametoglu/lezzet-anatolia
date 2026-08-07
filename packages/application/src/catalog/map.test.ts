import { describe, expect, it } from 'vitest';
import type { AvailableStockTotal } from '@lezzet/types';
import { EMPTY_PRODUCT_CONTEXT, stockStatusOf, type ProductContext } from './map';

/**
 * **Yere göre stok hâli** (19.10) — dört cevap, dört ayrı cümle.
 *
 * Sınanmasının sebebi: bu karar sessizce yanlış olabilecek türden. Yanlış dal hiçbir şeyi
 * patlatmaz, yalnız müşteriye YANLIŞ CÜMLEYİ kurar — kargoyla gönderebileceğimiz ürüne "Tükendi"
 * der (sistem müşteriyi tanıdıkça daha az satar, C3'ün yasakladığı gerileme) ya da tersine, hiçbir
 * depoda olmayan malı "bölgenizde şu an yok" diye bekletir.
 *
 * Test DB'siz ama dosya entegrasyon kökünde: sınır İSİMLE değil DİZİNLE çiziliyor (`CLAUDE §4b`) —
 * `packages/application/src/**` bir entegrasyon köküdür.
 */
const qty = (n: number): AvailableStockTotal => ({
  variantId: 'v1',
  availableQty: n,
  physicalQty: n,
  reservedQty: 0,
  expiredDlcQty: 0,
});

/** Üç haritayı tek tek kurabilen bağlam — yalnız stok alanları anlamlı, ötekiler boş künyeden gelir. */
function ctx(over: Partial<Pick<ProductContext, 'stock' | 'shippingStock' | 'networkStock'>>): ProductContext {
  return { ...EMPTY_PRODUCT_CONTEXT, stock: new Map(), shippingStock: null, networkStock: null, ...over };
}

const dolu = (n: number) => new Map([['v1', qty(n)]]);

describe('stockStatusOf', () => {
  it('yerel depoda varsa `available` — ötekilere hiç bakılmaz', () => {
    expect(stockStatusOf(ctx({ stock: dolu(3), networkStock: dolu(0) }), ['v1'], true)).toBe('available');
  });

  it('yerelde yok ama kargo deposunda varsa `shipping`', () => {
    expect(stockStatusOf(ctx({ stock: dolu(0), shippingStock: dolu(5), networkStock: dolu(5) }), ['v1'], true)).toBe('shipping');
  });

  it('KARGOLANAMAYAN ürün kargo deposunda dursa da o yola giremez — `elsewhere`', () => {
    // Soğuk zincir. Bu dal atlansaydı müşteriye "kargoyla gönderilir" denir, sonra gönderilemezdi.
    expect(stockStatusOf(ctx({ stock: dolu(0), shippingStock: dolu(5), networkStock: dolu(5) }), ['v1'], false)).toBe('elsewhere');
  });

  it('ne yerelde ne kargoda ama AĞDA varsa `elsewhere` — "tükendi" değil', () => {
    expect(stockStatusOf(ctx({ stock: dolu(0), shippingStock: dolu(0), networkStock: dolu(7) }), ['v1'], true)).toBe('elsewhere');
  });

  it('hiçbir depoda yoksa `out_of_stock` — tek meşru "Tükendi"', () => {
    expect(stockStatusOf(ctx({ stock: dolu(0), shippingStock: dolu(0), networkStock: dolu(0) }), ['v1'], true)).toBe('out_of_stock');
  });

  it('YER BİLİNMİYORKEN `stock` zaten ağ toplamıdır — boş kalan `networkStock` "hiçbir yerde yok" demektir', () => {
    // Yersiz okumada `loadProductContext` ağ toplamını `stock`a koyar ve `networkStock`u null
    // bırakır. `null` burada "ölçülmedi" değil "aynı sayı" anlamına gelir; ikinci bir okuma
    // yapılsaydı aynı cevabı verirdi.
    expect(stockStatusOf(ctx({ stock: dolu(0), networkStock: null }), ['v1'], true)).toBe('out_of_stock');
    expect(stockStatusOf(ctx({ stock: dolu(4), networkStock: null }), ['v1'], true)).toBe('available');
  });

  it('karar ÜRÜN düzeyinde tüm boyların TOPLAMINDAN doğar — bir boyu biten ürün tükenmiş sayılmaz', () => {
    const stock = new Map([
      ['v1', { ...qty(0), variantId: 'v1' }],
      ['v2', { ...qty(2), variantId: 'v2' }],
    ]);
    expect(stockStatusOf(ctx({ stock }), ['v1', 'v2'], true)).toBe('available');
    // Tek başına sorulduğunda o boy gerçekten tükenmiştir — kart ile "Boy seçin" farklı cevap verir.
    expect(stockStatusOf(ctx({ stock }), ['v1'], true)).toBe('out_of_stock');
  });

  it('haritada hiç satırı olmayan varyant SIFIR sayılır, atlanmaz', () => {
    // "Ölçülemeyen değer sıfır değildir" (CLAUDE §1) burada TERSİNE işler: `available_stock`
    // görünümü stoğu olmayan varyant için satır ÜRETMEZ, yani satırın yokluğu bir ölçüm düşüşü
    // değil ölçümün kendisidir — sıfır adet.
    expect(stockStatusOf(ctx({ stock: new Map() }), ['yok'], true)).toBe('out_of_stock');
  });
});
