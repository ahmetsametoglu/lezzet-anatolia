import { describe, expect, it } from 'vitest';
import type { CartLineRoute } from '@lezzet/domain-core';
import { EMPTY_CART, cartGroupOf, orderableLines, splitByRoute, undeliverableTotalOf, viewWithEntries, type CartEntry, type CartLine, type CartView } from './cart-types';

/**
 * **Karma sepetin üçüncü hâli** (kullanıcı kararı 10.08) — kalem hangi gruba düşer, siparişe hangisi
 * girer, eşiğe hangisi sayılır.
 *
 * Saf test: DB yok, motor yok — sınanan şey sepetin kendi KARAR yüzeyi. Dosya yine de paketin
 * entegrasyon kökünde, çünkü sınır dizinle çiziliyor (`vitest.config` künyesi).
 *
 * Neden test edilmesi gereken bir şey: sınanan üç kural da sessizce bozulan cinsten. Bozulduklarında
 * hiçbir şey patlamaz — müşteri yalnız sipariş edemeyeceği bir ürünle eşiği geçmiş görünür (ölçüldü
 * 10.08: soğuk zincir ürün rota dışı adresle sepette duruyor, "Siparişi tamamla" yeşil, engel ancak
 * checkout'ta çıkıyordu).
 */

let counter = 0;

function line(route: CartLineRoute | null, over: Partial<CartLine> = {}): CartLine {
  counter += 1;
  return {
    kind: 'variant',
    variantId: `v${counter}`,
    stockId: null,
    qty: 1,
    slug: `urun-${counter}`,
    name: `Ürün ${counter}`,
    image: { url: '', crop: null },
    unitLabel: '',
    unitPriceCents: 1_000,
    limitCap: null,
    lineTotalCents: 1_000,
    blocked: false,
    route,
    group: cartGroupOf({ route }),
    availableHere: null,
    contents: [],
    shippable: true,
    vatRate: 5.5,
    ...over,
  } as CartLine;
}

describe('cartGroupOf — üç grup, dördüncü hâl engeldir', () => {
  it('kapıya teslim yolu local grubudur', () => {
    expect(cartGroupOf({ route: 'local' })).toBe('local');
  });

  it('NORMAL kargo yolu kendi grubudur', () => {
    expect(cartGroupOf({ route: 'shipping' })).toBe('shipping');
  });

  it('soğuk zincir + rota dışı adres TESLİM EDİLEMEZ', () => {
    expect(cartGroupOf({ route: 'not_shippable_here' })).toBe('undeliverable');
  });

  it('tükendi bir yol değil ENGELDİR: ana grupta kalır', () => {
    // `unavailable`ın çıkışı grup değil, `blocked_lines` kapısıdır — grup onu gizlemez.
    expect(cartGroupOf({ route: 'unavailable' })).toBe('local');
  });

  it('yol bilinmiyorsa kalem ana gruptadır — sessizce düşmez', () => {
    expect(cartGroupOf({ route: null })).toBe('local');
  });
});

describe('splitByRoute — teslim edilemeyen kalem EKRANDA kalır', () => {
  it('kargo grubuna yalnız kargo kalemi girer', () => {
    const lines = [line('local'), line('shipping'), line('not_shippable_here')];
    expect(splitByRoute(lines).shipping).toHaveLength(1);
  });

  it('teslim edilemeyen kalem ana şeritten ÇIKARILMAZ (sepetten silinmiyor)', () => {
    const undeliverable = line('not_shippable_here');
    const groups = splitByRoute([line('local'), undeliverable, line('shipping')]);
    expect(groups.route).toContain(undeliverable);
  });
});

describe('orderableLines — sipariş neyi kapsar', () => {
  it('yalnız teslim edilemeyen kalem düşer', () => {
    const lines = [line('local'), line('not_shippable_here'), line('shipping')];
    expect(orderableLines(lines).map((l) => l.route)).toEqual(['local', 'shipping']);
  });

  it('satılamaz kalem DÜŞMEZ — çıkışını kendi kapısı verir', () => {
    const lines = [line('local', { blocked: true }), line('unavailable')];
    expect(orderableLines(lines)).toHaveLength(2);
  });
});

describe('asgari sepet — teslim edilemeyen tutar SAYILMAZ', () => {
  const entriesOf = (lines: CartLine[]): CartEntry[] =>
    lines.map((l) => ({ kind: 'variant', variantId: l.variantId ?? '', qty: l.qty, stockId: l.stockId ?? null }));

  const viewOf = (lines: CartLine[], over: Partial<CartView> = {}): CartView => ({ ...EMPTY_CART, lines, minBasketCents: 1_500, ...over });

  it('gelemeyen kalemlerin toplamı ayrı taşınır', () => {
    expect(undeliverableTotalOf([line('local'), line('not_shippable_here')])).toBe(1_000);
  });

  it('eşiği yalnız gelebilecek kalemlerle geçmiş sayılmaz', () => {
    // 10 € gelebilir + 10 € gelemez = 20 €; eşik 15 € ve TUTMAZ, çünkü matrah 10 €.
    const lines = [line('local'), line('not_shippable_here')];
    const view = viewWithEntries(viewOf(lines), entriesOf(lines));
    expect(view.subtotalCents).toBe(2_000);
    expect(view.undeliverableSubtotalCents).toBe(1_000);
    expect(view.minBasketOk).toBe(false);
    expect(view.missingForMinBasketCents).toBe(500);
  });

  it('gelebilecek kalemler eşiği tutuyorsa geçer', () => {
    const lines = [line('local'), line('local'), line('not_shippable_here')];
    const view = viewWithEntries(viewOf(lines), entriesOf(lines));
    expect(view.minBasketOk).toBe(true);
    expect(view.missingForMinBasketCents).toBe(0);
  });

  it('teslim edilemeyen kalem "Siparişi tamamla"yı KAPATMAZ', () => {
    const lines = [line('local'), line('local'), line('not_shippable_here')];
    const view = viewWithEntries(viewOf(lines), entriesOf(lines));
    expect(view.hasBlocked).toBe(false);
  });
});
