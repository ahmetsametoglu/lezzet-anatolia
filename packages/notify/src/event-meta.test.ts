import { describe, expect, it } from 'vitest';
import { MESSAGE } from './event-copy';
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

/**
 * Sözlük TAMLIĞI (14.16 — kullanıcı isteği: birim testler eksiksiz): her olayın ÜÇ dilde bir
 * cümlesi var ve cümle boş değil. Tip `Record` eksik OLAYI derlemede yakalar ama eksik DİLİ
 * yakalayamaz — `say()`in sözlüğü olay gövdesinin içinde ve ancak çalıştırınca görünür.
 * Push ve wa.me aynı cümleyi kullandığı için boş bir dil, iki kanalı birden susturur.
 */
describe('event-copy sözlüğü', () => {
  it('her olay, üç dilde, boş olmayan bir cümle üretir', () => {
    const ornek = {
      referenceNo: 'LZA-TEST', locale: 'tr', customerName: 'Test',
      ticketId: 'x', subject: 'Test', type: 'question', status: 'open', orderReferenceNo: null,
      openedOn: '01.01', history: [], previousStatus: null, ticketUrl: 'u', notificationPreferencesUrl: 'u',
      orderedOn: '01.01', steps: [], lines: [], totals: [], grandTotal: null, paymentNote: null,
      delivery: null, tracking: null, statusAt: null, refund: null, paidOnline: false,
      orderUrl: 'u', deliverySummaryUrl: null, supportUrl: 'u',
      deliveredOn: '01.01', productCount: 1, feedbackUrl: 'u',
      postalCode: '67000', catalogUrl: 'u',
      companyName: null, approved: true, reason: null, actionUrl: 'u',
    };
    for (const event of Object.keys(NOTIFY_EVENT_META) as (keyof typeof NOTIFY_EVENT_META)[]) {
      for (const locale of ['tr', 'fr', 'de'] as const) {
        const cumle = MESSAGE[event]({ ...ornek, locale } as never);
        expect(cumle.trim().length, `${event} · ${locale}`).toBeGreaterThan(5);
      }
    }
  });
});
