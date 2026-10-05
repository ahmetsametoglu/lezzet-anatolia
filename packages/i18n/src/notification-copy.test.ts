import { describe, expect, it } from 'vitest';
import { AppNotificationKindEnum, STAFF_NOTIFICATION_KINDS, type AppNotificationKind } from '@lezzet/types';
import { notificationSentence, notificationTime, notificationTitle, notificationVisual, staffNotificationBrief } from './notification-copy';

/*
  Küme açık (tip bunu zorlayamaz): bilinen her tür üç dilde kendi metnini üretmeli, bilinmeyen tür genel metne düşmeli.
  Liste şemadan türer; elle yazılan liste yeni türü atlar ve o tür sessizce genel metne düşer.
*/

const STAFF: readonly string[] = STAFF_NOTIFICATION_KINDS;
const KNOWN: AppNotificationKind[] = AppNotificationKindEnum.options.filter((kind) => !STAFF.includes(kind));
const LOCALES = ['tr', 'fr', 'de'] as const;
const UNKNOWN = { kind: 'yarin_gelecek_tur', payload: {} };

describe('notificationTitle', () => {
  it('bilinen her müşteri türü, üç dilde, genel başlıktan ayrı kendi başlığını üretir', () => {
    for (const kind of KNOWN) {
      for (const locale of LOCALES) {
        expect(notificationTitle({ kind, payload: { approved: true } }, locale), kind).not.toBe(notificationTitle(UNKNOWN, locale));
      }
    }
    expect(notificationTitle(UNKNOWN, 'tr')).toBe('Yeni bildirim');
  });

  it('kurumsal başvurunun başlığı sonuca göre ayrılır', () => {
    const onay = notificationTitle({ kind: 'b2b_application_result', payload: { approved: true } }, 'tr');
    const sonuc = notificationTitle({ kind: 'b2b_application_result', payload: { approved: false } }, 'tr');
    expect(onay).toContain('onaylandı');
    expect(onay).not.toBe(sonuc);
  });
});

describe('notificationSentence', () => {
  it('bilinen her müşteri türü, üç dilde, genel cümleden ayrı kendi cümlesini üretir', () => {
    for (const kind of KNOWN) {
      for (const locale of LOCALES) {
        const cumle = notificationSentence({ kind, payload: { referenceNo: 'LA-26-TEST', postalCode: '67000', approved: true } }, locale);
        expect(cumle, kind).not.toBe(notificationSentence(UNKNOWN, locale));
      }
    }
  });

  it('referans cümleye girer; yokluğu cümleyi bozmaz', () => {
    expect(notificationSentence({ kind: 'order_confirmed', payload: { referenceNo: 'LA-26-X1' } }, 'tr')).toContain('LA-26-X1');
    // '—' sunucunun "referans henüz yok" değeri — cümleye sızmaz.
    expect(notificationSentence({ kind: 'order_confirmed', payload: { referenceNo: '—' } }, 'tr')).not.toContain('—');
    expect(notificationSentence({ kind: 'order_confirmed', payload: {} }, 'tr')).toContain('alındı');
  });

  // Talep cevabı hangi talep olduğunu söylemezse ya da müşterinin konusunu taşırsa kırmızıya döner.
  it('talep cevabı sipariş numarasıyla, siparişsiz talepte türüyle, ikisi de yoksa genel cümleyle kurulur', () => {
    const reply = (payload: Record<string, unknown>) => notificationSentence({ kind: 'ticket_replied', payload }, 'fr');
    expect(reply({ referenceNo: 'LA-26-7WT4XJ', ticketType: 'damaged' })).toBe('Commande LA-26-7WT4XJ — nous vous avons répondu.');
    expect(reply({ referenceNo: null, ticketType: 'damaged' })).toBe('Produit abîmé — nous vous avons répondu.');
    expect(reply({})).toBe('Vous avez reçu une réponse à votre demande.');
  });

  it('BİLİNMEYEN tür genel cümleye düşer — kind kümesi sunucuda büyür', () => {
    const cumle = notificationSentence({ kind: 'yarin_gelecek_tur', payload: {} }, 'tr');
    expect(cumle).toBe('Hesabınızla ilgili bir gelişme var.');
  });
});

describe('notificationVisual', () => {
  it('bilinen her müşteri türü zilden ayrı kendi görselini taşır — "bir bakışta tip" sözleşmesi', () => {
    for (const kind of KNOWN) {
      const visual = notificationVisual({ kind, payload: { approved: true } });
      // Zil bilinmeyen türün işaretidir.
      expect(visual.symbol, kind).not.toBe('bell');
      expect(['positive', 'attention', 'issue', 'neutral']).toContain(visual.tone);
      for (const locale of LOCALES) expect(visual.label(locale).length).toBeGreaterThan(1);
    }
  });

  it('iptal "issue", eksik teslim "attention"; B2B tonu SONUCA göre; bilinmeyen tür zile düşer', () => {
    expect(notificationVisual({ kind: 'order_cancelled', payload: {} }).tone).toBe('issue');
    expect(notificationVisual({ kind: 'order_shortfall', payload: {} }).tone).toBe('attention');
    expect(notificationVisual({ kind: 'b2b_application_result', payload: { approved: true } }).tone).toBe('positive');
    expect(notificationVisual({ kind: 'b2b_application_result', payload: { approved: false } }).tone).toBe('attention');
    const bilinmeyen = notificationVisual({ kind: 'yarin_gelecek_tur', payload: {} });
    expect(bilinmeyen.symbol).toBe('bell');
    expect(bilinmeyen.label('tr')).toBe('Bildirim');
  });
});

