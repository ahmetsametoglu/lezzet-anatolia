import { describe, expect, it } from 'vitest';
import type { OrderNotification } from '@lezzet/types';
import { createNotifier } from './notifier';
import { emailDriver } from './drivers/email.driver';
import { waLinkDriver } from './drivers/wa-link.driver';
import { whatsappApiDriver } from './drivers/whatsapp-api.driver';
import type { NotifyRecipient } from './types';

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
