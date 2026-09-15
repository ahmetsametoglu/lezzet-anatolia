import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ConversationService, CustomerPhoneService, MessageService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { SERVICE_WINDOW_HOURS } from '@lezzet/domain-core';
import type { Conversation, ConversationSource } from '@lezzet/types';
import { handleMetaWebhook } from './meta-webhook';

// Ayrıştırma hatası çökmez, yanlış cevap verir: karışan damga birimi pencereyi 1970'e kurar, ters okunan echo herkesi tek sohbette
// birleştirir. Gövdeler canlı Meta trafiğinden ölçülmüş şekillerdir (`scripts/meta-smoke.ts` ile aynı kaynak).
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);
const phones = new CustomerPhoneService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();

/** Kimlikler damgalı: aynı numara iki koşuda paylaşılırsa ikinci koşu birincinin defterini okur. */
const WA_PERSON = `336${String(stamp).slice(-8)}`; // `+` yok, Meta da böyle gönderir
// Damga testinin kendi numarası: pencere `greatest` ile geri gitmez, paylaşılan konuşmada önceki iddianın penceresi bu iddiayı
// yanlış sebeple kırardı.
const WA_TIME_PERSON = `337${String(stamp).slice(-8)}`;
const WA_ACCOUNT = `TEST-WABA-${stamp}`;
const FB_PERSON = `TEST-PSID-${stamp}`;
const FB_ECHO_PERSON = `TEST-PSID-ECHO-${stamp}`;
const IG_PERSON = `TEST-IGSID-${stamp}`;
const PAGE_ACCOUNT = `TEST-PAGE-${stamp}`;
const IG_ACCOUNT = `TEST-IGACC-${stamp}`;

const conversationIds: string[] = [];
const profileIds: string[] = [];
const webhookEventIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];

/** Olay kimliği üretilirken temizlik listesine yazılır: elle eklenen liste bir gün eksik kalır. */
function eventId(prefix: string, n: number): string {
  const id = `${prefix}.TEST${stamp}${n}`;
  webhookEventIds.push(id);
  return id;
}

