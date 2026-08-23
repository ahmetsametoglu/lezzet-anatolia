import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordInboundMessage } from './record';
import { sendOutboundMessage, unconfiguredSender, type MessageSender, type SendResult, type SendTarget } from './send';

/**
 * Giden mesaj kapısı (15.11 · dalga 1a).
 *
 * Sınanan şey dört değişmez ve dördü de **sessiz** arızalara karşı:
 *   1. Gönderim düşerse deftere YAZILMAZ — yoksa operatör cevap verildiğini sanır, müşteri bekler.
 *   2. Gönderim başarılıysa defter satırı sağlayıcı kimliğiyle yazılır — aynı cevap ikinci kez yazılmaz.
 *   3. Pencere kapalıyken serbest metin REDDEDİLİR — sağlayıcı ya reddeder ya şablon ücretiyle geçer.
 *   4. `refused` (bizim kuralımız) ile `failed` (sağlayıcı tarafı) ayrı döner — "yeniden dene"
 *      düğmesi yalnız ikincisine konabilir.
 *
 * Sağlayıcı bir PORT olduğu için testin kendi sahtesi var; ağa çıkılmıyor.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);

const stamp = Date.now();
const conversationIds: string[] = [];
let sira = 0;

/** Damga tek başına yetmez: telefon kimlik anahtarıdır, aynı milisaniyede iki satır çakışır. */
function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds });
});

/** Çağrıları KAYDEDEN sahte sağlayıcı — "gönderildi mi" ve "kaç kez" ayrı sorular. */
function fakeSender(result: SendResult): MessageSender & { calls: { target: SendTarget }[] } {
  const calls: { target: SendTarget }[] = [];
  return {
    name: 'fake',
    calls,
    send: async (target) => {
      calls.push({ target });
      return result;
    },
  };
}

/** Penceresi AÇIK konuşma: pencereyi yalnız gelen mesaj açar (ADR-005). */
async function acikKonusma(source: 'whatsapp' | 'messenger' = 'whatsapp') {
  const externalRef = source === 'whatsapp' ? numara() : `PSID-${stamp}-${(sira += 1)}`;
  const row = await conversations.open({
    source,
    externalRef,
    customerId: null,
    providerAccountRef: 'ACC-TEST',
    profileName: null,
  });
  conversationIds.push(row.id);
  await recordInboundMessage(db, { conversationId: row.id, text: 'merhaba', receivedAt: new Date().toISOString() });
  return row;
}

/** Penceresi HİÇ açılmamış konuşma: gelen mesaj yok, `window_expires_at` boş. */
async function penceresizKonusma() {
  const row = await conversations.open({
    source: 'whatsapp',
    externalRef: numara(),
    customerId: null,
    providerAccountRef: 'ACC-TEST',
    profileName: null,
  });
  conversationIds.push(row.id);
  return row;
}

describe('sendOutboundMessage — reddetme kuralları', () => {
  it('olmayan konuşma reddedilir, sağlayıcıya HİÇ gidilmez', async () => {
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: '00000000-0000-0000-0000-000000000000',
      text: 'merhaba',
    });

    expect(sonuc).toEqual({ status: 'refused', reason: 'conversation_not_found' });
    expect(sender.calls).toHaveLength(0);
  });

  it('pencere HİÇ AÇILMAMIŞSA serbest metin reddedilir — `window_never_opened`', async () => {
    // "Kapandı" ile "hiç açılmadı" aynı reddedişe düşer ama aynı şey değil: biri kaçırılmış fırsat,
    // öteki kurulmamış ilişki. Operatöre önerilecek eylem farklı, o yüzden sebep de farklı.
    const konusma = await penceresizKonusma();
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'merhaba' });

    expect(sonuc).toEqual({ status: 'refused', reason: 'window_never_opened' });
    expect(sender.calls).toHaveLength(0);
  });

  it('KALIP mesaj WhatsApp DIŞINDA reddedilir — sağlayıcıya boşuna gidilmez', async () => {
    const konusma = await acikKonusma('messenger');
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: 'merhaba',
      templateName: 'siparis_onayi',
      templateCategory: 'utility',
    });

    expect(sonuc).toEqual({ status: 'refused', reason: 'template_wrong_channel' });
    expect(sender.calls).toHaveLength(0);
  });

  it('kalıp mesaj pencere KAPALIYKEN bile gidebilir — pencere kuralı serbest metnindir', async () => {
    const konusma = await penceresizKonusma();
    const sender = fakeSender({ ok: true, providerMessageId: 'wamid.T1' });
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: 'Siparişiniz hazırlanıyor.',
      kind: 'template',
      templateName: 'siparis_onayi',
      templateCategory: 'utility',
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.calls).toHaveLength(1);
  });
});

describe('sendOutboundMessage — gönderim ve defter', () => {
  it('gönderim DÜŞERSE deftere YAZILMAZ ve `failed` döner', async () => {
    const konusma = await acikKonusma();
    const sender = fakeSender({ ok: false, reason: 'rate_limited', retryable: true });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'gitmeyecek' });

    expect(sonuc).toEqual({ status: 'failed', reason: 'rate_limited', retryable: true });

    // Defterde YALNIZ gelen mesaj olmalı: gönderilmemiş bir cevabın satırı kalmamalı.
    const defter = await messages.listByConversation(konusma.id);
    expect(defter.filter((m) => m.direction === 'outbound')).toHaveLength(0);
  });

  it('varsayılan sağlayıcı REDDEDER — yapılandırılmadan mesaj gitmez, defter de kirlenmez', async () => {
    const konusma = await acikKonusma();
    const sonuc = await sendOutboundMessage(db, unconfiguredSender, { conversationId: konusma.id, text: 'merhaba' });

    expect(sonuc).toEqual({ status: 'failed', reason: 'not_configured', retryable: false });
    const defter = await messages.listByConversation(konusma.id);
    expect(defter.filter((m) => m.direction === 'outbound')).toHaveLength(0);
  });

  it('başarılı gönderim deftere SAĞLAYICI KİMLİĞİYLE yazılır', async () => {
    const konusma = await acikKonusma();
    const sender = fakeSender({ ok: true, providerMessageId: 'wamid.OK1' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'Merhaba, hazır.' });

    expect(sonuc.status).toBe('sent');
    if (sonuc.status !== 'sent') return;
    expect(sonuc.providerMessageId).toBe('wamid.OK1');
    expect(sonuc.message?.direction).toBe('outbound');
    // Kimlik defterde de durmalı: tekrar teslimin son savunma hattı bu kolondur (0039).
    expect(sonuc.message?.providerMessageId).toBe('wamid.OK1');
  });

  it('hedef KONUŞMADAN türer — çağıran kime gideceğini uyduramaz', async () => {
    const konusma = await acikKonusma();
    const sender = fakeSender({ ok: true, providerMessageId: 'wamid.OK2' });
    await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'merhaba' });

    expect(sender.calls[0]?.target).toEqual({
      source: 'whatsapp',
      externalRef: konusma.externalRef,
      accountRef: 'ACC-TEST',
    });
  });

  it('giden mesaj pencereyi UZATMAZ — ücretsiz süreyi kendi cevabımız açamaz', async () => {
    const konusma = await acikKonusma();
    const once = (await conversations.getById(konusma.id))?.windowExpiresAt;

    const sender = fakeSender({ ok: true, providerMessageId: 'wamid.OK3' });
    await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'cevap' });

    const sonra = (await conversations.getById(konusma.id))?.windowExpiresAt;
    expect(new Date(sonra!).toISOString()).toBe(new Date(once!).toISOString());
  });
});
