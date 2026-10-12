import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import type { OrderNotification } from '@lezzet/types';
import { OrderOutForDeliveryEmail } from './order-out-for-delivery';

/*
  Bu test şu hatada kırmızıya döner: kodu taşıyan "yolda" e-postası kodu müşterinin dilinde basmaz ya da kodsuz gönderimde kod satırı
  çıkar.
*/

const base: OrderNotification = {
  referenceNo: 'LZA-1234',
  orderedOn: '22 Temmuz 2026',
  customerName: 'Ayşe',
  locale: 'tr',
  steps: [],
  lines: [],
  totals: [],
  grandTotal: null,
  paymentNote: null,
  delivery: null,
  tracking: null,
  statusAt: null,
  refund: null,
  paidOnline: false,
  orderUrl: 'https://example.test/orders/LZA-1234',
  deliverySummaryUrl: null,
  supportUrl: 'https://example.test/support',
  notificationPreferencesUrl: 'https://example.test/preferences',
};

const props = { brandName: 'Lezzet Anatolie', postalAddress: 'Lezzet Anatolie · Strasbourg' };

function html(data: Partial<OrderNotification> = {}): Promise<string> {
  return render(OrderOutForDeliveryEmail({ data: { ...base, ...data }, ...props }));
}

describe('OrderOutForDeliveryEmail', () => {
  it('kodlu gönderim kodu müşterinin dilinde basar', async () => {
    expect(await html({ deliveryCode: '482913' })).toContain('Teslim kodunuz: 482913');
    expect(await html({ deliveryCode: '482913', locale: 'de' })).toContain('Ihr Liefercode: 482913');
  });

  it('kodsuz gönderimde kod satırı yoktur', async () => {
    const output = await html();
    expect(output).not.toContain('Teslim kodunuz');
    expect(output).not.toContain('🔑');
  });
});
