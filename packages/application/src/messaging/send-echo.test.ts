import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { metaCloudSender } from './meta-sender';
import { recordInboundMessage } from './record';
import { sendOutboundMessage } from './send';
import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { handleMetaWebhook } from './meta-webhook';

// Sayfadan giden her mesaj bize `message_echoes` olarak geri düşer: aynı mesaj deftere iki kez yazılırsa operatör kendi cevabını iki
// kez görür. Sahte Meta gönderimin kimliğini verir ve aynı kimlikle gerçek işleyiciye echo düşürülür.
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);

const stamp = Date.now();
const conversationIds: string[] = [];
const webhookEventIds: string[] = [];
const PSID = `PSID-ECHO-${stamp}`;
const PAGE = `PAGE-ECHO-${stamp}`;

let conversationId = '';

/** Echo'da sender sayfa, recipient kişidir: ters okuyan kod herkesi tek sohbette birleştirir. */
function echoBody(mid: string) {
  return {
    object: 'page',
    entry: [
      {
        id: PAGE,
        time: Date.now(),
        messaging: [
          {
            timestamp: Date.now(),
            sender: { id: PAGE },
            recipient: { id: PSID },
            message: { mid, text: 'Merhaba, siparişiniz salı günü çıkıyor.', is_echo: true },
          },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  const konusma = await conversations.open({
    source: 'messenger',
    externalRef: PSID,
    customerId: null,
    providerAccountRef: PAGE,
    profileName: null,
  });
  conversationId = konusma.id;
  conversationIds.push(konusma.id);
  // Pencereyi gelen mesaj açar; kapalı pencerede serbest metin reddedilirdi.
  await recordInboundMessage(db, {
    conversationId,
    text: 'Siparişim ne zaman gelir?',
    receivedAt: new Date().toISOString(),
  });
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { conversationIds, webhookEventIds });
});

describe('gönderim → defter', () => {
  it('mesaj sağlayıcıya gider ve defterde SAĞLAYICI KİMLİĞİYLE durur', async () => {
    const meta = fakeMeta();
    const sonuc = await sendOutboundMessage(db, metaCloudSender(fakeCloudApiConfig(meta)), {
      conversationId,
      text: 'Merhaba, siparişiniz salı günü çıkıyor.',
    });

    expect(sonuc.status).toBe('sent');
    if (sonuc.status !== 'sent') return;

    // Sağlayıcıya gerçekten gitti: kapı "gönderdim" deyip atlamıyor.
    expect(meta.calls).toHaveLength(1);
    expect(meta.calls[0]!.body).toMatchObject({ recipient: { id: PSID }, messaging_type: 'RESPONSE' });

    const satir = (await messages.listByConversation(conversationId)).find(
      (m) => m.providerMessageId === sonuc.providerMessageId,
    );
    expect(satir?.direction).toBe('outbound');
    // Kimlik olmadan echo ayırt edilemez: bu alanın dolu olması aşağıdaki iddianın ön şartı.
    expect(sonuc.providerMessageId).toMatch(/^m_/);
  });
});

describe('echo geri düştüğünde defter ÇİFTLEMEZ', () => {
  it('kendi gönderdiğimiz mesajın echo\'su ikinci bir satır açmaz', async () => {
    const meta = fakeMeta();
    const gonderim = await sendOutboundMessage(db, metaCloudSender(fakeCloudApiConfig(meta)), {
      conversationId,
      text: 'Merhaba, siparişiniz salı günü çıkıyor.',
    });
    expect(gonderim.status).toBe('sent');
    if (gonderim.status !== 'sent') return;

    const mid = gonderim.providerMessageId;
    webhookEventIds.push(mid);

    const oncekiSayi = (await messages.listByConversation(conversationId)).length;
    const webhook = await handleMetaWebhook(echoBody(mid));

    const sonrakiSatirlar = await messages.listByConversation(conversationId);
    // Asıl iddia: aynı sağlayıcı kimliğiyle tek satır.
    expect(sonrakiSatirlar.filter((m) => m.providerMessageId === mid)).toHaveLength(1);
    expect(sonrakiSatirlar.length).toBe(oncekiSayi);

    // Bu hata değil bilinen bir tekrar: `error` dönseydi kabuk 500 verir ve Meta aynı echo'yu 7 gün yeniden gönderirdi.
    expect(webhook.status).toBe('ok');
  });
});