function whatsappBody(
  message: Record<string, unknown>,
  over: { timestamp?: string; profileName?: string; person?: string } = {},
) {
  const person = over.person ?? WA_PERSON;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WA_ACCOUNT,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1 555-201-5460', phone_number_id: WA_ACCOUNT },
              contacts: [{ profile: { name: over.profileName ?? 'Ayrıştırma Testi' }, wa_id: person }],
              // Damga saniyedir ve dize olarak gelir.
              messages: [{ from: person, timestamp: over.timestamp ?? String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  };
}

function messengerBody(object: 'page' | 'instagram', event: Record<string, unknown>, timestampMs = Date.now()) {
  return {
    object,
    entry: [{ id: object === 'page' ? PAGE_ACCOUNT : IG_ACCOUNT, time: timestampMs, messaging: [{ timestamp: timestampMs, ...event }] }],
  };
}

/** Bulunamazsa `null` döner ki iddia orada kırılsın. */
async function konusma(source: ConversationSource, ref: string): Promise<Conversation | null> {
  const row = await conversations.findByExternalRef(source, ref);
  if (row && !conversationIds.includes(row.id)) conversationIds.push(row.id);
  return row;
}

const SAAT = 3_600_000;

// Ad çözümü susturulur: jeton dolu ortamda her Messenger iddiası Meta'ya gerçek istek atardı. Süreç değişkeni küresel bir satırdır:
// okunur, değiştirilir, geri konur.
const jetonYedegi = process.env.META_PAGE_ACCESS_TOKEN;

beforeAll(() => {
  delete process.env.META_PAGE_ACCESS_TOKEN;
});

afterAll(async () => {
  // WhatsApp yolu taslak müşteri açar; kimliğe kanıt defterinden gidilir, `user_profiles.phone` tekil değil.
  for (const telefon of [WA_PERSON, WA_TIME_PERSON]) {
    const kanit = await phones.findActive(`+${telefon}`);
    if (kanit) profileIds.push(kanit.customerId);
  }
  await purgeTestData(db, { conversationIds, profileIds, webhookEventIds, productIds, categoryIds });
  if (jetonYedegi !== undefined) process.env.META_PAGE_ACCESS_TOKEN = jetonYedegi;
});

describe('WhatsApp — üç tuzak tek gövdede', () => {
  it('`wa_id` "+"SIZ gelir: konuşma TEK ülke koduyla açılır', async () => {
    // Ham `wa_id`'yi doğrudan normalize eden kod aynı müşteriye her mesajda yeni konuşma açardı.
    const sonuc = await handleMetaWebhook(
      whatsappBody({ id: eventId('wamid', 1), type: 'text', text: { body: 'Cuma için baklava var mı?' } }),
    );
    expect(sonuc).toEqual({ status: 'ok', written: 1, duplicates: 0, ignored: 0 });

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    expect(konu?.externalRef).toBe(`+${WA_PERSON}`);
    expect(konu?.externalRef.startsWith('+3333')).toBe(false);
    // Sağlayıcı hesabı da yazılır: cevabın hangi numaradan gideceğinin anahtarı.
    expect(konu?.providerAccountRef).toBe(WA_ACCOUNT);
    // WhatsApp adı gövdede gelir; ikinci bir Graph turu israf olurdu.
    expect(konu?.profileName).toBe('Ayrıştırma Testi');
  });

  it('damga SANİYEDİR: pencere mesajın anından başlar, 1970\'ten değil', async () => {
    // Saniyeyi milisaniye sanan kod pencereyi 1970'e kurar: doğduğu an kapalı görünür ve hiçbir istisna atılmaz.
    const anSaniye = Math.floor((Date.now() - 2 * SAAT) / 1000);
    await handleMetaWebhook(
      whatsappBody(
        { id: eventId('wamid', 2), type: 'text', text: { body: 'iki saat önce yazdım' } },
        { timestamp: String(anSaniye), person: WA_TIME_PERSON },
      ),
    );

    const konu = await konusma('whatsapp', `+${WA_TIME_PERSON}`);
    const bitis = new Date(konu!.windowExpiresAt!).getTime();
    // Pencere = mesajın kendi anı + 24 saat; "şimdi"den hesaplayan kod burada iki saat şişerdi.
    expect(Math.abs(bitis - (anSaniye * 1000 + SERVICE_WINDOW_HOURS * SAAT))).toBeLessThan(2000);
  });

  it('metinsiz tür KAYBOLMAZ — ses `media` kovasına, ham yapısıyla düşer', async () => {
    // "Tanımadığım tipi atla" diyen kod müşterinin sesli mesajını deftere hiç yazmazdı.
    const id = eventId('wamid', 3);
    const sonuc = await handleMetaWebhook(
      whatsappBody({ id, type: 'audio', audio: { id: 'TEST-MEDIA-1', mime_type: 'audio/ogg' } }),
    );
    expect(sonuc).toMatchObject({ written: 1 });

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.kind).toBe('media');
    expect(satir?.body.text).toBeNull();
    expect(satir?.body.payload).toMatchObject({ type: 'audio' });
  });

  it('düğme cevabı `interactive` olur ve METNİ düğmenin başlığıdır', async () => {
    const id = eventId('wamid', 4);
    await handleMetaWebhook(
      whatsappBody({
        id,
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'EVET', title: 'Evet, sipariş vereceğim' } },
      }),
    );

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.kind).toBe('interactive');
    // Başlık okunur yüzdür, `payload` seçimin kendisidir (hangi düğme kimliği).
    expect(satir?.body.text).toBe('Evet, sipariş vereceğim');
    expect(satir?.body.payload).toMatchObject({ interactive: { type: 'button_reply' } });
  });

  it('ürün kartının düğmesi (`sepete_ekle:` kimliği) metne "Sepete ekle — <boy>" olarak düşer (08.09)', async () => {
    // Başlık tek başına "1 kg" olurdu; ajan hangi işlemin istendiğini kimlikten değil metinden okur.
    const id = eventId('wamid', 41);
    await handleMetaWebhook(
      whatsappBody({
        id,
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'sepete_ekle:variant-1', title: '1 kg' } },
      }),
    );
    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.body.text).toBe('Sepete ekle — 1 kg');
  });

  it('karuselin "Boyları gör" düğmesi (`urun_karti:<kod>`) "Ürün kartı — <kod>" metnine düşer (09.09)', async () => {
    const id = eventId('wamid', 42);
    await handleMetaWebhook(
      whatsappBody({
        id,
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'urun_karti:fistikli-baklava', title: 'Boyları gör' } },
      }),
    );
    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.body.text).toBe('Ürün kartı — fistikli-baklava');
  });

  it('karuselin düğmesi GERÇEKTE `type: button` + payload olarak düşüyor (ölçüldü 09.09) — kimlik payload\'dan okunur', async () => {
    // Canlı yük: {"button":{"text":"Boyları gör","payload":"urun_karti:cikolatali-baklava"}}; yalnız başlık yazılsaydı ajan ürünü göremezdi.
    const id = eventId('wamid', 43);
    await handleMetaWebhook(whatsappBody({ id, type: 'button', button: { text: 'Boyları gör', payload: 'urun_karti:cikolatali-baklava' } }));
    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.body.text).toBe('Ürün kartı — cikolatali-baklava');
    expect(satir?.body.payload).toMatchObject({ button: { payload: 'urun_karti:cikolatali-baklava' } });
  });

  it('REACTION defter satırı açmaz — mesaja düşülmüş işaret, mesaj değil', async () => {
    const konuOnce = await konusma('whatsapp', `+${WA_PERSON}`);
    const oncekiSayi = (await messages.listByConversation(konuOnce!.id)).length;

    const sonuc = await handleMetaWebhook(
      whatsappBody({ id: `wamid.TEST${stamp}90`, type: 'reaction', reaction: { message_id: 'wamid.X', emoji: '👍' } }),
    );
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
    expect((await messages.listByConversation(konuOnce!.id)).length).toBe(oncekiSayi);
  });

  it('`failed` statüsü numaranın KİMLİK künyesine yazılır — erken tetiğin yakıtı', async () => {
    // Taşıyıcının "ulaşamadım" beyanı kimlik şüphesinin erken tetiğidir; tetik ölçülemezse motorun o dalı hiç çalışmaz.
    const musteri = await profiles.insert({ name: `Ulaşılamayan ${stamp}` });
    profileIds.push(musteri.id);
    const telefon = `+339${String(stamp).slice(-8)}`;
    await phones.recordProof(musteri.id, telefon);

    await handleMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WA_ACCOUNT,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: WA_ACCOUNT },
                // `recipient_id` `+`sız gelir; gelen mesaj yolundaki normalize kuralının aynısı.
                statuses: [{ id: 'wamid.F1', status: 'failed', recipient_id: telefon.slice(1) }],
              },
            },
          ],
        },
      ],
    });
    expect((await phones.findActive(telefon))?.deliveryFailedAt).not.toBeNull();

    // Başarılı teslim beyanı çürütür: bayat damga her dönüşte gereksiz bir kimlik sorusu doğururdu.
    await handleMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WA_ACCOUNT,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: WA_ACCOUNT },
                statuses: [{ id: 'wamid.F2', status: 'delivered', recipient_id: telefon.slice(1) }],
              },
            },
          ],
        },
      ],
    });
    expect((await phones.findActive(telefon))?.deliveryFailedAt).toBeNull();
  });

  it('yalnız `statuses` taşıyan teslimat SAYILIR ve geçilir — tekrar döngüsüne girmez', async () => {
    // Bunu hata saymak Meta'ya 500 döndürür ve teslimat 7 gün yeniden denenirdi.
    const sonuc = await handleMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: WA_ACCOUNT,
          changes: [
            {
              field: 'messages',
              value: { messaging_product: 'whatsapp', metadata: { phone_number_id: WA_ACCOUNT }, statuses: [{ id: 'wamid.X', status: 'delivered' }] },
            },
          ],
        },
      ],
    });
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });
});

