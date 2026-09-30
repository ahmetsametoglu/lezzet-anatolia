import { describe, expect, it } from 'vitest';
import { opsNotificationHref } from './staff-notification-href';

describe('opsNotificationHref', () => {
  it('talep kuyruğun ?t= sözleşmesine; hedefi düşmüş satır tıklanmaz', () => {
    expect(opsNotificationHref({ kind: 'ticket_opened', targetType: 'ticket', targetId: 't-1', payload: {} })).toBe(
      '/operations/tickets?t=t-1',
    );
    expect(opsNotificationHref({ kind: 'document_undeliverable', targetType: 'order', targetId: null, payload: {} })).toBeNull();
  });

  it('hedef nesnesi ekranlaşmamış türler işin yapıldığı ekrana gider: eşik→tedarik, kapanış→teslimat, başvuru→müşteriler', () => {
    expect(opsNotificationHref({ kind: 'stock_low', targetType: 'variant', targetId: 'v-1', payload: {} })).toBe('/operations/procurement');
    expect(opsNotificationHref({ kind: 'run_close_mismatch', targetType: null, targetId: null, payload: {} })).toBe(
      '/operations/deliveries',
    );
    expect(opsNotificationHref({ kind: 'b2b_application_received', targetType: 'customer', targetId: 'c-1', payload: {} })).toBe(
      '/operations/customers',
    );
  });
});
