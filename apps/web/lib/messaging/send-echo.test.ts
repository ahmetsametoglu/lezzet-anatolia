import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { metaCloudSender, recordInboundMessage, sendOutboundMessage } from '@lezzet/application';
import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { handleMetaWebhook } from './meta-webhook';

/**
 * **GÖNDER → DEFTERE YAZ → ECHO GERİ DÜŞ** (15.11 · 24.08) — zincirin iki ucu bir arada.
 *
 * ── NEDEN BU TEST, VE NEDEN ANCAK ŞİMDİ YAZILABİLDİ ─────────────────────────
 * Messenger/Instagram'da sayfadan giden HER mesaj bize `message_echoes` olarak geri düşer. Yani
 * kendi gönderdiğimiz mesaj birkaç saniye sonra webhook'tan geri gelir. Soru şu: **aynı mesaj
 * deftere iki kez mi yazılır?**
 *
 * Bu yarış bugüne kadar hiç kurulamamıştı çünkü iki yarısı da eksikti: gönderim kanalı yoktu
 * (Meta kısıtı) ve echo'yu tetikleyecek gerçek bir gönderim yapılamıyordu. **Sahte Meta** ikisini
 * birden mümkün kıldı: gönderim sahte sağlayıcıya gider, dönen sağlayıcı kimliği alınır ve AYNI
 * kimlikle gerçek webhook işleyicisine echo düşürülür.
 *
 * ── SINANAN ŞEY BİR SAYI DEĞİL, BİR SONUÇ ───────────────────────────────────
 * Çift yazımın bedeli görünür: operatör kendi cevabını sohbette iki kez görür ve "gönderilmiş mi,
 * yoksa iki kez mi gitti" sorusunun cevabı defterden okunamaz hâle gelir.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);

const stamp = Date.now();
const conversationIds: string[] = [];
const webhookEventIds: string[] = [];
const PSID = `PSID-ECHO-${stamp}`;
const PAGE = `PAGE-ECHO-${stamp}`;

let conversationId = '';

/** Meta'nın echo zarfı — sender SAYFA, recipient KİŞİ (ters okuyan kod herkesi tek sohbette birleştirir). */
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
  // Pencereyi GELEN mesaj açar (ADR-005) — gönderim kapısı kapalı pencerede serbest metni reddeder.
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

    // Sağlayıcıya GERÇEKTEN gitti: kapı "gönderdim" deyip atlamıyor.
    expect(meta.calls).toHaveLength(1);
    expect(meta.calls[0]!.body).toMatchObject({ recipient: { id: PSID }, messaging_type: 'RESPONSE' });

    const satir = (await messages.listByConversation(conversationId)).find(
      (m) => m.providerMessageId === sonuc.providerMessageId,
    );
    expect(satir?.direction).toBe('outbound');
    // Kimlik olmadan echo ayırt edilemez — bu alanın dolu olması aşağıdaki iddianın ön şartı.
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
    // ASIL İDDİA: aynı sağlayıcı kimliğiyle TEK satır.
    expect(sonrakiSatirlar.filter((m) => m.providerMessageId === mid)).toHaveLength(1);
    expect(sonrakiSatirlar.length).toBe(oncekiSayi);

    /* Webhook'un CEVABI da önemli: bu bir hata DEĞİL, bilinen bir tekrardır. `status: 'error'`
       dönerse kabuk 500 verir ve Meta aynı echo'yu 7 gün boyunca yeniden gönderir — hiçbir zaman
       başarılı olamayacak bir olayı. Kuyruk şişer, `error_log` dolar ve kimse sebebini aramaz. */
    expect(webhook.status).toBe('ok');
  });
});
