import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeAiModel } from '@lezzet/ai/testing';
import { ConversationService, MessageService, TicketMessageService, TicketService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { ConversationSource } from '@lezzet/types';
import { fakeCloudApiConfig, fakeMeta } from '@lezzet/notify/testing';
import { metaCloudSender } from '../messaging/meta-sender';
import { recordInboundMessage, recordOutboundMessage } from '../messaging/record';
import { unconfiguredSender } from '../messaging/send';
import { generateConversationDraft, runAutonomousConversationReply, runAutonomousTicketReply } from './ai';

/**
 * AI DESTEK ÇEKİRDEĞİNİN ÜÇ DALI (16.5 · 15.13 · test dalgası 15.18).
 *
 * ── MODEL SAHTE, GERİSİ GERÇEK ──────────────────────────────────────────────
 * `fakeAiModel` ağa çıkmaz ve sabit cevap verir; sınanan şey modelin ne yazdığı DEĞİL, çevresindeki
 * kararlar: beyan eklendi mi, devir hangi hâlde tetiklendi, taslak yanlış modda üretiliyor mu.
 * Model verildiğinde araç seti de geçilmiyor (`runOpts` künyesi) — yani bu dosya destek araçlarını
 * tekrar sınamıyor, onların kendi dosyası var.
 *
 * ── EN KRİTİK İDDİA HUKUKİ ──────────────────────────────────────────────────
 * Özerk cevap kendini TANITMAK zorunda (AB Yapay Zekâ Yasası md. 50; Meta mesajlaşma politikası) ve
 * müşteriye insana geçiş yolunu söylemek zorunda. Beyan prompt'a yazılsaydı modelin o günkü hâline
 * bağlı kalırdı; burada deterministik ve testi de o yüzden burada.
 */
const db = serviceDb();
const tickets = new TicketService(db);
const ticketMessages = new TicketMessageService(db);
const conversations = new ConversationService(db);
const messages = new MessageService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const ticketIds: string[] = [];
const conversationIds: string[] = [];
let musteriId = '';

/** Özerk ajanın kararı — şema düz nesne (birlik değil), sahte model onu olduğu gibi döndürüyor. */
const AJAN_CEVABI = JSON.stringify({ action: 'reply', reply: 'Siparişiniz salı günü çıkıyor.', handoffReason: null });
/** `action='reply'` ama metin BOŞ — güvenli taraf devirdir (şemanın künyesi). */
const AJAN_BOS_CEVAP = JSON.stringify({ action: 'reply', reply: '   ', handoffReason: null });
const TASLAK_CEVABI = JSON.stringify({ reply: 'Merhaba! Fıstıklı baklava 225 g pakette.' });

let sira = 0;

/** Her senaryo KENDİ talebini alır: mod ve yazışma geçmişi testler arasında taşınmamalı. */
async function talepAc(mode: 'ai' | 'hybrid' | 'human'): Promise<string> {
  sira += 1;
  const ticket = await tickets.createWithMessage({
    customerId: musteriId,
    source: 'form',
    type: 'question',
    body: `Siparişim ne zaman gelir? (${stamp}-${sira})`,
  });
  ticketIds.push(ticket.id);
  if (mode !== 'human') await tickets.setMode(ticket.id, mode);
  return ticket.id;
}

/**
 * Kimliksiz sosyal sohbet — Messenger'ın olağan hâli (PSID telefon taşımaz).
 *
 * `saatOnce` pencereyi geriye alır: gelen mesaj penceyi AÇAN tek olaydır (ADR-005) ve 24 saatten
 * eski bir damga kapalı pencere demektir. Taze bir mesaj ÖNCE yazılıp sonra eskisi eklenemez —
 * `record_message` pencereyi `greatest(...)` ile hesaplar, yani pencere geriye gitmez.
 */
async function sohbetAc(
  mode: 'ai' | 'hybrid' | 'human',
  opts: { saatOnce?: number; source?: ConversationSource; turSayisi?: number } = {},
): Promise<string> {
  const { saatOnce = 0, source = 'messenger', turSayisi = 1 } = opts;
  sira += 1;
  const konusma = await conversations.open({
    source,
    externalRef: source === 'whatsapp' ? `+3360${String(stamp).slice(-6)}${sira}` : `PSID-AI-${stamp}-${sira}`,
    customerId: null,
    providerAccountRef: 'PAGE-TEST',
    profileName: null,
  });
  conversationIds.push(konusma.id);
  if (mode !== 'human') await conversations.setMode(konusma.id, mode);
  // `turSayisi` müşterinin KAÇ kez yazdığı — izin sorusunun eşiği buna bakıyor (OPT_IN_MIN_TURNS).
  for (let i = 0; i < turSayisi; i += 1) {
    await recordInboundMessage(db, {
      conversationId: konusma.id,
      text: i === 0 ? 'Fıstıklı baklava var mı?' : `Peki kaç paket kaldı? (${i})`,
      receivedAt: new Date(Date.now() - saatOnce * 3_600_000).toISOString(),
    });
  }
  return konusma.id;
}

beforeAll(async () => {
  const musteri = await profiles.insert({ name: `AI çekirdek ${stamp}`, email: `ai-cekirdek-${stamp}@example.test` });
  musteriId = musteri.id;
  profileIds.push(musteriId);
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('özerk cevap KENDİNİ TANITIR — beyan hukuki bir yükümlülük', () => {
  it('İLK özerk cevapta beyan gövdenin BAŞINDA', async () => {
    // Prompt'a yazılsaydı beyan sıcaklığa ve modelin o günkü hâline bağlı kalırdı; burada
    // deterministik ve müşteriye giden metnin ilk cümlesi.
    const ticketId = await talepAc('ai');
    const sonuc = await runAutonomousTicketReply(db, ticketId, { model: fakeAiModel(AJAN_CEVABI) });
    expect(sonuc).toEqual({ status: 'replied' });

    const yazisma = await ticketMessages.listByTicket(ticketId);
    const aiMesaji = yazisma.find((m) => m.sender === 'ai');
    expect(aiMesaji?.body.startsWith('Bu cevabı otomatik asistanımız yazdı')).toBe(true);
    // İkinci yükümlülük: müşteri İNSANA nasıl geçeceğini bilmeli (Meta: "a way to chat with a
    // human agent as needed"). Devir kapısı sistemde vardı ama müşteri onu bilmiyordu.
    expect(aiMesaji?.body).toContain('yetkiliye');
    // Modelin yazdığı metin de gövdede: beyan onun YERİNE geçmiyor, önüne ekleniyor.
    expect(aiMesaji?.body).toContain('Siparişiniz salı günü çıkıyor.');
  });

  it('yazışmada ZATEN AI mesajı varsa beyan TEKRARLANMAZ', async () => {
    // Ölçüt pencere (son N mesaj): aynı yazışmada arka arkaya beyan etmek, cevabı okunmaz bir
    // yasal metne çevirirdi. "Uzun aralık" hâli pencereden düşmektir.
    const ticketId = await talepAc('ai');
    await runAutonomousTicketReply(db, ticketId, { model: fakeAiModel(AJAN_CEVABI) });
    // Müşteri yeniden yazıyor — top yine bizde.
    await tickets.reply({ ticketId, sender: 'customer', body: 'Peki kaçta gelir?' });
    await tickets.setMode(ticketId, 'ai');

    const ikinci = await runAutonomousTicketReply(db, ticketId, { model: fakeAiModel(AJAN_CEVABI) });
    expect(ikinci).toEqual({ status: 'replied' });

    const aiMesajlari = (await ticketMessages.listByTicket(ticketId)).filter((m) => m.sender === 'ai');
    expect(aiMesajlari).toHaveLength(2);
    expect(aiMesajlari[1]!.body.startsWith('Bu cevabı otomatik asistanımız')).toBe(false);
  });

  it('mod `ai` DEĞİLSE ajan susar — `wrong_mode`', async () => {
    // Devir kararı verilmiş bir talepte ajanın konuşması, insanın az önce aldığı kararı ezmekti.
    const ticketId = await talepAc('hybrid');
    const sonuc = await runAutonomousTicketReply(db, ticketId, { model: fakeAiModel(AJAN_CEVABI) });
    expect(sonuc).toEqual({ status: 'skipped', reason: 'wrong_mode' });
    expect((await ticketMessages.listByTicket(ticketId)).some((m) => m.sender === 'ai')).toBe(false);
  });

  it('BOŞ metinli "cevap" kararı DEVİR sayılır ve mod insana iner', async () => {
    // Güvenli taraf daima devir: yanlış cevap geç cevaptan pahalıdır ve geri alınamaz — müşteri
    // okumuştur. Boş bir cevabın müşteriye gitmesi de aynı sınıf hatadır.
    const ticketId = await talepAc('ai');
    const sonuc = await runAutonomousTicketReply(db, ticketId, { model: fakeAiModel(AJAN_BOS_CEVAP) });
    expect(sonuc.status).toBe('handoff');

    expect((await tickets.getById(ticketId))?.handledBy).toBe('human');
    expect((await ticketMessages.listByTicket(ticketId)).some((m) => m.sender === 'ai')).toBe(false);
  });
});

describe('sohbet taslağı — devirdeyken ajan SUSAR (15.13)', () => {
  it('mod `hybrid` DEĞİLSE taslak üretilmez — `wrong_mode`', async () => {
    // 15.13'ün ölçülmemiş yarısı buydu: operatör "insan" dediği anda ajanın gerçekten sustuğu.
    // Sussmazsa operatör kendi yazarken altında bir AI taslağı belirir ve kararı kim verdi belirsizleşir.
    const conversationId = await sohbetAc('human');
    const sonuc = await generateConversationDraft(db, conversationId, { model: fakeAiModel(TASLAK_CEVABI) });
    expect(sonuc).toEqual({ status: 'skipped', reason: 'wrong_mode' });
    expect((await conversations.getById(conversationId))?.aiDraftReply).toBeNull();
  });

  it('hibritte taslak SATIRA yazılır, mesaj olarak DEĞİL', async () => {
    // Defter gönderilmiş gerçeği yazar; onaylanmamış taslak oraya giremez (`conversation` künyesi).
    const conversationId = await sohbetAc('hybrid');
    const sonuc = await generateConversationDraft(db, conversationId, { model: fakeAiModel(TASLAK_CEVABI) });
    expect(sonuc).toEqual({ status: 'generated' });

    const konusma = await conversations.getById(conversationId);
    expect(konusma?.aiDraftReply).toBe('Merhaba! Fıstıklı baklava 225 g pakette.');
    expect(konusma?.aiDraftGeneratedAt).not.toBeNull();
    // Defterde giden mesaj YOK: taslak müşteriye gitmedi.
    expect((await messages.listByConversation(conversationId)).some((m) => m.direction === 'outbound')).toBe(false);
  });

  it('taze taslak varken model YENİDEN çağrılmaz — `cached`', async () => {
    // Aynı soruya ikinci kez para ödenmez. Önbellek anahtarı damga: taslak son mesajdan SONRA
    // üretilmişse hâlâ geçerlidir.
    const conversationId = await sohbetAc('hybrid');
    await generateConversationDraft(db, conversationId, { model: fakeAiModel(TASLAK_CEVABI) });

    const ikinci = await generateConversationDraft(db, conversationId, { model: fakeAiModel('{"reply":"BAŞKA METİN"}') });
    expect(ikinci).toEqual({ status: 'cached' });
    // Sahte model başka bir metin döndürüyordu; satır DEĞİŞMEMELİ — çağrılmadığının kanıtı bu.
    expect((await conversations.getById(conversationId))?.aiDraftReply).toBe('Merhaba! Fıstıklı baklava 225 g pakette.');
  });

  it('son sözü BİZ söylediysek taslak üretilmez — `nothing_to_answer`', async () => {
    // Cevaplanacak bir şey yokken taslak üretmek, operatöre kendi cümlesine cevap yazdırmaktı.
    const conversationId = await sohbetAc('hybrid');
    await recordOutboundMessage(db, { conversationId, text: 'Merhaba, hemen bakıyorum.' });

    const sonuc = await generateConversationDraft(db, conversationId, { model: fakeAiModel(TASLAK_CEVABI) });
    expect(sonuc).toEqual({ status: 'skipped', reason: 'nothing_to_answer' });
  });

  it('olmayan sohbet `not_found` — sessizce "üretildi" denmez', async () => {
    const sonuc = await generateConversationDraft(db, '00000000-0000-4000-8000-0000000000cc', {
      model: fakeAiModel(TASLAK_CEVABI),
    });
    expect(sonuc).toEqual({ status: 'skipped', reason: 'not_found' });
  });
});

/**
 * **ÖZERK SOHBET MOTORU** (15.8) — talep eşinden ayrılan yer: cevap SAĞLAYICIYA gider.
 *
 * ── İKİ SAHTE, İKİ AYRI SORU ────────────────────────────────────────────────
 * `fakeAiModel` "ajan ne karar verdi"yi, `fakeMeta` "istek Meta'nın sözleşmesine uyuyor mu"yu
 * sabitliyor. İkisi birlikte, gerçek olan her şeyi (pencere kuralı, defter yazımı, mod geçişi,
 * beyan) canlı sağlayıcı olmadan sınanabilir kılıyor.
 *
 * ── EN PAHALI İKİ İDDİA BURADA ──────────────────────────────────────────────
 * 1. **Devir SESSİZ OLAMAZ.** Meta politikası: *"Automated bots must respond to any and all
 *    input"*. Modu insana çevirip müşteriye hiçbir şey dememek, müşteri açısından cevapsız
 *    kalmaktır.
 * 2. **Jeton yokken mod DEĞİŞMEZ.** Yapılandırma boşluğu yüzünden her sohbeti insana devretmek,
 *    geri alınması zor bir veri değişikliği olurdu: kanal açıldığında hiçbiri geri dönmez.
 */
describe('özerk sohbet motoru — cevap sağlayıcıya gider', () => {
  /*
    TEK sahte, tüm dosya için. Her teste yeni `fakeMeta()` kurmak kimlik dizisini baştan başlatır
    (`m_FAKE1`…) ve `provider_message_id` DB'de küresel tekil olduğu için ikinci testin ilk
    gönderimi birincinin kimliğine çarpar: mesaj gider, defter satırı OLUŞMAZ, test "gönderilmedi"
    sanır. Ölçüldü 25.08 — iki iddia tam olarak böyle düştü (sahtenin künyesinde de yazılı).
  */
  const metaOrtak = fakeMeta();
  const senderOrtak = metaCloudSender(fakeCloudApiConfig(metaOrtak));

  it('cevap GÖNDERİLİR, deftere `ai` yazarıyla düşer ve beyanla başlar', async () => {
    const conversationId = await sohbetAc('ai');
    const oncekiCagri = metaOrtak.calls.length;
    const sonuc = await runAutonomousConversationReply(db, senderOrtak, conversationId, {
      model: fakeAiModel(AJAN_CEVABI),
    });
    expect(sonuc).toEqual({ status: 'replied' });

    // Sağlayıcıya GERÇEKTEN gitti: kapı "gönderdim" deyip atlamıyor.
    expect(metaOrtak.calls.length - oncekiCagri).toBe(1);

    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden).toHaveLength(1);
    /* YAZAR — bu alan boş bırakılsaydı RPC gideni `admin` sayardı ve ekranın AI tonu ile kuyruğun
       AI süzgeci sessizce yanlış kümeyi gösterirdi. Sayı değil, KİMLİK sınanıyor. */
    expect(giden[0]!.author).toBe('ai');
    expect(giden[0]!.body.text?.startsWith('Bu cevabı otomatik asistanımız yazdı')).toBe(true);
    expect(giden[0]!.body.text).toContain('Siparişiniz salı günü çıkıyor.');
  });

  it('ikinci cevapta beyan TEKRARLANMAZ — pencerede zaten AI var', async () => {
    const conversationId = await sohbetAc('ai');
    await runAutonomousConversationReply(db, senderOrtak, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    // Müşteri yeniden yazıyor — top yine bizde.
    await recordInboundMessage(db, { conversationId, text: 'Peki kaç paket var?', receivedAt: new Date().toISOString() });

    await runAutonomousConversationReply(db, senderOrtak, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden).toHaveLength(2);
    // Her cevaba beyan eklemek, cevabı okunmaz bir yasal metne çevirirdi.
    expect(giden[1]!.body.text?.startsWith('Bu cevabı otomatik asistanımız yazdı')).toBe(false);
  });

  it('cevap ÜRETİLEMEZSE insana devredilir VE müşteri bunu ÖĞRENİR', async () => {
    const conversationId = await sohbetAc('ai');
    const sonuc = await runAutonomousConversationReply(db, senderOrtak, conversationId, {
      model: fakeAiModel(AJAN_BOS_CEVAP),
    });
    expect(sonuc.status).toBe('handoff');

    const konusma = await conversations.getById(conversationId);
    expect(konusma?.handledBy).toBe('human');

    /* ASIL İDDİA: sessiz devir yok. Bu satır düşerse müşteri, ajan sustuğu andan operatör
       bakana kadar geçen sürede cevapsız kalır ve bunu bilmez. */
    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden).toHaveLength(1);
    expect(giden[0]!.body.text).toContain('yetkilimiz');
    // Sebep MÜŞTERİYE yazılmaz: iç arıza müşterinin sorunu değildir, log'a ve kuyruğa gider.
    expect(giden[0]!.body.text).not.toContain('sebep bildirmedi');
  });

  it('PENCERE KAPALIYSA devredilir ve sağlayıcıya hiç GİDİLMEZ', async () => {
    // Kapının reddi bizim kuralımızdır: tekrar denemek aynı sonucu verir. İnsan ise onaylı şablon
    // gönderebilir ya da arayabilir — o yüzden doğru davranış devirdir, susmak değil.
    const conversationId = await sohbetAc('ai', { saatOnce: 30 });
    const meta = fakeMeta();
    const sonuc = await runAutonomousConversationReply(db, metaCloudSender(fakeCloudApiConfig(meta)), conversationId, {
      model: fakeAiModel(AJAN_CEVABI),
    });
    expect(sonuc.status).toBe('handoff');
    expect((await conversations.getById(conversationId))?.handledBy).toBe('human');
    /* Devir haberi de gidemez ve DENENMEZ: aynı reddi ikinci kez yemek, log'u iki kat gürültüyle
       doldurmaktan başka bir şey yapmazdı. Sağlayıcıya sıfır istek gitmeli. */
    expect(meta.calls).toHaveLength(0);
  });

  it('JETON YOKSA mod DEĞİŞMEZ — yapılandırma boşluğu veriyi bozmaz', async () => {
    const conversationId = await sohbetAc('ai');
    const sonuc = await runAutonomousConversationReply(db, unconfiguredSender, conversationId, {
      model: fakeAiModel(AJAN_CEVABI),
    });
    expect(sonuc).toEqual({ status: 'failed', reason: 'send_not_configured' });
    /* Sohbet AI'da KALIR: jeton yapılandırıldığı gün bir sonraki tur cevabı gönderir. Devretseydi
       kuyruktaki her satır "insanda" damgası yerdi ve hiçbiri geri dönmezdi. */
    expect((await conversations.getById(conversationId))?.handledBy).toBe('ai');
    expect((await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound')).toHaveLength(0);
  });

  it('modu `ai` DEĞİLSE hiç koşmaz — cron ile kapı aynı kuralı iki kez yazmasın', async () => {
    const conversationId = await sohbetAc('hybrid');
    const sonuc = await runAutonomousConversationReply(db, unconfiguredSender, conversationId, {
      model: fakeAiModel(AJAN_CEVABI),
    });
    expect(sonuc).toEqual({ status: 'skipped', reason: 'wrong_mode' });
  });
});

/**
 * **İZİN SORUSU** (15.12) — ajanın cevabına eklenen tek cümle, ve üç deterministik şartı.
 *
 * Şartlar modele SORULMUYOR: kanal · daha önce sorulmamış olması · yeterli tur. Modele bırakılsaydı
 * "uygun an" her koşuda başka bir şey olur, aynı müşteriye iki kez sorulabilir ve GDPR'ın en
 * hassas kaydı bir sıcaklık değerine bağlanırdı.
 */
describe('ajan izin soruyor — bir kez, doğru kanalda, yardımdan sonra', () => {
  const meta = fakeMeta();
  const sender = metaCloudSender(fakeCloudApiConfig(meta));

  it('WhatsApp\'ta yeterli tur geçince soru cevabın SONUNA eklenir ve damgalanır', async () => {
    const conversationId = await sohbetAc('ai', { source: 'whatsapp', turSayisi: 2 });
    const sonuc = await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    expect(sonuc).toEqual({ status: 'replied' });

    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden[0]!.body.text).toContain('kampanyalarımızdan haberdar');
    // Cevabın YERİNE geçmiyor, sonuna ekleniyor — müşteri sorusunun cevabını yine alıyor.
    expect(giden[0]!.body.text).toContain('Siparişiniz salı günü çıkıyor.');
    // Damga gönderim BAŞARILI olduktan sonra: sorulmuş sayılan ama ulaşmamış bir talep kalmasın.
    expect((await conversations.getById(conversationId))?.optInAskedAt).not.toBeNull();
  });

  it('İKİNCİ kez SORULMAZ — ısrar, reddin kendisinden kötü bir izlenim bırakır', async () => {
    const conversationId = await sohbetAc('ai', { source: 'whatsapp', turSayisi: 2 });
    await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    await recordInboundMessage(db, { conversationId, text: 'Teşekkürler', receivedAt: new Date().toISOString() });

    await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden).toHaveLength(2);
    expect(giden[1]!.body.text).not.toContain('kampanyalarımızdan haberdar');
  });

  it('REDDEDENE tekrar sorulmaz — retten sonra damga dolu kalıyor', async () => {
    /* 15.12'nin asıl vaadi buydu ve eski veriyle İMKÂNSIZDI: ret `optIn=false, optInAt=null`
       yazıyordu, yani "hiç sorulmadı" hâlinden ayırt edilemiyordu. */
    const conversationId = await sohbetAc('ai', { source: 'whatsapp', turSayisi: 2 });
    await conversations.setOptIn(conversationId, false);

    await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });
    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden[0]!.body.text).not.toContain('kampanyalarımızdan haberdar');
  });

  it('MESSENGER\'da hiç sorulmaz — o kanalın izni Meta\'nın kendi mekanizmasından gelir', async () => {
    // Olmayan bir kanal için izin kaydı üretmek, dayanağı olmayan bir izin demekti (`opt-in.ts`).
    const conversationId = await sohbetAc('ai', { source: 'messenger', turSayisi: 2 });
    await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });

    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden[0]!.body.text).not.toContain('kampanyalarımızdan haberdar');
    expect((await conversations.getById(conversationId))?.optInAskedAt).toBeNull();
  });

  it('İLK turda sorulmaz — önce yardım, sonra istek', async () => {
    const conversationId = await sohbetAc('ai', { source: 'whatsapp', turSayisi: 1 });
    await runAutonomousConversationReply(db, sender, conversationId, { model: fakeAiModel(AJAN_CEVABI) });

    const giden = (await messages.listByConversation(conversationId)).filter((m) => m.direction === 'outbound');
    expect(giden[0]!.body.text).not.toContain('kampanyalarımızdan haberdar');
    expect((await conversations.getById(conversationId))?.optInAskedAt).toBeNull();
  });
});
