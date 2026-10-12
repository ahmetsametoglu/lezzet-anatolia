import { describe, expect, it } from 'vitest';
import type { NotifyChannel, NotifyResult } from '@lezzet/notify';
import type { OrderNotification } from '@lezzet/types';
import { sendDoorCodeNotice, type DoorCodeNoticeSend } from './door-code-notice';

/*
  Bu testler şu hatalarda kırmızıya döner: kod cihaz bildirimine ya da uygulama içi satıra sızar, WhatsApp gitmeyince e-postaya
  düşülmez, gönderilen kanal yanlış yazılır ya da zaten işlenmiş olayda kod ikinci kez gider. Veritabanına dokunmaz.
*/

/** Akış bildirimden yalnız kodu ekleyip geçirir; öteki alanlar bu testin konusu değil. */
const data = { referenceNo: 'LZA-1234' } as OrderNotification;
const code = '482913';

/** Tek kanallı gönderimde cevabı kanal adına göre, cihaz gönderiminde `device` anahtarıyla verir. */
function sender(answers: Partial<Record<NotifyChannel | 'device', NotifyResult>>) {
  const calls: Parameters<DoorCodeNoticeSend>[0][] = [];
  const send: DoorCodeNoticeSend = async (input) => {
    calls.push(input);
    const key = input.channels.length === 1 ? input.channels[0]! : 'device';
    return [answers[key] ?? { status: 'skipped', channel: input.channels[0]!, reason: 'no_reachable_channel' }];
  };
  return { calls, send };
}

describe('sendDoorCodeNotice', () => {
  it('cihaz bildirimi ve uygulama içi satır kodsuz gider; kod WhatsApp\'tan gider ve kanal yazılır', async () => {
    const { calls, send } = sender({ whatsapp_api: { status: 'sent', channel: 'whatsapp_api', ref: 'wamid.1' } });

    const notice = await sendDoorCodeNotice({ data, code, reach: { whatsapp: true, email: true } }, send);

    expect(notice.sentVia).toBe('whatsapp');
    expect(calls[0]).toMatchObject({ channels: ['push', 'web_push'], inApp: true });
    expect(calls[0]!.data.deliveryCode).toBeUndefined();
    expect(calls[1]).toMatchObject({ channels: ['whatsapp_api'], inApp: false, data: { deliveryCode: code } });
    expect(calls).toHaveLength(2);
  });

  it('WhatsApp gitmezse kod e-postaya düşer', async () => {
    const { calls, send } = sender({
      whatsapp_api: { status: 'error', channel: 'whatsapp_api', error: 'meta_132001: şablon yok' },
      email: { status: 'sent', channel: 'email', ref: 'mail-1' },
    });

    const notice = await sendDoorCodeNotice({ data, code, reach: { whatsapp: true, email: true } }, send);

    expect(notice.sentVia).toBe('email');
    expect(calls.map((call) => call.channels)).toEqual([['push', 'web_push'], ['whatsapp_api'], ['email']]);
    expect(calls[2]!.data.deliveryCode).toBe(code);
  });

  it('WhatsApp numarası yoksa kod doğrudan e-postayla gider; ikisi de yoksa gönderilemez', async () => {
    const mail = sender({ email: { status: 'sent', channel: 'email', ref: 'mail-1' } });
    expect((await sendDoorCodeNotice({ data, code, reach: { whatsapp: false, email: true } }, mail.send)).sentVia).toBe('email');
    expect(mail.calls.map((call) => call.channels)).toEqual([['push', 'web_push'], ['email']]);

    const none = sender({});
    expect((await sendDoorCodeNotice({ data, code, reach: { whatsapp: false, email: false } }, none.send)).sentVia).toBeNull();
    expect(none.calls).toHaveLength(1);
  });

  it('zaten işlenmiş olayda kod ikinci kez gitmez', async () => {
    const { calls, send } = sender({ device: { status: 'skipped', channel: 'email', reason: 'duplicate' } });

    expect((await sendDoorCodeNotice({ data, code, reach: { whatsapp: true, email: true } }, send)).sentVia).toBeNull();
    expect(calls).toHaveLength(1);
  });
});
