import { describe, expect, it } from 'vitest';
import { cartLinkRedirect } from './cart-link-redirect';

/**
 * Ara katmandaki sepet bağlantısı kararı (08.09). Ölçülen arıza: sayfa içindeki `redirect()`
 * `loading.tsx` altında akış içi gidiyor ve Next'in `Router`ı çöküyordu; karar ara katmana taşındı.
 * Burada sınanan şey karar: hangi adres çerez kapısına gider, hangisi dokunulmadan geçer.
 */
describe('cartLinkRedirect — sepet bağlantısı ara katmanda 307', () => {
  it('üç dilin sepet yolu + jeton → çerez kapısı; jeton ve dil sorguda', () => {
    for (const [locale, path] of [
      ['fr', '/fr/panier'],
      ['tr', '/tr/sepet'],
      ['de', '/de/warenkorb'],
    ] as const) {
      const hedef = cartLinkRedirect(new URL(`http://localhost:3000${path}?link=ABCDEFGHJKLM`));
      expect(hedef?.pathname).toBe('/auth/cart-link');
      expect(hedef?.searchParams.get('token')).toBe('ABCDEFGHJKLM');
      expect(hedef?.searchParams.get('locale')).toBe(locale);
    }
  });

  it('Facebook\'un eklediği fbclid gibi fazladan parametreler yok sayılır, sondaki eğik çizgi de', () => {
    const hedef = cartLinkRedirect(new URL('http://localhost:3000/tr/sepet/?link=ABCDEFGHJKLM&fbclid=IwY2xj'));
    expect(hedef?.searchParams.get('token')).toBe('ABCDEFGHJKLM');
    expect(hedef?.searchParams.has('fbclid')).toBe(false);
  });

  it('jeton yoksa, sepet yolu değilse ya da dil öneki yoksa dokunmaz', () => {
    expect(cartLinkRedirect(new URL('http://localhost:3000/tr/sepet'))).toBeNull();
    expect(cartLinkRedirect(new URL('http://localhost:3000/tr/sepet?link='))).toBeNull();
    expect(cartLinkRedirect(new URL('http://localhost:3000/tr/urun/baklava?link=ABCDEFGHJKLM'))).toBeNull();
    expect(cartLinkRedirect(new URL('http://localhost:3000/sepet?link=ABCDEFGHJKLM'))).toBeNull();
    expect(cartLinkRedirect(new URL('http://localhost:3000/en/cart?link=ABCDEFGHJKLM'))).toBeNull();
  });
});
