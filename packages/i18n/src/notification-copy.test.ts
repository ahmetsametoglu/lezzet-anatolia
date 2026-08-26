import { describe, expect, it } from 'vitest';
import type { AppNotificationKind } from '@lezzet/types';
import { notificationSentence, staffNotificationBrief } from './notification-copy';

/*
  BİLDİRİM SÖZLÜĞÜ (14.13 → 14.15'te paylaşılan pakete terfi) — çivilenenler:
  · bilinen her müşteri türü × üç dil boş olmayan cümle üretir (küme AÇIK, tip bunu zorlayamaz)
  · bilinmeyen tür GENEL cümleye düşer — eski sürüm yeni türü boş satırla karşılamaz
  · payload cümleye girer (referans) ama YOKLUĞU cümleyi bozmaz
  · personel başlığı referans taşır; bilinmeyen personel türünde `null` — genel metin YÜZEYİN işi
  (test mobil jest'ten taşındı: sözlük artık iki yüzeyin ortak malı, testi de tek yerde koşar)
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

describe('staffNotificationBrief', () => {
  it('ulaştırılamayan belge: alert tonu, başlıkta referans ve sebep', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: { referenceNo: 'LA-26-X1' } });
    expect(brief).not.toBeNull();
    expect(brief!.tone).toBe('alert');
    expect(brief!.title).toContain('LA-26-X1');
    expect(brief!.title).toContain('e-postası yok');
  });

  it('referanssız payload başlığı bozmaz; bilinmeyen türde null — genel metin yüzeyin işi', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: {} });
    expect(brief!.title).toContain('Ulaştırılamayan sipariş onayı');
    expect(staffNotificationBrief({ kind: 'yeni_personel_turu', payload: {} })).toBeNull();
  });
});
