import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, CustomerPhoneService, MessageService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { SERVICE_WINDOW_HOURS } from '@lezzet/domain-core';
import type { Conversation, ConversationSource } from '@lezzet/types';
import { handleMetaWebhook } from './meta-webhook';

/**
 * Meta webhook AYRIŞTIRMASI (15.7 · test dalgası 15.18) — imzadan SONRAKİ yol.
 *
 * İmza ayrı dosyada sınanıyor (`meta-signature.test.ts`, DB'siz); buradaki soru başka: **doğrulanmış
 * bir gövde doğru okunuyor mu?**
 *
 * ── NEDEN BU DOSYA VAR: AYRIŞTIRMA HATASI ÇÖKMEZ, YANLIŞ CEVAP VERİR ─────────
 * Yanlış alanı okuyan kod hiçbir istisna atmaz. Damga biriminin karıştığı bir kod pencereyi 1970'e
 * kurar ve ekran "kapalı" der; echo'nun tarafları ters okunduğunda bütün müşteriler tek sohbette
 * birleşir; `wa_id`'yi '+'sız normalize eden kod aynı müşteriye her mesajda YENİ konuşma açar.
 * Üçü de yeşil bir koşuda sessizce yaşar — tuzak, kapalı olduğu ancak sınanarak bilinen yerdir.
 *
 * ── GÖVDELER UYDURULMAMIŞ ───────────────────────────────────────────────────
 * Şekiller `scripts/meta-smoke.ts` ile aynı kaynaktan: 22.08 canlı turunda gerçek Meta trafiğinden
 * ölçüldü. Duman script'i bu gövdeleri **uç noktadan** geçiriyor (imza + HTTP dahil) ve bir dev
 * sunucusu ister; bu dosya aynı gövdeleri **işleyiciye doğrudan** veriyor, yani her koşuda ve
 * sunucusuz. İkisi aynı şeyi iki farklı yükseklikten çiviliyor.
 *
 * ── PAYLAŞILAN DB DİSİPLİNİ (`CLAUDE §4b`) ──────────────────────────────────
 * Bütün kimlikler damgalı: telefon, PSID, IGSID ve olay kimlikleri. Küresel sayıya bakan tek iddia
 * yok — sayımlar bu dosyanın kendi konuşmalarından okunuyor. Olay kayıtları da toplanıyor
 * (`webhookEventIds`): kalan bir olay, bir sonraki koşuda aynı kimliği "zaten işlendi" yapardı.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);
const phones = new CustomerPhoneService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();

/** Kimlikler DAMGALI: aynı numara/PSID iki koşuda paylaşılırsa ikinci koşu birincinin defterini okur. */
const WA_PERSON = `336${String(stamp).slice(-8)}`; // '+' YOK — Meta da böyle gönderir
/* Damga testinin KENDİ numarası. Sebebi RPC'de yazılı: pencere `greatest(window_expires_at, …)`
   ile güncelleniyor — yani asla geri gitmez. Paylaşılan konuşmada "iki saat önce gelen mesaj"
   penceresi, daha önceki bir iddianın açtığı pencerenin altında kalır ve iddia YANLIŞ sebeple
   kırılırdı. Taze konuşmada `greatest(null, x) = x`. */
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

/** Olay kimliği ÜRETİLİRKEN temizlik listesine yazılır: elle eklenen bir liste bir gün eksik kalır. */
function eventId(prefix: string, n: number): string {
  const id = `${prefix}.TEST${stamp}${n}`;
  webhookEventIds.push(id);
  return id;
}

// ── Gövde üreticileri — `meta-smoke.ts` ile aynı şekiller ────────────────────

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
              // Damga SANİYE — Meta'nın WhatsApp gövdesinde dize olarak gelir.
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

/** Konuşmayı bul + temizlik listesine yaz. Bulunamazsa iddia orada kırılsın diye `null` döner. */
async function konusma(source: ConversationSource, ref: string): Promise<Conversation | null> {
  const row = await conversations.findByExternalRef(source, ref);
  if (row && !conversationIds.includes(row.id)) conversationIds.push(row.id);
  return row;
}

const SAAT = 3_600_000;

/* Ad çözümü SUSTURULUR: `fetchMetaProfileName` jeton yoksa `null` döner ve ağa hiç çıkmaz (kendi
   künyesi). Jeton dolu bir ortamda her Messenger iddiası Meta'ya GERÇEK bir istek atardı — testin
   sağlayıcıya bağımlı olması tam da bu dosyanın kaçındığı şey. Süreç değişkeni de küresel bir
   satırdır: okunur, değiştirilir, GERİ KONUR (`CLAUDE §4b`). */
const jetonYedegi = process.env.META_PAGE_ACCESS_TOKEN;

beforeAll(() => {
  delete process.env.META_PAGE_ACCESS_TOKEN;
});

