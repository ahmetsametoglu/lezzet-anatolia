import { describe, expect, it } from 'vitest';
import { EMPTY_CART, cartBlockReason, cartBlockedAnalyticsReason, type CartLine, type CartView } from './cart-types';

/**
 * Sepetin ilerleyememe sebebi — SIRA sınanıyor, koşullar değil.
 *
 * Koşulların kendisi tek satırlık; asıl kırılgan olan ikisi birden doğruyken hangisinin
 * söyleneceği. Sıra bir ürün kararı (önce kalemi çıkar, sonra tutarı konuş) ve üç ekran bu sıraya
 * güveniyor — bir gün ters çevrilirse hiçbir şey patlamaz, yalnız müşteriye yanlış cümle söylenir.
 * Saf test: DB yok, ama dosya entegrasyon kökünde çünkü sınır dizinle çiziliyor.
 */
describe('cartBlockReason', () => {
  it('engel yoksa null döner', () => {
    expect(cartBlockReason({ hasBlocked: false, minBasketOk: true })).toBeNull();
  });

  it('gönderilemeyen kalemi asgari sepetten ÖNCE söyler', () => {
    expect(cartBlockReason({ hasBlocked: true, minBasketOk: false })).toBe('undeliverable_line');
  });

  it('kalem sorunu yokken asgari sepeti söyler', () => {
    expect(cartBlockReason({ hasBlocked: false, minBasketOk: false })).toBe('min_basket');
  });

  it('asgari sepet tutuyorken de gönderilemeyen kalem engeldir', () => {
    expect(cartBlockReason({ hasBlocked: true, minBasketOk: true })).toBe('undeliverable_line');
  });
});

/**
 * Ekranın engelini defterin sebebine çeviren eşleştirme (08.9).
 *
 * Defterin kümesi ekranınkinden İNCE: ekran tek cümle kurar, defter "buraya gönderilemiyor" ile
 * "hiçbir depoda yok"u ayırır. Ayrım karıştığı gün "neyi tedarik edelim" ile "nereye genişleyelim"
 * soruları tek kovada toplanır ve ikisi de cevapsız kalır.
 */
function viewOf(over: Partial<CartView>): CartView {
  return { ...EMPTY_CART, minBasketOk: true, ...over };
}

function blockedLine(route: CartLine['route']): CartLine {
  return { blocked: true, route } as CartLine;
}

describe('cartBlockedAnalyticsReason', () => {
  it('engel yoksa yazılacak sebep de yok', () => {
    expect(cartBlockedAnalyticsReason(viewOf({}))).toBeNull();
  });

  it('asgari sepet birebir geçer', () => {
    expect(cartBlockedAnalyticsReason(viewOf({ minBasketOk: false }))).toBe('min_basket');
  });

  it('buraya gönderilemeyen kalem → `not_shippable`', () => {
    expect(cartBlockedAnalyticsReason(viewOf({ hasBlocked: true, lines: [blockedLine('not_shippable_here')] }))).toBe('not_shippable');
  });

  it('hiçbir depoda olmayan kalem → `out_of_stock`', () => {
    expect(cartBlockedAnalyticsReason(viewOf({ hasBlocked: true, lines: [blockedLine('unavailable')] }))).toBe('out_of_stock');
  });

  it('iki engel birden varken kalem sebebi kazanır (ekrandaki sırayla aynı)', () => {
    const view = viewOf({ hasBlocked: true, minBasketOk: false, lines: [blockedLine('unavailable')] });
    expect(cartBlockedAnalyticsReason(view)).toBe('out_of_stock');
  });
});
