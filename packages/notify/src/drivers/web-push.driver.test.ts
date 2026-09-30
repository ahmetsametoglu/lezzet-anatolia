import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import type { TicketNotification } from '@lezzet/types';
import type { NotifyRecipient } from '../types';
import { webPushDriver } from './web-push.driver';

const data: TicketNotification = {
  ticketId: '00000000-0000-4000-8000-000000000001',
  subject: 'Test',
  type: 'question',
  status: 'open',
  customerName: 'Ayşe',
  locale: 'tr',
  orderReferenceNo: null,
  openedOn: '01.01.2026',
  history: [],
  previousStatus: null,
  ticketUrl: 'https://example.test/t',
  notificationPreferencesUrl: 'https://example.test/p',
};

const subscription = (id: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: 'p', auth: 'a' } });
const alici: NotifyRecipient = { name: null, email: null, phone: null, locale: 'tr', webPush: [subscription('canli'), subscription('silinmis')] };

describe('webPushDriver', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY = 'acik';
    process.env.WEB_PUSH_PRIVATE_KEY = 'gizli';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('service worker adresi olayın sayfasından alır; 410 dönen abonelik silinmek üzere bildirilir', async () => {
    const bodies: string[] = [];
    const sender = (async (sub: webpush.PushSubscription, body?: string | Buffer | null) => {
      bodies.push(String(body));
      if (sub.endpoint.endsWith('silinmis')) throw new webpush.WebPushError('gone', 410, {}, '', sub.endpoint);
      return { statusCode: 201, body: '', headers: {} };
    }) as typeof webpush.sendNotification;

    const sonuc = await webPushDriver({ sender }).send('ticket_replied', alici, data);

    expect(sonuc).toEqual({ status: 'sent', channel: 'web_push', ref: null, gone: ['https://fcm.googleapis.com/fcm/send/silinmis'] });
    expect(JSON.parse(bodies[0]!)).toMatchObject({ url: 'https://example.test/t' });
  });

  it('başlık ve gövde dağıtım kapısının verdiği metindir; marka adı başlıkta tekrarlanmaz', async () => {
    const bodies: string[] = [];
    const sender = (async (_sub: webpush.PushSubscription, body?: string | Buffer | null) => {
      bodies.push(String(body));
      return { statusCode: 201, body: '', headers: {} };
    }) as typeof webpush.sendNotification;

    const pushText = { title: 'Réponse à votre demande', body: 'Vous avez reçu une réponse à votre demande.' };
    await webPushDriver({ sender }).send('ticket_replied', { ...alici, webPush: [subscription('canli')], pushText }, data);

    expect(JSON.parse(bodies[0]!)).toMatchObject(pushText);
  });

  it('kısmi kabulde silinmeyen hata sonuçta kalır: taşıyıcı ve kod yazılır, abonenin adresi yazılmaz', async () => {
    const apple = { endpoint: 'https://web.push.apple.com/QGizliAbone', keys: { p256dh: 'p', auth: 'a' } };
    const sender = (async (sub: webpush.PushSubscription) => {
      if (sub.endpoint === apple.endpoint) throw new webpush.WebPushError('Received unexpected response code', 403, {}, '{"reason":"BadJwtToken"}', sub.endpoint);
      return { statusCode: 201, body: '', headers: {} };
    }) as typeof webpush.sendNotification;

    const sonuc = await webPushDriver({ sender }).send('ticket_replied', { ...alici, webPush: [subscription('canli'), apple] }, data);

    expect(sonuc).toMatchObject({ status: 'sent', gone: [] });
    const partial = sonuc.status === 'sent' ? sonuc.partial : undefined;
    expect(partial).toContain('1/2 web.push.apple.com 403');
    expect(partial).toContain('BadJwtToken');
    expect(partial).not.toContain('QGizliAbone');
  });

  it('anahtar yoksa sürücü yeteneksizdir, HABER sıradaki kanala düşer', () => {
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    expect(webPushDriver().supports('ticket_replied', alici)).toBe(false);
  });
});
