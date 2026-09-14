import { describe, expect, it } from 'vitest';
import { packageRouteStatusOf } from './package';

/*
  PAKETİN YOLU → STOK DİLİ — native paket ekranları ve web telefon görünümü aynı eşlemeyi okur (terfi 14.09).
  Native'in `place-view.test.ts`i `packageStockStatus` üzerinden tükendi önceliğini sürdürüyor; buradaki çiviler
  eşlemenin KENDİSİ — özellikle 21.08 düzeltmesi: tam takımı hiçbir havuzda olmayan paket "başka yerde"dir.
*/

describe('packageRouteStatusOf', () => {
  it('kargo yolu kargo hâlidir', () => {
    expect(packageRouteStatusOf('shipping')).toBe('shipping');
  });

  it('kapıya kilitli ya da tam takımı bu havuzlarda olmayan paket "başka yerde"', () => {
    expect(packageRouteStatusOf('not_shippable_here')).toBe('elsewhere');
    expect(packageRouteStatusOf('unavailable')).toBe('elsewhere');
  });

  it('yerelden gelen paket ve bilinmeyen yer SESSİZ', () => {
    expect(packageRouteStatusOf('local')).toBeNull();
    expect(packageRouteStatusOf(null)).toBeNull();
  });
});
