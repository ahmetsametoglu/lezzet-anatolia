import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeAiModel } from '@lezzet/ai/testing';
import { ConversationService, MessageService, TicketMessageService, TicketService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordInboundMessage, recordOutboundMessage } from '../messaging/record';
import { generateConversationDraft, runAutonomousTicketReply } from './ai';

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

/** Kimliksiz sosyal sohbet — Messenger'ın olağan hâli (PSID telefon taşımaz). */
async function sohbetAc(mode: 'hybrid' | 'human'): Promise<string> {
  sira += 1;
  const konusma = await conversations.open({
    source: 'messenger',
    externalRef: `PSID-AI-${stamp}-${sira}`,
    customerId: null,
    providerAccountRef: 'PAGE-TEST',
    profileName: null,
  });
  conversationIds.push(konusma.id);
  if (mode !== 'human') await conversations.setMode(konusma.id, mode);
  await recordInboundMessage(db, {
    conversationId: konusma.id,
    text: 'Fıstıklı baklava var mı?',
    receivedAt: new Date().toISOString(),
  });
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
