import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { ConversationService, MessageService } from './conversation.service';
import { UserProfileService } from './user-profile.service';

/**
 * Konuşma zemini (15.1) — `conversation` + `message` (0039).
 *
 * Sınanan şey dört değişmez:
 *   1. **Bir kişi, bir konuşma** — aynı numara ikinci kez satır açmaz (WhatsApp'ta thread yoktur).
 *   2. **Mevcut kimlik bağı ezilmez** — yeniden bağlama bir birleştirme kararıdır, insana aittir.
 *   3. **Kimliksiz konuşma geçerlidir** — adım 2'de webhook mesajı önce yazar, kimliği sonra çözer.
 *   4. **Pencereyi yalnız gelen mesaj açar** — giden mesaj ücretsiz süreyi uzatamaz.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const messages = new MessageService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const conversationIds: string[] = [];
const profileIds: string[] = [];
let sira = 0;

/** Damga tek başına yetmez: telefon kimlik anahtarıdır ve aynı milisaniyede iki satır çakışır. */
function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

/**
 * Zaman damgası ANLARLA karşılaştırılır, DİZEYLE değil: PostgREST `…+00:00` döndürüyor, JS
 * `…000Z` üretiyor — aynı an, farklı yazım. Dize karşılaştırması burada sessizce yanlış olurdu ve
 * daha kötüsü: sıralamada da yanlış olurdu ('+' < '.' olduğu için eşit an DB tarafında önce gelir.)
 */
const an = (value: string | null | undefined): string | null => (value ? new Date(value).toISOString() : null);

