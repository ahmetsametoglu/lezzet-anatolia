import { describe, expect, it } from 'vitest';
import type { OrderNotification, TicketNotification } from '@lezzet/types';
import { createNotifier } from './notifier';
import { emailDriver } from './drivers/email.driver';
import { waLinkDriver } from './drivers/wa-link.driver';
import { whatsappApiDriver } from './drivers/whatsapp-api.driver';
import type { NotifyEventName, NotifyRecipient } from './types';

/**
 * Soyut bildirim katmanı (14.4). Doğrulanan tek şey: **aynı olay çağrısı, alıcının ulaşılabildiği
 * kanala göre farklı sürücüye düşüyor mu.** Çağıran taraf hiçbir yerde kanal seçmiyor.
 */

const data: OrderNotification = {
  referenceNo: 'LZA-1234',
  orderedOn: '22 Temmuz 2026',
  customerName: 'Ayşe',
  locale: 'tr',
  steps: [],
  lines: [],
  totals: [],
  grandTotal: null,
  paymentNote: null,
  delivery: null,
  tracking: null,
  statusAt: null,
  refund: null,
  paidOnline: false,
  orderUrl: 'https://example.test/orders/LZA-1234',
  deliverySummaryUrl: null,
  supportUrl: 'https://example.test/support',
  notificationPreferencesUrl: 'https://example.test/preferences',
};

const withEmail: NotifyRecipient = { name: 'Ayşe', email: 'ayse@example.test', phone: null, locale: 'tr' };
const withPhone: NotifyRecipient = { name: 'Ayşe', email: null, phone: '+33 6 12 34 56 78', locale: 'tr' };
const unreachable: NotifyRecipient = { name: 'Ayşe', email: null, phone: null, locale: 'tr' };

const drivers = [emailDriver({ brandName: 'Lezzet Anatolia', postalAddress: 'Strasbourg' }), waLinkDriver(), whatsappApiDriver()];

describe('sürücü seçimi — çağıran kanal bilmez', () => {
  it('e-postası olan müşteriye e-posta sürücüsü bakar', async () => {
    const results = await createNotifier(drivers).send('order_confirmed', withEmail, data);

    expect(results).toHaveLength(1);
    expect(results[0]?.channel).toBe('email');
    // Yerelde sağlayıcı anahtarı yok → `skipped`. Bu "başarısız" değil; şablon render edildi,
    // gönderim atlandı. `sent` deseydik anahtarsız ortamda her mail başarılı görünürdü.
    expect(results[0]?.status).toBe('skipped');
  });

  it('yalnız telefonu olan müşteride AYNI çağrı wa.me bağlantısı üretir', async () => {
    const results = await createNotifier(drivers).send('order_out_for_delivery', withPhone, data);

    expect(results[0]?.channel).toBe('wa_link');
    expect(results[0]).toMatchObject({ status: 'sent' });
    const link = results[0]?.status === 'sent' ? results[0].ref : null;
    expect(link).toContain('https://wa.me/33612345678');
    expect(decodeURIComponent(link ?? '')).toContain('LZA-1234');
  });

  it('hiçbir kanal ulaşamıyorsa hata değil, OLGU döner', async () => {
    const results = await createNotifier(drivers).send('order_delivered', unreachable, data);

    expect(results[0]).toMatchObject({ status: 'skipped', reason: 'no_reachable_channel' });
  });

  it('`all` verilince destekleyen HER kanal gönderir', async () => {
    const both: NotifyRecipient = { ...withEmail, phone: '+33 6 12 34 56 78' };

    const results = await createNotifier(drivers).send('order_confirmed', both, data, { all: true });

    expect(results.map((result) => result.channel)).toEqual(['email', 'wa_link']);
  });

  it('varsayılan TEK kanaldır — aynı haber iki kez gitmez', async () => {
    const both: NotifyRecipient = { ...withEmail, phone: '+33 6 12 34 56 78' };

    const results = await createNotifier(drivers).send('order_confirmed', both, data);

    expect(results).toHaveLength(1);
    expect(results[0]?.channel).toBe('email'); // sıralama tercih sırasıdır
  });

  it('WhatsApp API sürücüsü hiçbir olayı üstlenmez (15te dolar)', async () => {
    const only = createNotifier([whatsappApiDriver()]);

    const results = await only.send('order_confirmed', withPhone, data);

    expect(results[0]).toMatchObject({ status: 'skipped', reason: 'no_reachable_channel' });
  });
});

