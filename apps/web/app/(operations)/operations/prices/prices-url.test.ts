import { describe, expect, it } from 'vitest';
import { parsePricesUrl, toPriceFilters } from './prices-url';

// Ülke fiyatı süzgeci sunucuda uygulanır; servise geçmezse liste süzgeçsiz gelir ve sonraki sayfalar eksik kalır.
describe('toPriceFilters', () => {
  it('ülke fiyatı süzgeci servise geçer, marj süzgeci geçmez', () => {
    expect(toPriceFilters(parsePricesUrl({ scope: 'country' })).hasCountryPrice).toBe('DE');
    expect(toPriceFilters(parsePricesUrl({ scope: 'below' })).hasCountryPrice).toBeUndefined();
  });
});
