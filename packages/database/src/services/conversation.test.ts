import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { ConversationInboxService, ConversationService, CustomerInboxService, MessageService } from './conversation.service';
import { UserProfileService } from './user-profile.service';

// Dört değişmez: bir kişi bir konuşma, mevcut bağ ezilmez, kimliksiz konuşma geçerlidir, pencereyi yalnız gelen mesaj açar.
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

/** Anlarla karşılaştırılır, dizeyle değil: PostgREST `…+00:00`, JS `…000Z` yazar ve dize karşılaştırması sıralamada da yanılırdı. */
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
    expect(row.optInAskedAt).toBeNull();

    const verildi = await conversations.setOptIn(row.id, true);
    expect(verildi.optIn).toBe(true);
    expect(verildi.optInAt).not.toBeNull();
    expect(verildi.optInAskedAt).not.toBeNull();
  });

  it('RET de iz bırakır — "reddetti" ile "hiç sorulmadı" ayırt edilebilmeli (15.12)', async () => {
    const row = await konusmaAc(numara());
    const reddetti = await conversations.setOptIn(row.id, false);

    expect(reddetti.optIn).toBe(false);
    expect(reddetti.optInAskedAt).not.toBeNull(); // asıl iddia: ret iz bırakır
    expect(reddetti.optInAt).toBeNull(); // izin verilmedi, izin damgası da yok
  });

  it('İZİN DAMGASI geri alınınca SİLİNMEZ — "o gün izni vardı" sonradan da sorulabilmeli', async () => {
    // İspat yükü bizde (GDPR md. 7/1): `optIn` bugünkü hâli, `optInAt` bir kez yaşanmış olayı söyler.
    const row = await konusmaAc(numara());
    const verildi = await conversations.setOptIn(row.id, true);
    const damga = verildi.optInAt;

    const geriAlindi = await conversations.setOptIn(row.id, false);
    expect(geriAlindi.optIn).toBe(false);
    expect(geriAlindi.optInAt).toBe(damga);
  });

  it('`markOptInAsked` İLK anı korur — ikinci tur damgayı ileri itmez', async () => {
    // İtseydi "ne zaman sorduk" her turda tazelenir ve ajanın susma kuralı hiç devreye girmezdi.
    const row = await konusmaAc(numara());
    const ilk = await conversations.markOptInAsked(row.id);
    expect(ilk?.optInAskedAt).not.toBeNull();

    const ikinci = await conversations.markOptInAsked(row.id);
    expect(ikinci).toBeNull(); // koşullu yazım: dolu alan ezilmiyor
    expect((await conversations.getById(row.id))?.optInAskedAt).toBe(ilk?.optInAskedAt);
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
 * `open()` konuşmayı açarken korur, bu kapılar var olan satırı günceller: aynı güvence ikinci yolda da sınanmalı. Kaybedenin
 * `null` alması merkezde: sessiz ezme, yanlış hesaba bağlanmış sohbet demektir.
 */
describe('yalnız boşsa yazan kapılar', () => {
  it('linkCustomer BOŞ bağı doldurur', async () => {
    const ref = numara();
    const konusma = await konusmaAc(ref);
    const musteri = await profiles.insert({ name: `Bağ kapısı ${stamp}`, phone: numara() });
    profileIds.push(musteri.id);

    const sonuc = await conversations.linkCustomer(konusma.id, { customerId: musteri.id, linkedBy: null, proof: 'email' });
    expect(sonuc?.customerId).toBe(musteri.id);
    // Bağ ve künyesi tek yazımda: damgasız bağ "kim, neye dayanarak" sorusunu cevapsız bırakırdı.
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
    // Messenger/Instagram webhook'u ad taşımaz; ad Graph'tan gelip bu kapıdan yazılır.
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
    // Giden mesaj `windowExpiresAt` taşımıyor: pencere olduğu gibi kalır, ileri kaymaz.
    expect(an((await conversations.getById(konusma.id))?.windowExpiresAt)).toBe(bitis);
  });

  it('pencere GERİ GİTMEZ — geç düşen eski mesaj hâlâ ücretsiz olan aralığı kapatamaz', async () => {
    // Webhook'lar ne sıralı gelir ne tek kez denenir: `coalesce` ile yeniden denenen eski mesaj pencereyi kısaltır ve ücretsiz aralıkta kalıp ücreti ödetirdi.
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
    // Kategori yazılmadan geçen mesaj için "ne ödedik" hiçbir zaman cevaplanamaz.
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

// Kuyruk küresel: sayfada yalnız kendi kişimiz aranır, sayı sayılmaz.
describe('müşteri bazlı gelen kutusu (15.38)', () => {
  const kutu = new CustomerInboxService(db);

  async function musteriAc(ad: string) {
    const musteri = await profiles.insert({ name: `${ad} ${stamp}` });
    profileIds.push(musteri.id);
    return musteri;
  }

  async function sosyalAc(source: 'messenger' | 'instagram', customerId: string | null) {
    sira += 1;
    const row = await conversations.open({ source, externalRef: `PSID-KUTU-${stamp}-${sira}`, customerId });
    conversationIds.push(row.id);
    return row;
  }

  const gelen = (conversationId: string, text: string) => messages.record({ conversationId, direction: 'inbound', body: { text } });

  it('aynı müşterinin kanalları TEK satırdır — yüzü en son yazdığı sohbet, kanal dizisi ikisi', async () => {
    const musteri = await musteriAc('Kutu iki kanal');
    const wa = await konusmaAc(numara(), musteri.id);
    const ig = await sosyalAc('instagram', musteri.id);
    await gelen(wa.id, 'önce WhatsApp');
    await gelen(ig.id, 'sonra Instagram');

    const satir = await kutu.rowOf(musteri.id);
    expect(satir).toMatchObject({ id: ig.id, source: 'instagram', customerId: musteri.id, lastMessageText: 'sonra Instagram' });
    expect(satir?.threads.map((t) => t.id)).toEqual([ig.id, wa.id]);
    expect([...(satir?.sources ?? [])].sort()).toEqual(['instagram', 'whatsapp']);

    // Kuyrukta da bir kez: kanal süzgeci kişiyi bulur, satır yine iki kanalı taşır.
    const sayfa = await kutu.list({ source: 'whatsapp' });
    expect(sayfa.rows.filter((r) => r.personKey === musteri.id).map((r) => r.id)).toEqual([ig.id]);
  });

  it('kimliksiz sohbet kendi başına bir kişidir — başka satırla birleştirilmez', async () => {
    const ms = await sosyalAc('messenger', null);
    await gelen(ms.id, 'kimliksiz');

    const satir = await kutu.rowOf(ms.id);
    expect(satir?.customerId).toBeNull();
    expect(satir?.threads).toEqual([{ id: ms.id, source: 'messenger', messageCount: 1, awaitingReply: true }]);
  });

  it('cevap bekleyiş KİŞİNİN — baş sohbet cevaplanmış olsa da öteki kanalda top bizdeyse bekliyor', async () => {
    const musteri = await musteriAc('Kutu bekleyiş');
    const ig = await sosyalAc('instagram', musteri.id);
    const wa = await konusmaAc(numara(), musteri.id);
    await gelen(ig.id, 'Instagram’dan soru');
    await gelen(wa.id, 'WhatsApp’tan soru');
    await messages.record({ conversationId: wa.id, direction: 'outbound', body: { text: 'WhatsApp’a cevap' } });

    const sayfa = await kutu.list({ awaitingReply: true });
    const satir = sayfa.rows.find((r) => r.personKey === musteri.id);
    expect(satir).toMatchObject({ id: wa.id, awaitingReply: false, awaitingAny: true });
    expect(satir?.threads.find((t) => t.id === ig.id)?.awaitingReply).toBe(true);
  });

  it('mesajsız sohbet kanal sayılmaz; müşterinin hiç yazmadığı kişinin ekseni kuyruğun sonudur', async () => {
    const musteri = await musteriAc('Kutu sessiz');
    const wa = await konusmaAc(numara(), musteri.id);

    const satir = await kutu.rowOf(musteri.id);
    expect(satir?.sources).toEqual([]);
    expect(satir?.threads).toEqual([{ id: wa.id, source: 'whatsapp', messageCount: 0, awaitingReply: false }]);
    // Boş eksen imleci kuramaz ve PostgREST'in azalan sırası onu BAŞA alırdı (görünümün künyesi).
    expect(satir?.inboxAt).toBe('-infinity');
  });
});

// Kuyruk küresel: yalnız kendi satırımız ve baştaki satırın ekseni sınanır, sayı sayılmaz.
describe('sohbet kuyruğunun ekseni', () => {
  const kuyruk = new ConversationInboxService(db);

  it('hiç yazılmamış sohbet kuyruğun SONUNDA — başa düşmez, sayfanın imleci kurulur', async () => {
    const sessiz = await konusmaAc(numara());
    const yazan = await konusmaAc(numara());
    await messages.record({ conversationId: yazan.id, direction: 'inbound', body: { text: 'merhaba' } });

    expect((await kuyruk.getById(sessiz.id))?.inboxAt).toBe('-infinity');
    // Az önce gelen mesajı olan bir sohbet var: tek satırlık ilk sayfa boş eksenli bir satırla başlayamaz.
    const ilk = await kuyruk.list({}, undefined, 1);
    expect(ilk.rows[0]?.inboxAt).not.toBe('-infinity');
    expect(ilk.nextCursor).not.toBeNull();
  });
});
