import { describe, expect, it } from 'vitest';
import { phoneMetaLine, type HeadSelling } from './phone-meta-line';

const oil: HeadSelling = {
  priceCents: 1250,
  comparisonCents: 1667,
  comparisonUnit: 'L',
  limitLabel: null,
  stockStatus: 'available',
  soldOut: false,
};

describe('phoneMetaLine', () => {
  it('birim fiyatı verinin birimiyle yazar: sıvı litreyle, katı kiloyla', () => {
    expect(phoneMetaLine(oil, 'tr')).toMatch(/16,67\s€ \/ L · KDV dahil/);
    expect(phoneMetaLine(oil, 'tr')).not.toContain('/ kg');
    expect(phoneMetaLine({ ...oil, comparisonUnit: 'kg' }, 'tr')).toMatch(/16,67\s€ \/ kg/);
  });
});