async function konusmaAc(externalRef: string, customerId?: string | null) {
  const row = await conversations.open({ source: 'whatsapp', externalRef, customerId });
  if (!conversationIds.includes(row.id)) conversationIds.push(row.id);
  return row;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('konuşma açılışı', () => {
  it('yeni numara konuşma açar; alanlar zeminin varsayılanlarıyla doğar', async () => {
    const ref = numara();
    const row = await konusmaAc(ref);

    expect(row).toMatchObject({
      source: 'whatsapp',
      externalRef: ref,
      customerId: null,
      optIn: false,
      optInAt: null,
      windowExpiresAt: null,
      lastMessageAt: null,
    });
  });

  it('AYNI numara ikinci kez satır AÇMAZ — WhatsApp\'ta thread yok, her mesaj aynı sohbetin devamı', async () => {
    const ref = numara();
    const ilk = await konusmaAc(ref);
    const ikinci = await konusmaAc(ref);

    expect(ikinci.id).toBe(ilk.id);
  });

  it('kimliksiz açılan konuşma sonradan müşteriye BAĞLANIR — adım 2\'nin sırası bu', async () => {
    const ref = numara();
    const kimliksiz = await konusmaAc(ref);
    expect(kimliksiz.customerId).toBeNull();

    const musteri = await profiles.insert({ name: `WA bağ ${stamp}`, phone: ref });
    profileIds.push(musteri.id);

    const bagli = await konusmaAc(ref, musteri.id);
    expect(bagli.id).toBe(kimliksiz.id);
    expect(bagli.customerId).toBe(musteri.id);
  });

  it('mevcut bağ EZİLMEZ — başka müşteriye kaydırmak bir birleştirme kararıdır (DOMAIN §10)', async () => {
    const ref = numara();
    const sahip = await profiles.insert({ name: `WA sahip ${stamp}`, phone: ref });
    const yabanci = await profiles.insert({ name: `WA yabancı ${stamp}`, phone: numara() });
    profileIds.push(sahip.id, yabanci.id);

    const ilk = await konusmaAc(ref, sahip.id);
    const tekrar = await konusmaAc(ref, yabanci.id);

    expect(tekrar.id).toBe(ilk.id);
    expect(tekrar.customerId).toBe(sahip.id);
  });

  it('izin ve ANI birlikte yazılır — tarihsiz bir izin, izin değildir', async () => {
    const row = await konusmaAc(numara());

    const verildi = await conversations.setOptIn(row.id, true);
    expect(verildi.optIn).toBe(true);
    expect(verildi.optInAt).not.toBeNull();

    const geriAlindi = await conversations.setOptIn(row.id, false);
    expect(geriAlindi.optIn).toBe(false);
    expect(geriAlindi.optInAt).toBeNull();
  });

  it('sağlayıcı anahtarıyla bulunur — gelen mesaj hangi sohbete ait sorusu', async () => {
    const ref = numara();
    const acilan = await konusmaAc(ref);

    expect((await conversations.findByExternalRef('whatsapp', ref))?.id).toBe(acilan.id);
    expect(await conversations.findByExternalRef('whatsapp', `${ref}00`)).toBeNull();
    // Tekillik uzayının adı source: aynı dize başka kaynakta BAŞKA kişidir, bulunamaz.
    expect(await conversations.findByExternalRef('messenger', ref)).toBeNull();
  });
});

/**
 * **YALNIZ BOŞSA YAZAN KAPILAR** (`BaseDbService.updateIfNull` · 15.16 · 15.7 · dalga 1a).
 *
 * `open()`in `coalesce` güvencesi zaten sınanıyor (yukarıda) — bunlar ONDAN AYRI iki kapı ve ayrı
 * bir riski var: `open` bir konuşmayı AÇARKEN korur, bu ikisi ise VAR OLAN satırı günceller. Aynı
 * cümleyi ikinci kez, farklı bir yolda kurmanın bedeli, o yolun bir gün gevşemesidir.
 *
 * Kaybedenin `null` alması testin merkezinde: sessiz bir ezme, yanlış hesaba bağlanmış bir sohbet
 * demektir ve o, bağlanmamış bir sohbetten pahalıdır (`linkCustomer` künyesi).
 */
describe('yalnız boşsa yazan kapılar', () => {
  it('linkCustomer BOŞ bağı doldurur', async () => {
    const ref = numara();
    const konusma = await konusmaAc(ref);
    const musteri = await profiles.insert({ name: `Bağ kapısı ${stamp}`, phone: numara() });
    profileIds.push(musteri.id);

    const sonuc = await conversations.linkCustomer(konusma.id, { customerId: musteri.id, linkedBy: null, proof: 'email' });
    expect(sonuc?.customerId).toBe(musteri.id);
    // Bağ ve KÜNYESİ tek yazımda gider (15.19): damgasız bir bağ, "kim neye dayanarak bağladı"
    // sorusunu cevapsız bırakırdı ve denetlenmek istenen satır tam da o olurdu.
    expect(sonuc?.linkProof).toBe('email');
    expect(sonuc?.linkedAt).not.toBeNull();
  });

  it('linkCustomer DOLU bağı EZMEZ ve `null` döner — kaybeden yarışçı sessiz kalmaz', async () => {
    const ref = numara();
    const sahip = await profiles.insert({ name: `Bağ sahibi ${stamp}`, phone: numara() });
    const yabanci = await profiles.insert({ name: `Bağ yabancı ${stamp}`, phone: numara() });
    profileIds.push(sahip.id, yabanci.id);

    const konusma = await konusmaAc(ref);
    await conversations.linkCustomer(konusma.id, { customerId: sahip.id, linkedBy: null, proof: 'order_ref' });

    // İkinci çağrı `null` DÖNMELİ: `undefined` ya da eski satır dönseydi çağıran "oldu" sanardı.
    const ikinci = await conversations.linkCustomer(konusma.id, { customerId: yabanci.id, linkedBy: null, proof: 'phone' });
    expect(ikinci).toBeNull();

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.customerId).toBe(sahip.id);
  });

  it('setProfileName BOŞ adı doldurur — Messenger/IG başlığının tek kaynağı', async () => {
    // Webhook ad taşımıyor (23.08 canlı ölçümü); ad Graph'tan gelip bu kapıdan yazılıyor.
    const konusma = await konusmaAc(numara());
    expect(konusma.profileName).toBeNull();

    const sonuc = await conversations.setProfileName(konusma.id, 'Ahmet Yılmaz');
    expect(sonuc?.profileName).toBe('Ahmet Yılmaz');
  });

  it('setProfileName DOLU adı EZMEZ — operatörün düzeltmesi her mesajda geri alınamaz', async () => {
    const konusma = await konusmaAc(numara());
    await conversations.setProfileName(konusma.id, 'İlk Ad');

    const ikinci = await conversations.setProfileName(konusma.id, 'Sağlayıcıdan Gelen');
    expect(ikinci).toBeNull();

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.profileName).toBe('İlk Ad');
  });
});

