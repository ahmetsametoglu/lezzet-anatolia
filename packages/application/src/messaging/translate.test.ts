import { afterAll, describe, expect, it } from 'vitest';
import { fakeAiModel, failingAiModel } from '@lezzet/ai/testing';
import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordInboundMessage, recordOutboundMessage } from './record';
import { sendOutboundMessage, type MessageSender, type SendMessageInput, type SendResult } from './send';
import { saveMessageTranslation, translateConversationMessageNow } from './translate';

/**
 * Sohbet çevirisi (15.28) — iki yön, iki an.
 *
 * Çevirinin KALİTESİ burada sınanmaz (modelin işi); sınanan, kaliteden bağımsız değişmezler:
 *   1. Gelen mesaj çevrilince satır dolar ve konuşma müşterinin dilini ÖĞRENİR — yalnız üç dilden
 *      biriyse, yalnız gelen mesajdan.
 *   2. Giden mesaj müşterinin dilinde GİDER; defter gönderileni yazar, Türkçe torbada durur.
 *   3. Çeviri düşerse mesaj GİTMEZ — Türkçeyi Fransız müşteriye göndermek sessiz arızadır.
 *   4. Dil bildirilmiş sistem mesajında model HİÇ çağrılmaz.
 *   5. Kuyruk çözümü gelmemiş sesli mesajı listelemez — transkript sonradan gelir.
 *
 * `fakeAiModel` ağa çıkmaz; sahte sağlayıcı gönderileni KAYDEDER ki "müşteri ne okudu" sorulabilsin.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);

const stamp = Date.now();
const conversationIds: string[] = [];
let sira = 0;

/** Telefon kimlik anahtarıdır: damga + sıra, aynı milisaniyede iki satır çakışmasın. */
function numara(): string {
  sira += 1;
  return `+337${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds });
});

const FR_MUSTERI = JSON.stringify({
  sourceLanguage: 'fr',
  tr: 'Merhaba, siparişim gecikti',
  fr: 'Bonjour, ma commande est en retard',
  de: 'Hallo, meine Bestellung verspätet sich',
});
const TR_CEVAP = JSON.stringify({
  sourceLanguage: 'tr',
  tr: 'Merhaba! Perşembe geliyor.',
  fr: 'Bonjour ! Elle arrive jeudi.',
  de: 'Hallo! Sie kommt am Donnerstag.',
});
const EN_TEK_KELIME = JSON.stringify({ sourceLanguage: 'en', tr: 'tamam', fr: "d'accord", de: 'okay' });

/** Penceresi AÇIK WhatsApp konuşması; dil verilirse konuşmaya yazılır. */
async function konusma(language: 'tr' | 'fr' | 'de' | null = null) {
  const row = await conversations.open({
    source: 'whatsapp',
    externalRef: numara(),
    customerId: null,
    providerAccountRef: 'ACC-TEST',
    profileName: null,
  });
  conversationIds.push(row.id);
  await recordInboundMessage(db, { conversationId: row.id, text: 'merhaba', receivedAt: new Date().toISOString() });
  return language ? conversations.setLanguage(row.id, language) : row;
}

/** Gönderileni KAYDEDEN sahte sağlayıcı — "müşteri ne okudu" sorusu buradan cevaplanır. */
function kaydedenSender(result: SendResult = { ok: true, providerMessageId: `wamid.${stamp}.${(sira += 1)}` }): MessageSender & { sent: SendMessageInput[] } {
  const sent: SendMessageInput[] = [];
  return {
    name: 'fake',
    sent,
    send: async (_target, input) => {
      sent.push(input);
      return result;
    },
  };
}

describe('gelen mesajın çevirisi — dil öğrenme', () => {
  it('Fransızca gelen mesaj çevrilir; satır dolar, konuşma Fransızcayı ÖĞRENİR', async () => {
    const k = await konusma();
    const m = await recordInboundMessage(db, {
      conversationId: k.id,
      text: 'Bonjour, ma commande est en retard',
      receivedAt: new Date().toISOString(),
    });

    expect(await translateConversationMessageNow(db, m, { model: fakeAiModel(FR_MUSTERI) })).toBe(true);

    const yazilan = await messages.getById(m.id);
    expect(yazilan?.language).toBe('fr');
    // Torbada KAYNAK DİL YOK — orijinal satırda duruyor.
    expect(yazilan?.translations).toEqual({ tr: 'Merhaba, siparişim gecikti', de: 'Hallo, meine Bestellung verspätet sich' });
    expect(yazilan?.translatedAt).not.toBeNull();
    expect((await conversations.getById(k.id))?.language).toBe('fr');
  });

  it('sesli mesajda çevrilen şey TRANSKRİPTTİR — alt yazı yok, gövde boş', async () => {
    const k = await konusma();
    const m = await recordInboundMessage(db, {
      conversationId: k.id,
      text: null,
      kind: 'media',
      mediaKey: `messaging/conversations/${k.id}/test.ogg`,
      mediaMime: 'audio/ogg',
      mediaTranscript: 'Bonjour, ma commande est en retard',
      receivedAt: new Date().toISOString(),
    });

    expect(await translateConversationMessageNow(db, m, { model: fakeAiModel(FR_MUSTERI) })).toBe(true);
    expect((await messages.getById(m.id))?.translations?.tr).toBe('Merhaba, siparişim gecikti');
    expect((await conversations.getById(k.id))?.language).toBe('fr');
  });

  it('çevrilecek metni olmayan mesajda hiçbir şey olmaz — model çağrılmaz', async () => {
    const k = await konusma();
    const m = await recordInboundMessage(db, {
      conversationId: k.id,
      text: null,
      kind: 'media',
      mediaMime: 'image/jpeg',
      mediaKey: `messaging/conversations/${k.id}/test.jpg`,
      receivedAt: new Date().toISOString(),
    });
    // Model çağrılsaydı fırlatırdı; sonuç `false` ve satır damgasız (kuyruk da metinsiz görüp damgalar).
    expect(await translateConversationMessageNow(db, m, { model: failingAiModel('çağrılmamalıydı') })).toBe(false);
    expect((await messages.getById(m.id))?.translatedAt).toBeNull();
  });

  it('üç dilden olmayan tespit konuşmanın dilini DEĞİŞTİRMEZ — "ok" İngilizce sayılsa da son bilinen kalır', async () => {
    const k = await konusma('fr');
    const m = await recordInboundMessage(db, { conversationId: k.id, text: 'ok', receivedAt: new Date().toISOString() });

    await translateConversationMessageNow(db, m, { model: fakeAiModel(EN_TEK_KELIME) });

    expect((await messages.getById(m.id))?.language).toBe('en');
    expect((await conversations.getById(k.id))?.language).toBe('fr');
  });

  it('GİDEN mesajın çevirisi dil ÖĞRETMEZ — giden dil bizim kararımızdır, kanıt değil', async () => {
    const k = await konusma();
    const m = await recordOutboundMessage(db, { conversationId: k.id, text: 'Hallo!' });

    await saveMessageTranslation(db, m.id, { language: 'de', translations: { tr: 'Merhaba!', fr: 'Bonjour !' }, translatedAt: new Date().toISOString() });

    expect((await messages.getById(m.id))?.language).toBe('de');
    expect((await conversations.getById(k.id))?.language).toBeNull();
  });

  it('ikinci çeviri birincisini EZMEZ — gelişteki yol ile kuyruk yarışırsa ilk sonuç kalır', async () => {
    const k = await konusma();
    const m = await recordInboundMessage(db, { conversationId: k.id, text: 'Bonjour', receivedAt: new Date().toISOString() });
    const ilk = await saveMessageTranslation(db, m.id, { language: 'fr', translations: { tr: 'Merhaba', de: 'Hallo' }, translatedAt: new Date().toISOString() });
    const ikinci = await saveMessageTranslation(db, m.id, { language: 'fr', translations: { tr: 'Selam', de: 'Hi' }, translatedAt: new Date().toISOString() });

    expect(ilk).not.toBeNull();
    expect(ikinci).toBeNull();
    expect((await messages.getById(m.id))?.translations?.tr).toBe('Merhaba');
  });
});

describe('çeviri kuyruğu — hangi satırlar listelenir', () => {
  it('çözümü gelmemiş SES listelenmez; metin ve çözülmüş ses listelenir', async () => {
    const k = await konusma();
    const at = new Date().toISOString();
    const metin = await recordInboundMessage(db, { conversationId: k.id, text: 'Bonjour', receivedAt: at });
    const cozumsuzSes = await recordInboundMessage(db, {
      conversationId: k.id,
      text: null,
      kind: 'media',
      mediaKey: `messaging/conversations/${k.id}/a.ogg`,
      mediaMime: 'audio/ogg',
      receivedAt: at,
    });
    const cozulmusSes = await recordInboundMessage(db, {
      conversationId: k.id,
      text: null,
      kind: 'media',
      mediaKey: `messaging/conversations/${k.id}/b.ogg`,
      mediaMime: 'audio/ogg',
      mediaTranscript: 'Bonjour',
      receivedAt: at,
    });

    /* Kuyruk küreseldir ve eskiden yeniye sıralı: başka şeritlerin satırları da içindedir, o yüzden
       sayı DEĞİL üyelik ölçülür (`CLAUDE §4b`). Tavan geniş — kuyruk bundan derinse test gürültüyle
       düşer, bu da bir bulgudur (kuyruk ilerlemiyor demektir). */
    const ids = (await messages.listUntranslated(1000)).map((r) => r.id);
    expect(ids).toContain(metin.id);
    expect(ids).toContain(cozulmusSes.id);
    expect(ids).not.toContain(cozumsuzSes.id);
  });
});

describe('giden mesaj — müşterinin dilinde gider', () => {
  it('Fransız müşteriye Fransızca gider; defter GÖNDERİLENİ yazar, Türkçe torbada durur', async () => {
    const k = await konusma('fr');
    const sender = kaydedenSender();

    const sonuc = await sendOutboundMessage(
      db,
      sender,
      { conversationId: k.id, text: 'Merhaba! Perşembe geliyor.', author: 'admin' },
      { model: fakeAiModel(TR_CEVAP) },
    );

    expect(sonuc.status).toBe('sent');
    expect(sender.sent[0]?.text).toBe('Bonjour ! Elle arrive jeudi.');
    const satir = sonuc.status === 'sent' ? sonuc.message : null;
    expect(satir?.body.text).toBe('Bonjour ! Elle arrive jeudi.');
    expect(satir?.language).toBe('fr');
    // Torba = gönderilen dil HARİÇ her şey: yazarın Türkçesi + öteki çeviri.
    expect(satir?.translations).toEqual({ tr: 'Merhaba! Perşembe geliyor.', de: 'Hallo! Sie kommt am Donnerstag.' });
    expect(satir?.translatedAt).not.toBeNull();
    // Giden mesaj dil ÖĞRETMEZ.
    expect((await conversations.getById(k.id))?.language).toBe('fr');
  });

  it('Türk müşteriye Türkçe aynen gider (kaynak = hedef); torba operatör için yine dolar', async () => {
    const k = await konusma('tr');
    const sender = kaydedenSender();

    const sonuc = await sendOutboundMessage(db, sender, { conversationId: k.id, text: 'Merhaba! Perşembe geliyor.' }, { model: fakeAiModel(TR_CEVAP) });

    expect(sender.sent[0]?.text).toBe('Merhaba! Perşembe geliyor.');
    const satir = sonuc.status === 'sent' ? sonuc.message : null;
    expect(satir?.language).toBe('tr');
    expect(satir?.translations).toEqual({ fr: 'Bonjour ! Elle arrive jeudi.', de: 'Hallo! Sie kommt am Donnerstag.' });
  });

  it('dil bilinmiyorsa PİYASA VARSAYILANI (fr) — müşteri hiç yazmadıysa Fransızca gider', async () => {
    const k = await konusma();
    const sender = kaydedenSender();

    await sendOutboundMessage(db, sender, { conversationId: k.id, text: 'Merhaba! Perşembe geliyor.' }, { model: fakeAiModel(TR_CEVAP) });

    expect(sender.sent[0]?.text).toBe('Bonjour ! Elle arrive jeudi.');
  });

  it('dil BİLDİRİLMİŞ ve hedefle aynıysa model HİÇ çağrılmaz — sistem mesajı olduğu gibi gider', async () => {
    const k = await konusma('de');
    const sender = kaydedenSender();

    const sonuc = await sendOutboundMessage(
      db,
      sender,
      { conversationId: k.id, text: 'Ihr Sicherheitscode: 123456', language: 'de' },
      // Çağrılsaydı fırlatır ve gönderim `translation_failed` olurdu.
      { model: failingAiModel('çağrılmamalıydı') },
    );

    expect(sonuc.status).toBe('sent');
    expect(sender.sent[0]?.text).toBe('Ihr Sicherheitscode: 123456');
    const satir = sonuc.status === 'sent' ? sonuc.message : null;
    expect(satir?.language).toBe('de');
    expect(satir?.translations).toBeNull();
    // Damgalı: kuyruk bir daha bakmasın.
    expect(satir?.translatedAt).not.toBeNull();
  });

  it('çeviri DÜŞERSE mesaj GİTMEZ ve deftere yazılmaz — sebep bizim tarafta, yeniden denenebilir', async () => {
    const k = await konusma('fr');
    const sender = kaydedenSender();
    const onceki = (await messages.listByConversation(k.id)).length;

    const sonuc = await sendOutboundMessage(db, sender, { conversationId: k.id, text: 'Merhaba!' }, { model: failingAiModel('sağlayıcı düştü') });

    expect(sonuc).toEqual({ status: 'failed', reason: 'translation_failed', retryable: true });
    expect(sender.sent).toHaveLength(0);
    expect((await messages.listByConversation(k.id)).length).toBe(onceki);
  });

  it('KALIP mesaj çeviriden geçmez — Meta onayladığı metni kendi dilinde gönderir', async () => {
    const k = await konusma('fr');
    const sender = kaydedenSender();

    const sonuc = await sendOutboundMessage(
      db,
      sender,
      { conversationId: k.id, text: 'order_confirmed', templateName: 'order_confirmed', templateCategory: 'utility', templateLanguage: 'fr' },
      { model: failingAiModel('çağrılmamalıydı') },
    );

    expect(sonuc.status).toBe('sent');
    expect(sender.sent[0]?.text).toBe('order_confirmed');
  });
});
