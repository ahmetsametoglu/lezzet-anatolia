import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, MessageService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { ACCOUNT_LINK_LINE, CART_LINK_LINE, LINK_BUTTON_TITLE, withCartLink } from '../cart/link-text';
import { recordInboundMessage } from './record';
import {
  sendOutboundMessage,
  unconfiguredSender,
  type MessageSender,
  type SendMessageInput,
  type SendResult,
  type SendTarget,
} from './send';

// Dört değişmez, dördü de sessiz arızaya karşı: düşen gönderim deftere yazılmaz, başarılı gönderim sağlayıcı kimliğiyle yazılır,
// kapalı pencerede serbest metin reddedilir, `refused` ile `failed` ayrı döner.
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

/** Çağrıları kaydeden sahte: "gönderildi mi" ile "kaç kez" ayrı sorular. */
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

/** Pencereyi yalnız gelen mesaj açar. */
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

/** Damgayı geçmişe koymak meşru: RPC `greatest` kullandığı için var olan pencere kısaltılamaz, tek yol gelen mesajı eski anla yazmak. */
async function kapaliKonusma(source: 'whatsapp' | 'messenger', gunOnce: number) {
  const externalRef = source === 'whatsapp' ? numara() : `PSID-${stamp}-${(sira += 1)}`;
  const row = await conversations.open({
    source,
    externalRef,
    customerId: null,
    providerAccountRef: 'ACC-TEST',
    profileName: null,
  });
  conversationIds.push(row.id);
  await recordInboundMessage(db, {
    conversationId: row.id,
    text: 'merhaba',
    receivedAt: new Date(Date.now() - gunOnce * 24 * 60 * 60 * 1000).toISOString(),
  });
  return row;
}

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
    // "Kapandı" ile "hiç açılmadı" ayrı sebepler: operatöre önerilecek eylem farklı.
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

describe('insan-temsilci penceresi — kapalı 24 saatten sonra 7 gün (28.08 · CHANNELS §3b)', () => {
  it('MESSENGER: pencere kapalı ama 7 gün içinde → gider ve ETİKETLİ gider', async () => {
    // Müşteri cuma yazar, cevap pazartesi yazılır: bu dal olmadan operatörün cevabı "gönderilemedi" diye dönerdi.
    const konusma = await kapaliKonusma('messenger', 2);
    const sender = fakeSender({ ok: true, providerMessageId: 'm_HA1' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'Pazartesi cevabı' });

    expect(sonuc.status).toBe('sent');
    expect(sender.calls).toHaveLength(1);
    // Bayrak sürücüye ulaşmalı: etiketsiz giden mesajı Meta reddeder.
    expect(sender.calls[0]!.target.humanAgent).toBe(true);
  });

  it('WHATSAPP: aynı süre geçmişken REDDEDİLİR — orada çare etiket değil, ücretli şablon', async () => {
    // WhatsApp'ta etiket kavramı yok: istek sağlayıcıda düşer ve sebebi bizde okunamazdı.
    const konusma = await kapaliKonusma('whatsapp', 2);
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'merhaba' });

    expect(sonuc).toEqual({ status: 'refused', reason: 'window_closed' });
    expect(sender.calls).toHaveLength(0);
  });

  it('MESSENGER: 7 gün de geçmişse reddedilir — sağlayıcıya boşuna gidilmez', async () => {
    const konusma = await kapaliKonusma('messenger', 8);
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'çok geç' });

    expect(sonuc).toEqual({ status: 'refused', reason: 'window_closed' });
    expect(sender.calls).toHaveLength(0);
  });

  it('ÖZERK AJAN etiketi kullanamaz — "human agent" adının gereği', async () => {
    // Meta'nın tanımı insanın elle cevabıdır; otomatik cevaba etiket açmak denetlenen bir beyanı yanlış yapardı. Ajan için doğru
    // davranış devirdir.
    const konusma = await kapaliKonusma('messenger', 2);
    const sender = fakeSender({ ok: true, providerMessageId: 'x' });
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: 'otomatik cevap',
      author: 'ai',
    });

    expect(sonuc).toEqual({ status: 'refused', reason: 'window_closed' });
    expect(sender.calls).toHaveLength(0);
  });

  it('pencere AÇIKKEN etiket KULLANILMAZ — gerekçesi olmayan etiket bahanedir', async () => {
    // Pencere açıkken etiketin dayanağı yok ve Meta kötüye kullanımı denetliyor.
    const konusma = await acikKonusma('messenger');
    const sender = fakeSender({ ok: true, providerMessageId: 'm_OK' });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'hemen cevap' });

    expect(sonuc.status).toBe('sent');
    expect(sender.calls[0]!.target.humanAgent).toBe(false);
  });
});