describe('mesaj kaydı', () => {
  it('yön ve tür ile kaydedilir; konuşmanın son hareket damgası aynı turda güncellenir', async () => {
    const konusma = await konusmaAc(numara());

    const mesaj = await messages.record({
      conversationId: konusma.id,
      direction: 'inbound',
      body: { text: 'Merhaba, mantı var mı?' },
    });

    expect(mesaj).toMatchObject({
      conversationId: konusma.id,
      direction: 'inbound',
      kind: 'text',
      templateName: null,
      providerMessageId: null,
    });
    expect(mesaj.body.text).toBe('Merhaba, mantı var mı?');

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.lastMessageAt).toBe(mesaj.createdAt);
  });

  it('pencereyi yalnız GELEN mesaj açar — giden mesaj ücretsiz süreyi uzatamaz', async () => {
    const konusma = await konusmaAc(numara());
    const bitis = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: 'selam' }, windowExpiresAt: bitis });
    expect(an((await conversations.getById(konusma.id))?.windowExpiresAt)).toBe(bitis);

    await messages.record({ conversationId: konusma.id, direction: 'outbound', body: { text: 'buyurun' } });
    // Giden mesaj `windowExpiresAt` taşımıyor → pencere OLDUĞU GİBİ kalır, ileri kaymaz.
    expect(an((await conversations.getById(konusma.id))?.windowExpiresAt)).toBe(bitis);
  });

  it('pencere GERİ GİTMEZ — geç düşen eski mesaj hâlâ ücretsiz olan aralığı kapatamaz', async () => {
    // Sağlayıcı webhook'ları ne sıralı gelir ne tek kez denenir. `coalesce` ile yazılsaydı yeniden
    // denenen eski bir mesaj pencereyi kısaltır, biz de ücretsiz aralıkta şablon ücreti öderdik —
    // ve hiçbir yerde hata görünmezdi.
    const konusma = await konusmaAc(numara());
    const gec = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();
    const erken = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: 'yeni' }, windowExpiresAt: gec });
    await messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: 'geç düşen eski' }, windowExpiresAt: erken });

    expect(an((await conversations.getById(konusma.id))?.windowExpiresAt)).toBe(gec);
  });

  it('metin mesajı METİNSİZ olamaz — kısıt veride, yazan yüzey unutsa bile satır girmez', async () => {
    const konusma = await konusmaAc(numara());
    await expect(
      messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: '   ' } }),
    ).rejects.toThrow();
  });

  it('şablon adı ile tür AYRIŞAMAZ: adsız template ve adlı serbest metin reddedilir', async () => {
    const konusma = await konusmaAc(numara());

    await expect(
      messages.record({ conversationId: konusma.id, direction: 'outbound', kind: 'template', body: { text: 'onay' }, templateCategory: 'utility' }),
    ).rejects.toThrow();
    await expect(
      messages.record({ conversationId: konusma.id, direction: 'outbound', kind: 'text', body: { text: 'onay' }, templateName: 'order_confirm' }),
    ).rejects.toThrow();
  });

  it('şablon KATEGORİSİZ kaydedilemez — faturası okunamayan bir gönderim olurdu', async () => {
    // Kolonu nullable bırakıp "sonra doldururuz" demek, tam da doldurulamayacak olan boyutu boş
    // bırakmaktı: kategori yazılmadan geçen mesaj için "ne ödedik" hiçbir zaman cevaplanamaz.
    const konusma = await konusmaAc(numara());

    await expect(
      messages.record({ conversationId: konusma.id, direction: 'outbound', kind: 'template', body: { text: 'onay' }, templateName: 'order_confirm' }),
    ).rejects.toThrow();
    // Ters yön de yasak: şablon olmayan mesaj ücret sınıfı taşıyamaz.
    await expect(
      messages.record({ conversationId: konusma.id, direction: 'outbound', kind: 'text', body: { text: 'selam' }, templateCategory: 'marketing' }),
    ).rejects.toThrow();
  });

  it('GELEN mesaj template olamaz — template işletme-başlatandır', async () => {
    const konusma = await konusmaAc(numara());
    await expect(
      messages.record({
        conversationId: konusma.id,
        direction: 'inbound',
        kind: 'template',
        body: { text: 'x' },
        templateName: 'order_confirm',
        templateCategory: 'utility',
      }),
    ).rejects.toThrow();
  });

  it('konuşmanın mesajları eskiden yeniye okunur', async () => {
    const konusma = await konusmaAc(numara());
    await messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: 'bir' } });
    await messages.record({ conversationId: konusma.id, direction: 'outbound', body: { text: 'iki' } });
    await messages.record({ conversationId: konusma.id, direction: 'outbound', kind: 'template', body: { text: 'üç' }, templateName: 'order_confirm', templateCategory: 'utility' });

    const liste = await messages.listByConversation(konusma.id);
    expect(liste.map((m) => m.body.text)).toEqual(['bir', 'iki', 'üç']);
    expect(liste.map((m) => m.direction)).toEqual(['inbound', 'outbound', 'outbound']);
    expect(liste[2]!.templateName).toBe('order_confirm');
  });

  it('müşteri silinince konuşması ve mesajları da gider — GDPR kovası 1', async () => {
    const ref = numara();
    const musteri = await profiles.insert({ name: `WA silme ${stamp}`, phone: ref });
    const konusma = await konusmaAc(ref, musteri.id);
    await messages.record({ conversationId: konusma.id, direction: 'inbound', body: { text: 'silinecek' } });

    await db.rpc('anonymize_customer', { p_customer_id: musteri.id });
    profileIds.push(musteri.id);

    expect(await conversations.getById(konusma.id)).toBeNull();
    expect(await messages.listByConversation(konusma.id)).toEqual([]);
  });
});
