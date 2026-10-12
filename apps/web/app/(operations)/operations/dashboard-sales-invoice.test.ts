import { describe, expect, it } from 'vitest';
import { salesInvoiceFact } from './dashboard-sales-invoice';

describe('onay bekleyen satış faturası satırı', () => {
  const today = '2026-10-07';
  const href = '/operations/finance?tab=documents&toissue=1';

  // Bugün açılan sayılsaydı pano teslim günü bitmeden uyarırdı; gün UTC'den sayılsaydı gece yarısından sonra açılan fatura dünden kalırdı.
  it('yalnız Paris takviminde geceyi geçiren fatura sayılır', () => {
    expect(salesInvoiceFact([{ createdAt: '2026-10-07T06:00:00.000Z' }], { today, href })).toBeNull();
    expect(salesInvoiceFact([{ createdAt: '2026-10-06T22:30:00.000Z' }], { today, href })).toBeNull();
    expect(
      salesInvoiceFact([{ createdAt: '2026-10-06T21:30:00.000Z' }, { createdAt: '2026-10-07T08:00:00.000Z' }], { today, href }),
    ).toMatchObject({ count: 1, group: 'today', link: { href } });
  });
});