describe('sendOutboundMessage — gönderim ve defter', () => {
  it('gönderim DÜŞERSE deftere YAZILMAZ ve `failed` döner', async () => {
    const konusma = await acikKonusma();
    const sender = fakeSender({ ok: false, reason: 'rate_limited', retryable: true });
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'gitmeyecek' });

    expect(sonuc).toEqual({ status: 'failed', reason: 'rate_limited', retryable: true });

    // Defterde yalnız gelen mesaj olmalı: gönderilmemiş bir cevabın satırı kalmamalı.
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
    // Kimlik defterde de durmalı: tekrar teslimin son savunma hattı bu kolondur.
    expect(sonuc.message?.providerMessageId).toBe('wamid.OK1');
  });

  it('hedef KONUŞMADAN türer — çağıran kime gideceğini uyduramaz', async () => {
    const konusma = await acikKonusma();
    const sender = fakeSender({ ok: true, providerMessageId: 'wamid.OK2' });
    await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: 'merhaba' });

    // `toEqual` bilerek: hedefe sessizce alan eklenirse satır düşsün ve alanın sürücüye ne söylediği düşünülsün. WhatsApp'ta
    // etiketin hiçbir koşulda `true` olmadığı da burada çivili.
    expect(sender.calls[0]?.target).toEqual({
      source: 'whatsapp',
      externalRef: konusma.externalRef,
      accountRef: 'ACC-TEST',
      humanAgent: false,
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

describe('sepet bağlantısı Messenger/IG\'de DÜĞME olarak gider (08.09, kullanıcı kararı)', () => {
  const URL = 'http://localhost:3000/tr/sepet?link=ABCDEFGH1234';

  /** Girdileri kaydeden sahte: her çağrıya ayrı kimlik verir; `basarisiz` verilen sıradaki çağrı düşer. */
  function kaydedenSender(basarisiz: number | null = null): MessageSender & { inputs: SendMessageInput[] } {
    const inputs: SendMessageInput[] = [];
    // Kimlik gönderici başına ayrışır: sağlayıcı kimliği defterde tekildir ve iki testin aynı kimliği üretmesi ikincinin satırını
    // sessizce düşürürdü.
    const nonce = (sira += 1);
    return {
      name: 'fake',
      inputs,
      send: async (_target, input) => {
        inputs.push(input);
        if (inputs.length === basarisiz) return { ok: false, reason: 'provider_down', retryable: false };
        return { ok: true, providerMessageId: `m_${stamp}_${nonce}_${inputs.length}` };
      },
    };
  }

  it('MESSENGER: gövde metin olarak, bağlantı İKİNCİ mesajda düğme — defterde iki satır, iki kimlik', async () => {
    const konusma = await acikKonusma('messenger');
    const sender = kaydedenSender();
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: withCartLink('Sepetinize 2 baklava ekledim.', { url: URL, purpose: 'cart' }),
      author: 'ai',
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(2);
    // Gövdede ne adres ne sabit satır kalır: ikisi düğmeye taşındı.
    expect(sender.inputs[0]!.text).not.toContain(URL);
    expect(sender.inputs[0]!.text).not.toContain(CART_LINK_LINE);

    const dugme = sender.inputs[1]!;
    expect(dugme.kind).toBe('interactive');
    expect(dugme.author).toBe('ai');
    const sablon = dugme.payload?.interactive as { payload: { template_type: string; buttons: { url: string; title: string }[] } };
    expect(sablon.payload.template_type).toBe('button');
    expect(sablon.payload.buttons[0]!.url).toBe(URL);
    expect(Object.values(LINK_BUTTON_TITLE.cart)).toContain(sablon.payload.buttons[0]!.title);

    // İki satır, iki sağlayıcı kimliği: echo ikisini ayrı düşürecek, ikincisi yeni mesaj sanılmayacak.
    const defter = (await messages.listByConversation(konusma.id)).filter((m) => m.direction === 'outbound');
    expect(defter).toHaveLength(2);
    expect(new Set(defter.map((m) => m.providerMessageId)).size).toBe(2);
    expect(defter[1]!.body.text).toContain(URL);
  });

  it('HESAP bağlantısı da düğmeye döner — cümle ve düğme yazısı amacın, adres aynen (15.16)', async () => {
    const konusma = await acikKonusma('messenger');
    const sender = kaydedenSender();
    const hesapAdresi = 'https://lezzetanatolie.com/fr/compte?link=ABCDEFGH1234';
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: withCartLink('Siparişlerinizi görmek için sohbetinizi hesabınıza bağlayın.', { url: hesapAdresi, purpose: 'account' }),
      author: 'ai',
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(2);
    expect(sender.inputs[0]!.text).not.toContain(ACCOUNT_LINK_LINE);
    const sablon = sender.inputs[1]!.payload?.interactive as { payload: { buttons: { url: string; title: string }[] } };
    expect(sablon.payload.buttons[0]!.url).toBe(hesapAdresi);
    // Müşteri hesap bağlantısında "Sepete git" görmez: düğme yazısı amacın kendi yazısı.
    expect(Object.values(LINK_BUTTON_TITLE.account)).toContain(sablon.payload.buttons[0]!.title);
  });

  it('WHATSAPP: aynı ayrım, düğme `cta_url` etkileşimli mesajı — pencere içinde şablonsuz', async () => {
    const konusma = await acikKonusma('whatsapp');
    const sender = kaydedenSender();
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: withCartLink('Sepetinize 2 baklava ekledim.', { url: URL, purpose: 'cart' }),
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(2);
    expect(sender.inputs[0]!.text).not.toContain(URL);
    const dugme = sender.inputs[1]!.payload?.interactive as { type: string; action: { parameters: { url: string } } };
    expect(dugme.type).toBe('cta_url');
    expect(dugme.action.parameters.url).toBe(URL);
  });

  it('KALIP mesajda ayırma YOK — şablonun gövdesi Meta\'da sabittir', async () => {
    const konusma = await penceresizKonusma();
    const sender = kaydedenSender();
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: `${CART_LINK_LINE}\n${URL}`,
      kind: 'template',
      templateName: 'sepet_hatirlatma',
      templateCategory: 'utility',
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(1);
    expect(sender.inputs[0]!.kind).toBe('template');
  });

  it('yalnız bağlantıdan ibaret metin → TEK mesaj, o da düğme (operatör taslaktan gövdeyi silmiş)', async () => {
    const konusma = await acikKonusma('messenger');
    const sender = kaydedenSender();
    const sonuc = await sendOutboundMessage(db, sender, { conversationId: konusma.id, text: `${CART_LINK_LINE}\n${URL}` });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(1);
    expect(sender.inputs[0]!.kind).toBe('interactive');
  });

  it('düğme DÜŞERSE gövde yine `sent` — cevap gitti, bağlantı gitmedi; iz `error_log`ta, deftere tek satır', async () => {
    // Gövdeyi "gönderilemedi" diye çevirmek yalan olurdu: ajan devreder, operatör aynı cevabı ikinci kez yazardı.
    const konusma = await acikKonusma('messenger');
    const sender = kaydedenSender(2);
    const sonuc = await sendOutboundMessage(db, sender, {
      conversationId: konusma.id,
      text: withCartLink('Sepetinize 2 baklava ekledim.', { url: URL, purpose: 'cart' }),
    });

    expect(sonuc.status).toBe('sent');
    expect(sender.inputs).toHaveLength(2);
    const defter = (await messages.listByConversation(konusma.id)).filter((m) => m.direction === 'outbound');
    expect(defter).toHaveLength(1);
  });
});
