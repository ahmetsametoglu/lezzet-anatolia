import { describe, expect, it } from 'vitest';
import { decideCartAgainstWarehouse, type CartLineInput } from './cart-warehouse';

/**
 * Karma sepet (19.3) — DOMAIN §17 / C8.
 *
 * Sınanan asıl kural: **yolu stok belirler, müşteri seçmez.** Yerelde bulunan kalem kargoya
 * yönlendirilemez; yerelde olmayan kargolanabilir kalem engellenmez, ayrı siparişe gider.
 */

const line = (over: Partial<CartLineInput> = {}): CartLineInput => ({
  variantId: 'v-1',
  qty: 2,
  shippable: true,
  localAvailable: 10,
  shippingAvailable: 10,
  ...over,
});

describe('yolu stok belirler', () => {
  it('yerelde varsa rota siparişiyle gider — kargolanabilir olsa bile', () => {
    const karar = decideCartAgainstWarehouse([line()]);
    expect(karar.lines[0]).toMatchObject({ route: 'local', fulfillableQty: 2 });
    expect(karar.shippingLines).toHaveLength(0);
  });

  it('yerelde yok ama kargo deposunda varsa AYRI siparişe düşer (engellenmez)', () => {
    const karar = decideCartAgainstWarehouse([line({ localAvailable: 0 })]);
    expect(karar.lines[0]).toMatchObject({ route: 'shipping', fulfillableQty: 2 });
    expect(karar.shippingOnly).toBe(true);
  });

  it('iki depoda da yoksa GERÇEKTEN tükendi', () => {
    const karar = decideCartAgainstWarehouse([line({ localAvailable: 0, shippingAvailable: 0 })]);
    expect(karar.lines[0]).toMatchObject({ route: 'unavailable', fulfillableQty: 0 });
  });

  it('soğuk zincir ürünü yerelde yoksa kargo dolgusu AÇILMAZ — depo değiştiremez', () => {
    const karar = decideCartAgainstWarehouse([line({ shippable: false, localAvailable: 0, shippingAvailable: 50 })]);
    // Kargo deposunda 50 adet var ama bu ürün kargoya çıkamaz: cevap "burada satılmıyor".
    expect(karar.lines[0]).toMatchObject({ route: 'not_shippable_here', fulfillableQty: 0 });
    expect(karar.shippingLines).toHaveLength(0);
  });
});

describe('kısmi karşılama kalem düzeyindedir, adet düzeyinde değil', () => {
  it('yerelde kısmen varsa yerel kalır — kalanı için ikinci yol açılmaz', () => {
    const karar = decideCartAgainstWarehouse([line({ qty: 5, localAvailable: 3, shippingAvailable: 10 })]);
    // Aynı kalemi ikiye bölmek, tek ürün için iki ödeme yaptırmak olurdu.
    expect(karar.lines[0]).toMatchObject({ route: 'local', fulfillableQty: 3 });
    expect(karar.shippingLines).toHaveLength(0);
  });
});

describe('sepetin bütünü', () => {
  it('karma sepet iki gruba ayrılır — iki checkout, iki sipariş', () => {
    const karar = decideCartAgainstWarehouse([
      line({ variantId: 'v-yerel' }),
      line({ variantId: 'v-kargo', localAvailable: 0 }),
    ]);
    expect(karar.localLines.map((l) => l.variantId)).toEqual(['v-yerel']);
    expect(karar.shippingLines.map((l) => l.variantId)).toEqual(['v-kargo']);
    // Rota kalemi de var: müşteriye "ayrıca kargo siparişi" diye sunulur, kendiliğinden doğmaz.
    expect(karar.shippingOnly).toBe(false);
  });

  it('sepetin tamamı yerel-dışıysa salt-kargo siparişi KENDİLİĞİNDEN doğar', () => {
    const karar = decideCartAgainstWarehouse([
      line({ variantId: 'a', localAvailable: 0 }),
      line({ variantId: 'b', localAvailable: 0 }),
    ]);
    // Müşteriye "iki sipariş vereceksiniz" denmez — verilecek tek sipariş var.
    expect(karar.shippingOnly).toBe(true);
    expect(karar.localLines).toHaveLength(0);
  });

  it('hiçbiri karşılanamıyorsa iki grup da boştur (checkout hiç açılmaz)', () => {
    const karar = decideCartAgainstWarehouse([line({ localAvailable: 0, shippingAvailable: 0 })]);
    expect(karar.localLines).toHaveLength(0);
    expect(karar.shippingLines).toHaveLength(0);
    expect(karar.shippingOnly).toBe(false);
  });
});
