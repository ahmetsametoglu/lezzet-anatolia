import { describe, expect, it } from 'vitest';
import { notificationTarget } from './notification-target';

/*
  HEDEF EŞLEMESİ (14.15) — çivilenenler:
  · sipariş satırı web rotasına KİMLİKLE gider (`/orders/[reference]` param'ı `order.id` taşır —
    sipariş listesinin sözleşmesi; mobil REFERANSLA gider, o başka yüzeyin sözleşmesi)
  · talep kimlikle; bölge kataloğa, B2B hesaba
  · davetin hedefi YOK (jeton payload'a girmez — jeton kimlik yerine geçer): tık yalnız okundu işaretler
*/

describe('notificationTarget', () => {
  it('sipariş satırı sipariş sayfasına KİMLİKLE gider', () => {
    expect(notificationTarget({ kind: 'order_confirmed', targetType: 'order', targetId: 'o-1' })).toEqual({
      pathname: '/orders/[reference]',
      params: { reference: 'o-1' },
    });
    // Hedefi düşmüş satır (silinmiş sipariş): tıklanacak yer yok, cümle yine durur.
    expect(notificationTarget({ kind: 'order_confirmed', targetType: 'order', targetId: null })).toBeNull();
  });

  it('talep kimlikle; bölge kataloğa, B2B hesaba; davetin hedefi YOK', () => {
    expect(notificationTarget({ kind: 'ticket_replied', targetType: 'ticket', targetId: 't-1' })).toEqual({
      pathname: '/support/[ticket]',
      params: { ticket: 't-1' },
    });
    expect(notificationTarget({ kind: 'zone_available', targetType: 'zone_notice', targetId: 'z-1' })).toBe('/catalog');
    expect(notificationTarget({ kind: 'b2b_application_result', targetType: 'customer', targetId: 'c-1' })).toBe('/account');
    expect(notificationTarget({ kind: 'feedback_invite', targetType: 'feedback_request', targetId: 'f-1' })).toBeNull();
  });
});