describe('Messenger / Instagram — kişi hangi alanda?', () => {
  it('gelen mesajda kişi `sender.id`dir ve damga MİLİSANİYEDİR', async () => {
    // Aynı sayıyı iki kanalda aynı sanan kod Messenger penceresini 55 bin yıl ileriye kurar ve kural hiç uygulanmaz.
    const anMs = Date.now() - SAAT;
    const sonuc = await handleMetaWebhook(
      messengerBody(
        'page',
        { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, message: { mid: eventId('m_fb', 1), text: 'Cevizli baklava kaç para?' } },
        anMs,
      ),
    );
    expect(sonuc).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    expect(konu?.source).toBe('messenger');
    // PSID telefon taşımaz: kimlik çözümü denenmez, konuşma kimliksiz doğar.
    expect(konu?.customerId).toBeNull();
    expect(konu?.providerAccountRef).toBe(PAGE_ACCOUNT);
    expect(Math.abs(new Date(konu!.windowExpiresAt!).getTime() - (anMs + SERVICE_WINDOW_HOURS * SAAT))).toBeLessThan(2000);
  });

  it('SESLİ EK CDN adresinden indirilir ve zincire girer — Messenger\'ın kör noktası (08.09)', async () => {
    // Messenger sesi medya kimliğiyle değil `attachments[].payload.url` ile verir; sahte fetch CDN'i oynar. Kova yoksa (yerel)
    // indirme denenmez ve iddia ona göre dallanır.
    const cdnUrl = `https://cdn.fbsbx.test/v/t59/${stamp}.mp4?oh=1`;
    const istekler: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      istekler.push(url);
      if (url === cdnUrl) return new Response(new Uint8Array([0, 1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mp4' } });
      return new Response(JSON.stringify({ error: { message: 'kapalı', code: 100 } }), { status: 400, headers: { 'content-type': 'application/json' } });
    };
    const id = eventId('m_fb', 5);
    const sonuc = await handleMetaWebhook(
      messengerBody('page', {
        sender: { id: FB_PERSON },
        recipient: { id: PAGE_ACCOUNT },
        message: { mid: id, attachments: [{ type: 'audio', payload: { url: cdnUrl } }] },
      }),
      { fetchImpl },
    );
    expect(sonuc).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.kind).toBe('media');
    expect(satir?.body.text).toBeNull();
    // Ham liste korunur: ekran ve teşhis Meta'nın kendi şeklini görür.
    expect(satir?.body.payload).toMatchObject({ attachments: [{ type: 'audio' }] });
    if (satir?.mediaKey) {
      expect(istekler).toContain(cdnUrl);
      expect(satir.mediaMime?.startsWith('audio/')).toBe(true);
    } else {
      expect(satir?.mediaMime).toBeNull();
    }
  });

  it('BEĞENİ çıkartması METİN olur (👍), fotoğraf değil — devir tetiklemez (08.09)', async () => {
    // Messenger beğeniyi `sticker_id`li görsel eki olarak yollar; fotoğraf sanılsaydı ajan devrederdi, oysa bu önerinin onayıdır.
    const id = eventId('m_fb', 6);
    const sonuc = await handleMetaWebhook(
      messengerBody('page', {
        sender: { id: FB_PERSON },
        recipient: { id: PAGE_ACCOUNT },
        message: { mid: id, attachments: [{ type: 'image', payload: { url: 'https://cdn.fbsbx.test/sticker.png', sticker_id: 369239263222822 } }] },
      }),
    );
    expect(sonuc).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.kind).toBe('text');
    expect(satir?.body.text).toBe('👍');
    expect(satir?.mediaKey).toBeNull();
    expect(satir?.body.payload).toMatchObject({ attachments: [{ type: 'image' }] });
  });

  it('TEPKİ (message_reactions) müşterinin emojisi olarak yazılır; geri alma yok sayılır (08.09)', async () => {
    // Tepki bir cevaptır, ajan onu son önerinin onayı sayar; `unreact` defter olayı değil.
    const anMs = Date.now();
    const tepki = { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, reaction: { reaction: 'like', emoji: '👍', action: 'react', mid: eventId('m_fb', 1) } };
    webhookEventIds.push(`messenger:${PAGE_ACCOUNT}:${FB_PERSON}:${anMs}:reaction`);
    const sonuc = await handleMetaWebhook(messengerBody('page', tepki, anMs));
    expect(sonuc).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    const satirlar = await messages.listByConversation(konu!.id);
    const satir = satirlar.find((m) => (m.body.payload as { reaction?: { mid?: string } } | null)?.reaction?.mid === eventId('m_fb', 1));
    expect(satir?.kind).toBe('text');
    expect(satir?.direction).toBe('inbound');
    expect(satir?.body.text).toBe('👍');

    const geriAlma = await handleMetaWebhook(
      messengerBody('page', { ...tepki, reaction: { ...tepki.reaction, action: 'unreact' } }, anMs + 1000),
    );
    expect(geriAlma).toMatchObject({ written: 0, ignored: 1 });
  });

  it('ECHO\'da taraflar TERSTİR: kişi `recipient.id` — ve mesaj GİDEN yazılır', async () => {
    // Ters okuyan kod konuşmayı sayfa kimliğiyle açar ve herkesin yazışması tek sohbette birleşir; satır "gelen" yazılır, kendi
    // cevabımız müşteriden gelmiş gibi görünürdü.
    const id = eventId('m_echo', 1);
    await handleMetaWebhook(
      messengerBody('page', {
        sender: { id: PAGE_ACCOUNT }, // sayfa
        recipient: { id: FB_ECHO_PERSON }, // kişi
        message: { mid: id, text: 'Merhaba, 1 kg 12,90 €.', is_echo: true },
      }),
    );

    expect(await conversations.findByExternalRef('messenger', PAGE_ACCOUNT)).toBeNull();
    const konu = await konusma('messenger', FB_ECHO_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.direction).toBe('outbound');
    // Giden mesaj pencere açmaz: bu sohbete müşteri hiç yazmadı, yalnız biz yazdık.
    expect(konu?.windowExpiresAt).toBeNull();
  });

  it('`object=instagram` aynı kapıdan geçer ama AYRI kanal olarak yazılır', async () => {
    await handleMetaWebhook(
      messengerBody('instagram', {
        sender: { id: IG_PERSON },
        recipient: { id: IG_ACCOUNT },
        message: { mid: eventId('m_ig', 1), text: 'Hikâyedeki künefe hâlâ var mı?' },
      }),
    );

    const konu = await konusma('instagram', IG_PERSON);
    expect(konu?.source).toBe('instagram');
    // Tekillik ölçütü çifttir (`source, external_ref`): aynı anahtar başka kanalda başka konuşmadır.
    expect(await conversations.findByExternalRef('messenger', IG_PERSON)).toBeNull();
  });

  it('postback `interactive` yazılır ve KENDİ mid\'i olmadığı hâlde tekrarı yakalanır', async () => {
    // Anahtar timestamp'i içermeseydi iki ayrı tıklama tek olay sayılırdı; hiç türetilmeseydi tekrar teslimat defteri çiftlerdi.
    const anMs = Date.now();
    const govde = messengerBody(
      'page',
      { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, postback: { title: 'Ürüne git', payload: 'TEST_PAYLOAD' } },
      anMs,
    );
    webhookEventIds.push(`messenger:${PAGE_ACCOUNT}:${FB_PERSON}:${anMs}:postback`);

    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 1 });
    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 0, duplicates: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).filter((m) => m.kind === 'interactive');
    expect(satir).toHaveLength(1);
    expect(satir[0]!.body.text).toBe('Ürüne git');
  });

  it('ürün kartının postback\'i (`sepete_ekle:` payload) "Sepete ekle — <boy>" metniyle yazılır (08.09)', async () => {
    const anMs = Date.now() + 1;
    const govde = messengerBody(
      'page',
      { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, postback: { title: '500 g', payload: 'sepete_ekle:variant-2' } },
      anMs,
    );
    webhookEventIds.push(`messenger:${PAGE_ACCOUNT}:${FB_PERSON}:${anMs}:postback`);
    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', FB_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).filter((m) => m.kind === 'interactive');
    expect(satir.map((m) => m.body.text)).toContain('Sepete ekle — 500 g');
  });

  it('düğmenin boy kimliği GERÇEKSE metin ürünü ADIYLA taşır — "Sepete ekle — <ürün> (<boy>)" (10.09)', async () => {
    // Tek boylu kartta düğme yalnız "Sepete ekle" yazar; ürün kimlikte olduğu için veriden çözülüp metne yazılır. Ayrı kişi:
    // yukarıdaki iddialar FB_PERSON sohbetinin satır sayısına bakıyor.
    const kisi = `TEST-PSID-KART-${stamp}`;
    const categoryId = (await new CategoryService(db).create({ name: { tr: `Webhook kartı ${stamp}` } })).id;
    categoryIds.push(categoryId);
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `Kara Orman ${stamp}` },
      categoryId,
      variants: [{ label: { tr: '1 kg' } }],
    });
    productIds.push(product.id);

    const anMs = Date.now() + 2;
    const govde = messengerBody(
      'page',
      { sender: { id: kisi }, recipient: { id: PAGE_ACCOUNT }, postback: { title: 'Sepete ekle', payload: `sepete_ekle:${variants[0]!.id}` } },
      anMs,
    );
    webhookEventIds.push(`messenger:${PAGE_ACCOUNT}:${kisi}:${anMs}:postback`);
    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 1 });

    const konu = await konusma('messenger', kisi);
    const satir = (await messages.listByConversation(konu!.id)).filter((m) => m.kind === 'interactive');
    expect(satir.map((m) => m.body.text)).toEqual([`Sepete ekle — Kara Orman ${stamp} (1 kg)`]);
  });

  it('okundu/teslim zarfı defter olayı DEĞİLDİR — sayılır, geçilir', async () => {
    const sonuc = await handleMetaWebhook(
      messengerBody('page', { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, read: { watermark: Date.now() } }),
    );
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });
});

