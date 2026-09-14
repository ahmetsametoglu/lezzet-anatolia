import { describe, expect, it } from 'vitest';
import type { CartLine } from '@/lib/cart/cart-types';
import { isSeparateOrder } from './checkout-types';

/**
 * "AYRI sipariş" bandının koşulu (19.7) — kargo checkout'u açık VE sepet bölünmüş.
 *
 * Bu testin varlık sebebi somut (kullanıcı ölçtü 14.09): bant yalnız `?group=shipping` bayrağına
 * bakıyordu ve sepetin TAMAMI kargodayken de "kapıya giden kalemleriniz sepette bekliyor" diyordu —
 * sepette kapıya giden kalem yokken. Bayrak iki sepeti birden taşıyor (bölünmüş sepetin kargo
 * grubu · yalnız kargo sepeti); bant yalnız birincisinde doğru.
 */
function line(route: CartLine['route']): CartLine {
  // Karar yalnız satırın yoluna bakıyor (`splitByRoute`); gerisi bu dosyanın konusu değil.
  return { route } as CartLine;
}

describe('isSeparateOrder', () => {
  it('yalnız kargo kalemi taşıyan sepette bant yok — ölçülen hata', () => {
    expect(isSeparateOrder(true, { lines: [line('shipping'), line('shipping')] })).toBe(false);
  });

  it('bölünmüş sepetin kargo siparişinde bant var — kapıya giden kalemler sepette kalıyor', () => {
    expect(isSeparateOrder(true, { lines: [line('local'), line('shipping')] })).toBe(true);
  });

  it('normal checkout bölünmüş sepette de bant çizmez — bant kargo siparişinin sözü', () => {
    expect(isSeparateOrder(false, { lines: [line('local'), line('shipping')] })).toBe(false);
  });

  it('yolu çözülmemiş satır (paket) kargo siparişine girmez, sepette kalır — bant doğru', () => {
    expect(isSeparateOrder(true, { lines: [line(null), line('shipping')] })).toBe(true);
  });

  it('sepet henüz okunmadıysa söylenecek bir şey yok', () => {
    expect(isSeparateOrder(true, { lines: [] })).toBe(false);
  });
});