/**
 * Talep bildirimleri (14.7) — sipariş bildirimlerinden farklı VERİ taşırlar ama aynı sözleşmeden
 * geçerler. Sınanan iki şey: kanal seçimi bozulmuyor ve wa.me metni talebin konusunu sızdırmıyor.
 */
describe('talep bildirimleri', () => {
  const ticket: TicketNotification = {
    ticketId: '11111111-1111-1111-1111-111111111111',
    subject: 'Bozuk et geldi',
    type: 'damaged',
    status: 'in_progress',
    customerName: 'Ayşe',
    locale: 'fr',
    orderReferenceNo: 'LZA-1234',
    openedOn: '22 juillet 2026',
    history: [{ sender: 'admin', body: 'Nous avons vérifié le lot.', at: '24 juillet, 10:40', truncated: false, unread: true }],
    previousStatus: null,
    ticketUrl: 'https://example.test/fr/demandes/11111111',
    notificationPreferencesUrl: 'https://example.test/fr/preferences',
  };

  it('e-postası olan müşteriye mail sürücüsü bakar', async () => {
    const results = await createNotifier(drivers).send('ticket_replied', { ...withEmail, locale: 'fr' }, ticket);

    expect(results[0]?.channel).toBe('email');
  });

  it('wa.me metni müşterinin dilinde ve KONUYU taşımaz — önizleme kilit ekranında görünür', async () => {
    const results = await createNotifier(drivers).send('ticket_replied', { ...withPhone, locale: 'fr' }, ticket);

    const link = results[0]?.status === 'sent' ? decodeURIComponent(results[0].ref ?? '') : '';
    expect(link).toContain('Nous avons répondu à votre demande');
    expect(link).not.toContain('Bozuk et geldi');
  });
});

/**
 * SINIF PLANI (14.16 — kurgu incelemesinin 3. ve 7. düzeltmesi): seçim artık olayın sınıfından.
 * Çivilenenler tam olarak incelemenin kırılma senaryoları:
 *   · BELGE: push MAİLİN YERİNE GEÇMEZ — bildirim çubuğundan silinen onay, onay değildir
 *   · BELGE + e-postasız: bugünkü wa_link yedeği korunur, push İLAVE
 *   · HABER: tek kanal ve push kazanır — aynı haberi iki kanaldan almak gürültü
 */
describe('sınıf planı — push geldikten sonra', () => {
  const pushFake = (calls: string[]) =>
    ({
      channel: 'push' as const,
      supports: (event: NotifyEventName, r: NotifyRecipient) => event !== 'ticket_received' && (r.pushTokens?.length ?? 0) > 0,
      send: async () => {
        calls.push('push');
        return { status: 'sent' as const, channel: 'push' as const, ref: 'T1' };
      },
    });

  const jetonluMail: NotifyRecipient = { ...withEmail, pushTokens: ['tok-1'] };
  const jetonluTelefon: NotifyRecipient = { ...withPhone, pushTokens: ['tok-1'] };

  it('BELGE: push + e-posta BİRLİKTE — push yerine geçmez', async () => {
    const calls: string[] = [];
    const results = await createNotifier([pushFake(calls), ...drivers]).send('order_confirmed', jetonluMail, data);

    expect(results.map((r) => r.channel).sort()).toEqual(['email', 'push']);
    expect(calls).toEqual(['push']);
  });

  it('BELGE + e-postasız: wa_link yedeği KORUNUR, push ilave', async () => {
    const results = await createNotifier([pushFake([]), ...drivers]).send('order_confirmed', jetonluTelefon, data);
    expect(results.map((r) => r.channel).sort()).toEqual(['push', 'wa_link']);
  });

  it('HABER: TEK kanal ve push kazanır; jetonsuzda sıra maile düşer', async () => {
    const notifier = createNotifier([pushFake([]), ...drivers]);

    const pushlu = await notifier.send('order_out_for_delivery', jetonluMail, data);
    expect(pushlu.map((r) => r.channel)).toEqual(['push']); // mail GİTMEDİ — aynı haber iki kez gürültü

    const jetonsuz = await notifier.send('order_out_for_delivery', withEmail, data);
    expect(jetonsuz.map((r) => r.channel)).toEqual(['email']);
  });
});