// Haftadan eski satır göreli yazılırsa ya da dün sınırı kayarsa bu test kırmızıya döner.
describe('notificationTime', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('haftadan yeni satır tazeliğiyle, eskisi takvim günüyle yazılır', () => {
    expect(notificationTime(ago(30_000), 'tr', now)).toBe('1 dk önce');
    expect(notificationTime(ago(2 * 3_600_000), 'tr', now)).toBe('2 sa önce');
    expect(notificationTime(ago(30 * 3_600_000), 'fr', now)).toBe('hier');
    expect(notificationTime(ago(3 * 86_400_000), 'de', now)).toBe('vor 3 Tagen');
    expect(notificationTime(ago(8 * 86_400_000), 'tr', now)).toBe('27 Eylül');
    expect(notificationTime('2026-07-12T10:00:00Z', 'tr', now)).toBe('12 Temmuz');
    expect(notificationTime('2025-07-12T10:00:00Z', 'fr', now)).toBe('12 juillet 2025');
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

  /* Başlık "ne oldu + hangi kayıt", alt satır "neden" — sebep başlıkta aranmaz. */
  it('ulaştırılamayan belge: alert tonu, başlıkta referans, alt satırda sebep', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: { referenceNo: 'LA-26-X1' } });
    expect(brief).not.toBeNull();
    expect(brief!.tone).toBe('alert');
    expect(brief!.title).toContain('LA-26-X1');
    expect(brief!.subtitle).toContain('e-postası yok');
  });

  it('belge başlığı HANGİ belge olduğunu söyler — aynı siparişin iki olayı ayrı satır okunur', () => {
    const baslik = (event: string) =>
      staffNotificationBrief({ kind: 'document_undeliverable', payload: { event, referenceNo: 'LA-26-X1' } })!.title;
    expect(baslik('order_confirmed')).toContain('sipariş onayı');
    expect(baslik('order_delivered')).toContain('teslim özeti');
    expect(baslik('order_cancelled')).toContain('iptal bildirimi');
    expect(baslik('order_refunded')).toContain('iade bildirimi');
    // İki farklı olay aynı metni üretmemeli: ekranda ayırt edilebilmeli.
    expect(baslik('order_confirmed')).not.toBe(baslik('order_delivered'));
    // Tanınmayan olay başlığı bozmaz: genel "belge" der, satır yine okunur.
    expect(baslik('yarin_gelecek_belge')).toContain('Ulaştırılamayan belge');
  });

  it('şikâyet tipi alt satırda Türkçedir; eşik satırı sayıları taşır; soru "Talep" etiketi alır', () => {
    const sikayet = staffNotificationBrief({ kind: 'ticket_opened', payload: { ticketType: 'damaged', referenceNo: 'LA-26-X1' } });
    expect(sikayet!.label).toBe('Şikâyet');
    expect(sikayet!.title).toContain('LA-26-X1');
    expect(sikayet!.subtitle).toBe('hasarlı ürün');
    const soru = staffNotificationBrief({ kind: 'ticket_opened', payload: { ticketType: 'question' } });
    expect(soru!.label).toBe('Talep');
    const esik = staffNotificationBrief({ kind: 'stock_low', payload: { sku: 'BKL-500', availableQty: 3, minStockQty: 10 } });
    expect(esik!.title).toContain('BKL-500');
    expect(esik!.subtitle).toContain('3/10');
  });

  /* Alt satır uydurmaz: tipi olmayan talebin altına yazacak bir olgu yok. */
  it('alt satır uydurmaz: tipsiz talepte null, tanınmayan tipte de null', () => {
    expect(staffNotificationBrief({ kind: 'ticket_opened', payload: { referenceNo: 'LA-26-X1' } })!.subtitle).toBeNull();
    expect(staffNotificationBrief({ kind: 'ticket_opened', payload: { ticketType: 'yarin_gelecek_tip' } })!.subtitle).toBeNull();
  });

  it('referanssız payload başlığı bozmaz; bilinmeyen türde null — genel metin yüzeyin işi', () => {
    const brief = staffNotificationBrief({ kind: 'document_undeliverable', payload: {} });
    expect(brief!.title).toContain('Ulaştırılamayan belge');
    expect(staffNotificationBrief({ kind: 'yeni_personel_turu', payload: {} })).toBeNull();
  });
});
