import { describe, expect, it } from 'vitest';
import {
  EMPTY_CART,
  cartBlockReason,
  cartBlockedAnalyticsReason,
  checkoutBlockedAnalyticsReason,
  isSplitCart,
  type CartLine,
  type CartView,
} from './cart-types';

/**
 * Sepetin ilerleyememe sebebi — SIRA sınanıyor, koşullar değil.
 *
 * Koşulların kendisi tek satırlık; asıl kırılgan olan ikisi birden doğruyken hangisinin
 * söyleneceği. Sıra bir ürün kararı (önce kalemi çıkar, sonra tutarı konuş) ve üç ekran bu sıraya
 * güveniyor — bir gün ters çevrilirse hiçbir şey patlamaz, yalnız müşteriye yanlış cümle söylenir.
 * Saf test: DB yok, ama dosya entegrasyon kökünde çünkü sınır dizinle çiziliyor.
 *
 * Terfiyle birlikte web'den geldi (aşama 1/3); web'deki nüsha KÖPRÜYÜ sınamaya devam ediyor.
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

/**
 * ÖDEME adımının retleri (24.08 · MB-63) — kardeşinin sepet karşılığı.
 *
 * **Sınanan asıl şey `null` dönen dal.** Eşleşmeyen bir ret sessizce ölçülmüyor ve bu BİLİNÇLİ
 * (`price_changed` bir engel değil, onay yenilemesidir; `date_unavailable`ın enum'da karşılığı
 * yok). Ama "bilinçli" ile "unutulmuş" kodda aynı görünür: ikisi de `null` döner. Test o ayrımı
 * yazıya döküyor — biri bir gün bu kümeyi genişletmek isterse, neyin karar neyin boşluk olduğunu
 * buradan okur.
 *
 * İkinci kural: iki farklı stok reddi TEK kovaya düşer. Ayrı ayrı sayılsalardı huninin aynı
 * sürtünmesi iki satıra bölünür ve ikisi de küçük görünürdü.
 */
describe('checkoutBlockedAnalyticsReason', () => {
  it('engellenen kalem → `not_shippable`', () => {
    expect(checkoutBlockedAnalyticsReason('blocked_lines')).toBe('not_shippable');
  });

  it('iki ayrı stok reddi AYNI kovaya düşer', () => {
    expect(checkoutBlockedAnalyticsReason('insufficient_here')).toBe('out_of_stock');
    expect(checkoutBlockedAnalyticsReason('insufficient_stock')).toBe('out_of_stock');
  });

  it('ödeme oturumu açılamadı → kendi adıyla', () => {
    expect(checkoutBlockedAnalyticsReason('payment_failed')).toBe('payment_failed');
  });

  it('BİLEREK ölçülmeyenler `null` döner — sözlükte karşılığı olmayan ret uydurulmaz', () => {
    // `price_changed`: müşteri engellenmiyor, onayı yenileniyor. `date_unavailable`: gerçek bir
    // sürtünme ama `AnalyticsBlockedReason`da karşılığı yok. `order_not_placed`: sürtünme değil hata.
    expect(checkoutBlockedAnalyticsReason('price_changed')).toBeNull();
    expect(checkoutBlockedAnalyticsReason('date_unavailable')).toBeNull();
    expect(checkoutBlockedAnalyticsReason('order_not_placed')).toBeNull();
  });

  it('tanınmayan bir dize ölçüme SIZMAZ', () => {
    // Kapı `string` alıyor (durum makinesinin çıktısı geniş); tanınmayan her şey sessizce düşmeli,
    // yoksa yeni bir durum adı bir gün yanlış kovaya yazılır.
    expect(checkoutBlockedAnalyticsReason('placed')).toBeNull();
    expect(checkoutBlockedAnalyticsReason('')).toBeNull();
  });
});

/**
 * Sepetin İKİ GRUBA bölünmesi (08.9) — tasarımın "Sepeti bölünen" sayacının ölçütü.
 *
 * Bölünme müşteri için iki ayrı sipariş, iki ayrı ödeme demek: huninin en pahalı sürtünmelerinden
 * biri ve bugüne kadar hiç ölçülmüyordu. Testin işi ölçütü çivilemek — "kargo kalemi var" ile
 * "sepet bölündü" aynı şey DEĞİL.
 */
describe('isSplitCart', () => {
  it('yalnız kapıya giden kalemler → bölünme yok', () => {
    expect(isSplitCart({ lines: [blockedLine('local'), blockedLine('local')] })).toBe(false);
  });

  it('sepetin TAMAMI kargoda → bölünme yok (tek sipariş doğar)', () => {
    expect(isSplitCart({ lines: [blockedLine('shipping')] })).toBe(false);
  });

  it('iki grup birden → bölünme', () => {
    expect(isSplitCart({ lines: [blockedLine('local'), blockedLine('shipping')] })).toBe(true);
  });

  it('yolu çözülmemiş sepette bölünme yoktur — yer bilinmiyorken grup da yok', () => {
    expect(isSplitCart({ lines: [blockedLine(null), blockedLine(null)] })).toBe(false);
  });
});