afterAll(async () => {
  // Taslak müşteri: WhatsApp yolu kimliği çözerken açıyor (`findOrCreateCustomer`, asDraft).
  // Kimliğe KANIT DEFTERİNDEN gidiliyor (04.10) — `user_profiles.phone` artık anahtar değil ve
  // tekil de değil, yani oradan aramak birden çok satıra çıkabilirdi.
  for (const telefon of [WA_PERSON, WA_TIME_PERSON]) {
    const kanit = await phones.findActive(`+${telefon}`);
    if (kanit) profileIds.push(kanit.customerId);
  }
  await purgeTestData(db, { conversationIds, profileIds, webhookEventIds });
  if (jetonYedegi !== undefined) process.env.META_PAGE_ACCESS_TOKEN = jetonYedegi;
});

describe('WhatsApp — üç tuzak tek gövdede', () => {
  it('`wa_id` "+"SIZ gelir: konuşma TEK ülke koduyla açılır', async () => {
    // Ham `wa_id`'yi doğrudan normalize eden kod '+33' + '33…' üretir ve aynı müşteriye her
    // mesajda YENİ konuşma açar; ekranda iki ayrı kişi gibi görünür.
    const sonuc = await handleMetaWebhook(
      whatsappBody({ id: eventId('wamid', 1), type: 'text', text: { body: 'Cuma için baklava var mı?' } }),
    );
    expect(sonuc).toEqual({ status: 'ok', written: 1, duplicates: 0, ignored: 0 });

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    expect(konu?.externalRef).toBe(`+${WA_PERSON}`);
    expect(konu?.externalRef.startsWith('+3333')).toBe(false);
    // Sağlayıcı hesabı da yazılır: cevabın hangi numaradan gideceğinin anahtarı (15.11).
    expect(konu?.providerAccountRef).toBe(WA_ACCOUNT);
    // WhatsApp adı GÖVDEDE gelir (Messenger/IG'de gelmez) — ikinci bir Graph turu israf olurdu.
    expect(konu?.profileName).toBe('Ayrıştırma Testi');
  });

  it('damga SANİYEDİR: pencere mesajın anından başlar, 1970\'ten değil', async () => {
    // Saniyeyi milisaniye sanan kod 1755900000 → 1970-01-21 yapar; pencere doğduğu an KAPALI
    // görünür, operatör serbest metin yazamaz ve şablon ücreti ödenir. Hiçbir istisna atılmaz.
    const anSaniye = Math.floor((Date.now() - 2 * SAAT) / 1000);
    await handleMetaWebhook(
      whatsappBody(
        { id: eventId('wamid', 2), type: 'text', text: { body: 'iki saat önce yazdım' } },
        { timestamp: String(anSaniye), person: WA_TIME_PERSON },
      ),
    );

    const konu = await konusma('whatsapp', `+${WA_TIME_PERSON}`);
    const bitis = new Date(konu!.windowExpiresAt!).getTime();
    // Pencere = mesajın KENDİ anı + 24 saat. "Şimdi"den hesaplayan kod burada iki saat şişerdi.
    expect(Math.abs(bitis - (anSaniye * 1000 + SERVICE_WINDOW_HOURS * SAAT))).toBeLessThan(2000);
  });

  it('metinsiz tür KAYBOLMAZ — ses `media` kovasına, ham yapısıyla düşer', async () => {
    // Enum dar ve bilinçli. "Tanımadığım tipi atla" diyen bir kod, müşterinin sesli mesajını
    // deftere hiç yazmaz ve operatör bir mesajın geldiğini bile bilmez.
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
    // Ham yük de saklanır: başlık okunur yüzdür, `payload` seçimin kendisidir (hangi düğme kimliği).
    expect(satir?.body.text).toBe('Evet, sipariş vereceğim');
    expect(satir?.body.payload).toMatchObject({ interactive: { type: 'button_reply' } });
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
    /* Defter yarısı (mesaj durumu kolonu) hâlâ 15.11'in işi; buradaki okuma KİMLİK yarısı (04.10).
       Taşıyıcının "ulaşamadım" beyanı bir tahmin değil ve 3 aylık sessizliği beklemeye gerek yok —
       ama tetik ölçülemezse motorun o dalı hiç çalışmaz. Bu test o ölçümün var olduğunu çiviliyor. */
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
                // `recipient_id` '+'SIZ gelir — gelen mesaj yolundaki normalize kuralının aynısı.
                statuses: [{ id: 'wamid.F1', status: 'failed', recipient_id: telefon.slice(1) }],
              },
            },
          ],
        },
      ],
    });
    expect((await phones.findActive(telefon))?.deliveryFailedAt).not.toBeNull();

    // Başarılı teslim BEYANI ÇÜRÜTÜR: bayat damga her dönüşte gereksiz bir kimlik sorusu doğururdu.
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
    // Teslim/okundu izleme defterde YOK (15.11'in işi). Bunu "hata" saymak Meta'ya 500 döndürür ve
    // aynı teslimat 7 gün boyunca yeniden denenirdi — hiçbir zaman işlenemeyecek bir olay için.
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
    // WhatsApp saniye, buradaki milisaniye. Aynı sayıyı iki kanalda aynı sanan kod, Messenger
    // penceresini 55 bin yıl İLERİYE kurar — "her zaman açık" der ve kural hiç uygulanmaz.
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
    // PSID telefon taşımaz: kimlik çözümü DENENMEZ, konuşma kimliksiz doğar (15.16).
    expect(konu?.customerId).toBeNull();
    expect(konu?.providerAccountRef).toBe(PAGE_ACCOUNT);
    expect(Math.abs(new Date(konu!.windowExpiresAt!).getTime() - (anMs + SERVICE_WINDOW_HOURS * SAAT))).toBeLessThan(2000);
  });

  it('ECHO\'da taraflar TERSTİR: kişi `recipient.id` — ve mesaj GİDEN yazılır', async () => {
    // Ters okuyan kod konuşmayı SAYFA kimliğiyle açar: herkesin yazışması tek sohbette birleşir ve
    // operatör iki müşteriyi aynı ekranda görür. Üstelik satır "gelen" olarak yazılırdı — kendi
    // cevabımız müşteriden gelmiş gibi görünürdü.
    const id = eventId('m_echo', 1);
    await handleMetaWebhook(
      messengerBody('page', {
        sender: { id: PAGE_ACCOUNT }, // sayfa
        recipient: { id: FB_ECHO_PERSON }, // KİŞİ
        message: { mid: id, text: 'Merhaba, 1 kg 12,90 €.', is_echo: true },
      }),
    );

    expect(await conversations.findByExternalRef('messenger', PAGE_ACCOUNT)).toBeNull();
    const konu = await konusma('messenger', FB_ECHO_PERSON);
    const satir = (await messages.listByConversation(konu!.id)).find((m) => m.providerMessageId === id);
    expect(satir?.direction).toBe('outbound');
    // Giden mesaj pencere AÇMAZ: bu sohbete müşteri hiç yazmadı, yalnız biz yazdık.
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
    // Tekillik ölçütü ÇİFTTİR (`source, external_ref`): aynı anahtar başka kanalda başka konuşmadır.
    expect(await conversations.findByExternalRef('messenger', IG_PERSON)).toBeNull();
  });

  it('postback `interactive` yazılır ve KENDİ mid\'i olmadığı hâlde tekrarı yakalanır', async () => {
    // Claim anahtarı teslimatla değişmeyen alanlardan türetiliyor. Türetme timestamp'i içermeseydi
    // iki AYRI tıklama tek olay sayılırdı; hiç içermeseydi tekrar teslimat defteri çiftlerdi.
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

  it('okundu/teslim zarfı defter olayı DEĞİLDİR — sayılır, geçilir', async () => {
    const sonuc = await handleMetaWebhook(
      messengerBody('page', { sender: { id: FB_PERSON }, recipient: { id: PAGE_ACCOUNT }, read: { watermark: Date.now() } }),
    );
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });
});

