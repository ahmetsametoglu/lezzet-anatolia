import type { AppNotificationKind } from '@lezzet/types';

import { notificationHref, notificationSentence } from './notification-copy';

/*
  BİLDİRİM SÖZLÜĞÜ (14.13) — çivilenenler:
  · bilinen her tür × üç dil boş olmayan cümle üretir (küme AÇIK olduğu için tip bunu zorlayamaz)
  · bilinmeyen tür GENEL cümleye düşer — eski sürüm yeni türü boş satırla karşılamaz
  · payload cümleye girer (referans) ama YOKLUĞU cümleyi bozmaz
  · hedef eşlemesi: sipariş REFERANSLA gider (rota sözleşmesi), talep kimlikle; davetin hedefi YOK
*/

const KNOWN: AppNotificationKind[] = [
  'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled',
  'order_shortfall', 'order_refunded', 'ticket_replied', 'ticket_status_changed',
  'feedback_invite', 'zone_available', 'b2b_application_result',
];

describe('notificationSentence', () => {
  it('bilinen her tür, üç dilde, boş olmayan cümle üretir', () => {
    for (const kind of KNOWN) {
      for (const locale of ['tr', 'fr', 'de'] as const) {
        const cumle = notificationSentence({ kind, payload: { referenceNo: 'LA-26-TEST', postalCode: '67000', approved: true } }, locale);
        expect(cumle.trim().length).toBeGreaterThan(5);
      }
    }
  });

  it('referans cümleye girer; yokluğu cümleyi bozmaz', () => {
    expect(notificationSentence({ kind: 'order_confirmed', payload: { referenceNo: 'LA-26-X1' } }, 'tr')).toContain('LA-26-X1');
    // '—' sunucunun "referans henüz yok" değeri — cümleye sızmaz.
    expect(notificationSentence({ kind: 'order_confirmed', payload: { referenceNo: '—' } }, 'tr')).not.toContain('—');
    expect(notificationSentence({ kind: 'order_confirmed', payload: {} }, 'tr')).toContain('alındı');
  });

  it('BİLİNMEYEN tür genel cümleye düşer — kind kümesi sunucuda büyür', () => {
    const cumle = notificationSentence({ kind: 'yarin_gelecek_tur', payload: {} }, 'tr');
    expect(cumle).toBe('Hesabınızla ilgili bir gelişme var.');
  });
});

describe('notificationHref', () => {
  it('sipariş REFERANSLA gider (rota sözleşmesi) — referanssız siparişin hedefi yok', () => {
    expect(notificationHref({ kind: 'order_confirmed', targetType: 'order', targetId: 'uuid', payload: { referenceNo: 'LA-26-X1' } })).toBe('/order/LA-26-X1');
    expect(notificationHref({ kind: 'order_confirmed', targetType: 'order', targetId: 'uuid', payload: { referenceNo: '—' } })).toBeNull();
  });

  it("talep kimlikle; bölge kataloğa, B2B hesaba; davetin hedefi YOK (jeton payload'a girmez)", () => {
    expect(notificationHref({ kind: 'ticket_replied', targetType: 'ticket', targetId: 't-1', payload: {} })).toBe('/support/t-1');
    expect(notificationHref({ kind: 'zone_available', targetType: 'zone_notice', targetId: 'z-1', payload: {} })).toBe('/catalog');
    expect(notificationHref({ kind: 'b2b_application_result', targetType: 'customer', targetId: 'c-1', payload: {} })).toBe('/account');
    expect(notificationHref({ kind: 'feedback_invite', targetType: 'feedback_request', targetId: 'f-1', payload: {} })).toBeNull();
  });
});
