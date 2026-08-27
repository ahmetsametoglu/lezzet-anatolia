import { describe, expect, it } from 'vitest';
import type { AppNotificationKind } from '@lezzet/types';
import { notificationSentence, notificationVisual, staffNotificationBrief } from './notification-copy';

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

describe('notificationVisual', () => {
  it('bilinen her tür ikon + ton + üç dilde etiket taşır — "bir bakışta tip" sözleşmesi', () => {
    for (const kind of KNOWN) {
      const visual = notificationVisual({ kind, payload: { approved: true } });
      expect(visual.icon.length).toBeGreaterThan(0);
      expect(['positive', 'attention', 'issue', 'neutral']).toContain(visual.tone);
      for (const locale of ['tr', 'fr', 'de'] as const) expect(visual.label(locale).length).toBeGreaterThan(1);
    }
  });

  it('iptal "issue", eksik teslim "attention"; B2B tonu SONUCA göre; bilinmeyen tür zile düşer', () => {
    expect(notificationVisual({ kind: 'order_cancelled', payload: {} }).tone).toBe('issue');
    expect(notificationVisual({ kind: 'order_shortfall', payload: {} }).tone).toBe('attention');
    expect(notificationVisual({ kind: 'b2b_application_result', payload: { approved: true } }).tone).toBe('positive');
    expect(notificationVisual({ kind: 'b2b_application_result', payload: { approved: false } }).tone).toBe('attention');
    const bilinmeyen = notificationVisual({ kind: 'yarin_gelecek_tur', payload: {} });
    expect(bilinmeyen.icon).toBe('🔔');
    expect(bilinmeyen.label('tr')).toBe('Bildirim');
  });
});

const KNOWN_STAFF: AppNotificationKind[] = [
  'document_undeliverable', 'ticket_opened', 'stock_low', 'run_close_mismatch', 'b2b_application_received',
];

describe('staffNotificationBrief', () => {
  it('bilinen her personel türü başlık + ton + tür etiketi taşır', () => {
    for (const kind of KNOWN_STAFF) {
      const brief = staffNotificationBrief({ kind, payload: { referenceNo: 'LA-26-X', ticketType: 'damaged', sku: 'SKU-1', availableQty: 2, minStockQty: 10 } });
      expect(brief, kind).not.toBeNull();
      expect(brief!.title.length, kind).toBeGreaterThan(5);
      expect(brief!.label.length, kind).toBeGreaterThan(1);
      expect(['alert', 'attention', 'quiet']).toContain(brief!.tone);
    }
  });

  it('ulaştırılamayan belge: alert tonu, başlıkta referans ve sebep', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: { referenceNo: 'LA-26-X1' } });
    expect(brief).not.toBeNull();
    expect(brief!.tone).toBe('alert');
    expect(brief!.title).toContain('LA-26-X1');
    expect(brief!.title).toContain('e-postası yok');
  });

  it('belge başlığı HANGİ belge olduğunu söyler — aynı siparişin iki olayı ayrı satır okunur', () => {
    const baslik = (event: string) =>
      staffNotificationBrief({ kind: 'document_undeliverable', payload: { event, referenceNo: 'LA-26-X1' } })!.title;
    // Belge sınıfı altı olayı kapsıyor; 27.08'e kadar hepsi "sipariş onayı" diye görünüyordu.
    expect(baslik('order_confirmed')).toContain('sipariş onayı');
    expect(baslik('order_delivered')).toContain('teslim özeti');
    expect(baslik('order_cancelled')).toContain('iptal bildirimi');
    expect(baslik('order_refunded')).toContain('iade bildirimi');
    // İki farklı olay AYNI metni üretmemeli — ekranda ayırt edilebilirliğin çivisi.
    expect(baslik('order_confirmed')).not.toBe(baslik('order_delivered'));
    // Tanınmayan olay başlığı bozmaz: genel "belge" der, satır yine okunur.
    expect(baslik('yarin_gelecek_belge')).toContain('Ulaştırılamayan belge');
  });

  it('şikâyet tipi başlıkta Türkçedir; eşik satırı sayıları taşır; soru "Talep" etiketi alır', () => {
    const sikayet = staffNotificationBrief({ kind: 'ticket_opened', payload: { ticketType: 'damaged', referenceNo: 'LA-26-X1' } });
    expect(sikayet!.label).toBe('Şikâyet');
    expect(sikayet!.title).toContain('hasarlı ürün');
    const soru = staffNotificationBrief({ kind: 'ticket_opened', payload: { ticketType: 'question' } });
    expect(soru!.label).toBe('Talep');
    const esik = staffNotificationBrief({ kind: 'stock_low', payload: { sku: 'BKL-500', availableQty: 3, minStockQty: 10 } });
    expect(esik!.title).toContain('BKL-500');
    expect(esik!.title).toContain('3/10');
  });

  it('referanssız payload başlığı bozmaz; bilinmeyen türde null — genel metin yüzeyin işi', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: {} });
    expect(brief!.title).toContain('Ulaştırılamayan belge');
    expect(staffNotificationBrief({ kind: 'yeni_personel_turu', payload: {} })).toBeNull();
  });
});
