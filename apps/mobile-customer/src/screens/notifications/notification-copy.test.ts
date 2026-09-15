import { notificationHref } from './notification-copy';

/*
  HEDEF EŞLEMESİ (14.13) — yüzeye özgü kalan parça: mobil rota sözleşmesi webinkinden farklı.
  Cümle sözlüğünün testleri sözlükle birlikte `@lezzet/i18n`e taşındı (14.15) — aynı saf
  fonksiyonu iki koşucuda iki kez test etmek, test kopyası olurdu.

  Çivilenen: sipariş REFERANSLA gider (rota sözleşmesi), talep kimlikle; davetin hedefi YOK.
*/

describe('notificationHref', () => {
  it('sipariş REFERANSLA gider (rota sözleşmesi) — referanssız siparişin hedefi yok', () => {
    expect(notificationHref({ kind: 'order_confirmed', targetType: 'order', targetId: 'uuid', payload: { referenceNo: 'LA-26-X1' } })).toBe('/order/LA-26-X1');
    expect(notificationHref({ kind: 'order_confirmed', targetType: 'order', targetId: 'uuid', payload: { referenceNo: '—' } })).toBeNull();
  });

  it('talep kimlikle; bölge kataloğa, B2B hesaba', () => {
    expect(notificationHref({ kind: 'ticket_replied', targetType: 'ticket', targetId: 't-1', payload: {} })).toBe('/support/t-1');
    expect(notificationHref({ kind: 'zone_available', targetType: 'zone_notice', targetId: 'z-1', payload: {} })).toBe('/catalog');
    expect(notificationHref({ kind: 'b2b_application_result', targetType: 'customer', targetId: 'c-1', payload: {} })).toBe('/account');
  });

  it('YORUM DAVETİ sipariş sayfasına gider (27.08) — jeton payload\'a yine girmez', () => {
    // Üretici hedefi `feedback_request`ten SİPARİŞE çevirdi (kullanıcı kararı): satır tıklanıyor
    // ama hiçbir yere gitmiyordu. Adres siparişin REFERANSINDAN kurulur — rota sözleşmesi bu.
    expect(
      notificationHref({ kind: 'feedback_invite', targetType: 'order', targetId: 'uuid', payload: { referenceNo: 'LA-26-X1' } }),
    ).toBe('/order/LA-26-X1');
    // Jeton hâlâ payload'da DEĞİL: değerlendirme akışını sipariş sayfasındaki teşvik bloğu açar,
    // bildirim satırı bir jeton taşımaz (jeton taşıyan satır, listelenen bir sırdır).
    expect(notificationHref({ kind: 'feedback_invite', targetType: 'feedback_request', targetId: 'f-1', payload: {} })).toBeNull();
  });
});