describe('zarf: tekrar teslimat ve tanınmayan yapı', () => {
  it('AYNI olay iki kez düşerse defter ÇİFTLEMEZ', async () => {
    // Meta teslim edemediği webhook'u 7 gün boyunca yeniden gönderir — ve bir POST birden çok mesaj
    // taşıyabilir, yani teslimat düzeyinde idempotency yetmez; sahiplenme MESAJ düzeyindedir.
    const id = eventId('wamid', 5);
    const govde = whatsappBody({ id, type: 'text', text: { body: 'tekrar teslim sınaması' } });

    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 1, duplicates: 0 });
    expect(await handleMetaWebhook(govde)).toMatchObject({ written: 0, duplicates: 1 });

    const konu = await konusma('whatsapp', `+${WA_PERSON}`);
    expect((await messages.listByConversation(konu!.id)).filter((m) => m.providerMessageId === id)).toHaveLength(1);
  });

  it('abone olunmamış obje YOK SAYILIR — hata değil', async () => {
    // Hata deseydik Meta 500 alır ve asla işleyemeyeceğimiz bir olayı 7 gün boyunca yeniden
    // gönderirdi. Tanımadığımız bir şeyi tekrar almak hiçbir işe yaramaz.
    const sonuc = await handleMetaWebhook({ object: 'threads', entry: [{ id: 'X', messaging: [] }] });
    expect(sonuc).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });

  it('gövde hiç tanınmıyorsa PATLAMAZ, sayılır', async () => {
    // Kabuk bu cevabı 200'e çevirir. Fırlatan bir ayrıştırıcı, bozuk tek bir teslimat yüzünden
    // kuyruğu kilitlerdi.
    expect(await handleMetaWebhook(null)).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
    expect(await handleMetaWebhook({ object: 'page' })).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
    expect(await handleMetaWebhook({ entry: [] })).toEqual({ status: 'ok', written: 0, duplicates: 0, ignored: 1 });
  });

  it('kimliksiz mesaj (id ya da from yok) yazılmaz — sahiplenme anahtarı olmayan olay tekrarı yakalanamaz', async () => {
    const sonuc = await handleMetaWebhook(whatsappBody({ type: 'text', text: { body: 'kimliksiz' } }));
    expect(sonuc).toMatchObject({ written: 0, ignored: 1 });
  });
});
