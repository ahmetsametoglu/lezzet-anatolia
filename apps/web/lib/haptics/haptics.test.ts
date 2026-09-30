import { describe, expect, it } from 'vitest';
import { hapticRouteOf } from './haptics';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

describe('hapticRouteOf', () => {
  it('titreşim komutu olan tarayıcı komutu kullanır, iPhone kimliği taşısa bile', () => {
    expect(hapticRouteOf({ vibrate: () => true, userAgent: IPHONE })).toBe('vibrate');
  });

  it("komutu olmayan iPhone anahtar kutusu yoluna düşer, yoksa iPhone'da hiç titreşim olmaz", () => {
    expect(hapticRouteOf({ userAgent: IPHONE })).toBe('switch');
  });

  it('komutu olmayan masaüstü sessiz kalır', () => {
    expect(hapticRouteOf({ userAgent: MAC })).toBe('none');
    expect(hapticRouteOf(undefined)).toBe('none');
  });
});