describe('zarf: tekrar teslimat ve tanınmayan yapı', () => {
  it('AYNI olay iki kez düşerse defter ÇİFTLEMEZ', async () => {
    // Meta teslim edemediği webhook'u 7 gün yeniden gönderir ve bir POST birden çok mesaj taşıyabilir: sahiplenme mesaj düzeyindedir.
    const id = eventId('wamid', 5);
    const govde = whatsappBody({ id, type: 'text', text: { body: 'tekrar teslim sınaması' } });

    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 1, duplicates: 0 });
    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 0, duplicates: 1 });

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    expect((await messages.listByConversation(konu!.id)).filter((m) => m.providerMessageId === id)).toHaveLength(1);
  });

  it('abone olunmamış obje YOK SAYILIR — hata değil', async () => {
    // Hata deseydik Meta 500 alır ve işleyemeyeceğimiz bir olayı 7 gün yeniden gönderirdi.
    const sonuc = await handleMetaWebhook({ object: 'threads', entry: [{ id: 'X', messaging: [] }] });
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });

  it('gövde hiç tanınmıyorsa PATLAMAZ, sayılır', async () => {
    // Fırlatan bir ayrıştırıcı, bozuk tek bir teslimat yüzünden kuyruğu kilitlerdi.
    expect(await handleMetaWebhook(null)).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
    expect(await handleMetaWebhook({ object: 'page' })).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
    expect(await handleMetaWebhook({ entry: [] })).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });

  it('kimliksiz mesaj (id ya da from yok) yazılmaz — sahiplenme anahtarı olmayan olay tekrarı yakalanamaz', async () => {
    const sonuc = await handleMetaWebhook(whatsappBody({ type: 'text', text: { body: 'kimliksiz' } }));
    expect(sonuc).toMatchObject({ written: 0, ignored: 1 });
  });
});
