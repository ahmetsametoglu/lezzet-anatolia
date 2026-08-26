import { describe, expect, it } from 'vitest';
import { NOTIFY_EVENT_META } from './types';

/**
 * Olay-meta haritası (14.12). Haritanın TAMLIĞI derlemede kilitli (`Record<NotifyEventName, …>`);
 * burada çivilenen şey tamlık değil, üç KARAR — yorumda kalsalar sessizce ters çevrilebilirlerdi:
 */
describe('NOTIFY_EVENT_META', () => {
  it('`ticket_received` uygulama içi satır YAZMAZ — teyit, kendi eylemin yankısıdır', () => {
    expect(NOTIFY_EVENT_META.ticket_received.inApp).toBe(false);
  });

  it('para etkisi taşıyan her sipariş olayı BELGEDİR — dayanıklı ortam yükümlülüğü', () => {
    for (const event of ['order_confirmed', 'order_delivered', 'order_cancelled', 'order_shortfall', 'order_refunded'] as const) {
      expect(NOTIFY_EVENT_META[event].class, event).toBe('document');
    }
    // "Yola çıktı" bir HABERDİR: saklanacak bir kaydı yok, anın kendisi.
    expect(NOTIFY_EVENT_META.order_out_for_delivery.class).toBe('ping');
  });

  it('B2B kararı belgedir — gerekçeli ticari karar, kaybolmaya gelmez', () => {
    expect(NOTIFY_EVENT_META.b2b_application_result.class).toBe('document');
  });
});
