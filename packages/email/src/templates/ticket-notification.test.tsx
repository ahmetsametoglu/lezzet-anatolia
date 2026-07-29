import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import type { PreferredLanguage, TicketNotification } from '@lezzet/types';
import {
  TicketRepliedEmail,
  TicketStatusChangedEmail,
  ticketRepliedSubject,
  ticketStatusChangedSubject,
} from './ticket-notification';

/**
 * Talep e-postaları (14.7). Sınanan dört şey: **metin müşterinin dilinde çıkıyor**, **cevabın tam
 * metni mailde**, **çözülen talepte "yine yazabilirsin" daveti var**, **kapalı ile yeniden açılan
 * ayırt ediliyor**.
 */

const base: TicketNotification = {
  ticketId: '11111111-1111-1111-1111-111111111111',
  subject: null,
  type: 'missing',
  status: 'in_progress',
  customerName: 'Ayşe Kaya',
  locale: 'tr',
  orderReferenceNo: 'LZA-1234',
  openedOn: '22 Temmuz 2026',
  replyBody: 'Eksik gönderilen kalemi tespit ettik.\nBedeli iade edildi; 3-5 iş günü içinde hesabınızda görünür.',
  repliedAt: '24 Temmuz, 10:40',
  previousStatus: null,
  ticketUrl: 'https://example.test/tr/talepler/11111111',
  notificationPreferencesUrl: 'https://example.test/tr/tercihler',
};

const props = { brandName: 'Lezzet Anatolia', postalAddress: 'Lezzet Anatolia · Strasbourg' };

function html(data: TicketNotification, kind: 'replied' | 'status' = 'replied'): Promise<string> {
  const element = kind === 'replied' ? TicketRepliedEmail({ data, ...props }) : TicketStatusChangedEmail({ data, ...props });
  return render(element);
}

describe('cevap maili', () => {
  it('personelin cevabı TAM metniyle mailde — müşteri okumak için tıklamak zorunda değil', async () => {
    const output = await html(base);

    expect(output).toContain('Eksik gönderilen kalemi tespit ettik.');
    expect(output).toContain('3-5 iş günü içinde hesabınızda görünür.');
  });

  it('başlık yoksa künye tip etiketine düşer — boş bir satır gösterilmez', async () => {
    expect(await html(base)).toContain('Eksik ürün');
    expect(await html({ ...base, subject: 'Kargo hasarlı geldi' })).toContain('Kargo hasarlı geldi');
  });

  it('sipariş bağı künyede görünür — "hangi sipariş" ilk sorudur', async () => {
    expect(await html(base)).toContain('LZA-1234');
    expect(await html({ ...base, orderReferenceNo: null })).not.toContain('LZA-1234');
  });

  it('konu satırı talebi tanıtır', () => {
    expect(ticketRepliedSubject(base)).toBe('Talebinize cevap verdik — Eksik ürün');
  });
});

describe('durum maili', () => {
  it('çözülen talepte "yine yazabilirsin" daveti var — müşteri ikinci talep açmasın', async () => {
    const output = await html({ ...base, status: 'resolved', previousStatus: 'in_progress' }, 'status');

    expect(output).toContain('Sorun devam ediyor mu?');
    expect(ticketStatusChangedSubject({ ...base, status: 'resolved' })).toContain('çözüldü');
  });

  it('yeniden açılan talep çözülenden ayrı anlatılır', async () => {
    const output = await html({ ...base, status: 'open', previousStatus: 'resolved' }, 'status');

    expect(output).toContain('yeniden açıldı');
    // Kapanış daveti YALNIZ kapanmış talepte: açık talepte "yine yazabilirsin" demek anlamsız.
    expect(output).not.toContain('Sorun devam ediyor mu?');
  });

  it('durum mailinde cevap gövdesi gösterilmez — o başka bir olayın konusu', async () => {
    const output = await html({ ...base, status: 'resolved' }, 'status');

    expect(output).not.toContain('Eksik gönderilen kalemi tespit ettik.');
  });
});

describe('dil müşterinin tercihidir', () => {
  const cases: Array<[PreferredLanguage, string, string]> = [
    ['fr', 'Nous avons répondu à votre demande', 'Produit manquant'],
    ['de', 'Wir haben auf Ihre Anfrage geantwortet', 'Fehlender Artikel'],
  ];

  it.each(cases)('%s dilinde gövde ve tip etiketi çevrilir', async (locale, title, typeLabel) => {
    const output = await html({ ...base, locale });

    expect(output).toContain(title);
    expect(output).toContain(typeLabel);
    // Türkçe metin sızmamalı: operasyon yüzeyi Türkçedir, MÜŞTERİYE giden mail değil.
    expect(output).not.toContain('Talebinize cevap verdik');
  });

  it('konu satırı da çevrilir', () => {
    expect(ticketRepliedSubject({ ...base, locale: 'fr' })).toContain('Nous avons répondu');
    expect(ticketStatusChangedSubject({ ...base, locale: 'de', status: 'resolved' })).toContain('gelöst');
  });
});
