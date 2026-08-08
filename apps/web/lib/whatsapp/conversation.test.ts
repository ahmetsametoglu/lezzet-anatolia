import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, MessageService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { SERVICE_WINDOW_HOURS, serviceWindowState } from '@lezzet/domain-core';
import { openWhatsappConversation, recordInboundMessage, recordOutboundMessage } from './conversation';

/**
 * Telefon kimlik çözümünün GERÇEK akışa bağlanması (15.2) — DOMAIN §10, CHANNELS §3.
 *
 * Kararın kendisi motorun birim testinde (`domain-core/identity/resolve-identity`); burada sorulan
 * şey **kapının doğru bağlanıp bağlanmadığı**: bilinen numara mevcut müşteriye mi gidiyor, yeni
 * numara taslak mı açıyor, aynı numara ikinci kez kayıt ya da konuşma açıyor mu.
 *
 * Not: numaranın DOĞRULANMIŞ olması ayrı bir iştir (`04.10`) ve bugün açık — bu dosya çözümlemenin
 * mekaniğini çiviler, bağın güvenilirliğini değil.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const conversations = new ConversationService(db);
const messages = new MessageService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];
let sira = 0;

/** Her senaryo kendi numarasını alır: telefon kimlik anahtarıdır, paylaşılan numara koşuları kirletir. */
function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

/**
 * Zaman damgası ANLARLA karşılaştırılır, DİZEYLE değil: PostgREST `…+00:00` döndürüyor, JS `…000Z`
 * üretiyor — aynı an, farklı yazım.
 */
const an = (value: string | null | undefined): string | null => (value ? new Date(value).toISOString() : null);

async function ac(input: Parameters<typeof openWhatsappConversation>[0]) {
  const sonuc = await openWhatsappConversation(input);
  if (sonuc.status === 'ok') {
    profileIds.push(sonuc.customer.id);
    conversationIds.push(sonuc.conversation.id);
  }
  return sonuc;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('numaradan konuşmaya (15.2)', () => {
  it('eşleşmeyen numara TASLAK müşteri açar ve konuşma ona bağlanır', async () => {
    const telefon = numara();
    const sonuc = await ac({ phone: telefon, name: 'Yeni WhatsApp müşterisi' });

    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    expect(sonuc.customerCreated).toBe(true);
    expect(sonuc.customer.isDraft).toBe(true);
    expect(sonuc.customer.phone).toBe(telefon);
    expect(sonuc.conversation.customerId).toBe(sonuc.customer.id);
    expect(sonuc.conversation.externalRef).toBe(telefon);
  });

  it('BİLİNEN numara mevcut müşteriye bağlanır — taslak açılmaz', async () => {
    const telefon = numara();
    const mevcut = await profiles.insert({ name: `Kayıtlı müşteri ${stamp}`, phone: telefon });
    profileIds.push(mevcut.id);

    const sonuc = await ac({ phone: telefon, name: 'WhatsApp profil adı' });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    expect(sonuc.customerCreated).toBe(false);
    expect(sonuc.customer.id).toBe(mevcut.id);
    // Müşterinin kendi adı EZİLMEZ: WhatsApp profil adı otomatik bir veridir, düzeltme değil.
    expect(sonuc.customer.name).toBe(mevcut.name);
  });

  it('aynı numara ikinci kez ne müşteri ne konuşma açar', async () => {
    const telefon = numara();
    const ilk = await ac({ phone: telefon });
    const ikinci = await ac({ phone: telefon });

    expect(ilk.status).toBe('ok');
    expect(ikinci.status).toBe('ok');
    if (ilk.status !== 'ok' || ikinci.status !== 'ok') return;

    expect(ikinci.customer.id).toBe(ilk.customer.id);
    expect(ikinci.conversation.id).toBe(ilk.conversation.id);
    expect(ikinci.customerCreated).toBe(false);
  });

  it('YEREL biçimde yazılan numara aynı kişiye çıkar — anahtar E.164\'e normalize edilir', async () => {
    // `06 12 34 56 78` ile `+33612345678` aynı hattır; normalize edilmezse iki müşteri, iki konuşma.
    const basamak = String(stamp).slice(-8);
    const yerel = `06 ${basamak.slice(0, 2)} ${basamak.slice(2, 4)} ${basamak.slice(4, 6)} ${basamak.slice(6, 8)}`;
    const e164 = `+336${basamak}`;

    const ilk = await ac({ phone: yerel });
    const ikinci = await ac({ phone: e164 });

    expect(ilk.status).toBe('ok');
    if (ilk.status !== 'ok' || ikinci.status !== 'ok') return;

    expect(ilk.conversation.externalRef).toBe(e164);
    expect(ikinci.conversation.id).toBe(ilk.conversation.id);
  });

  it('çevrilemeyen numara konuşma AÇMAZ — kimlik anahtarı yoksa sohbet kimseye bağlanamaz', async () => {
    expect(await ac({ phone: 'merhaba' })).toEqual({ status: 'invalid_phone' });
  });

  it('telefon ve e-posta AYRI müşterilere çıkarsa konuşma açılmaz — çakışmayı insan çözer', async () => {
    const telefon = numara();
    const eposta = `wa-cakisma-${stamp}@ornek.fr`;
    const telefonlu = await profiles.insert({ name: `Telefonlu ${stamp}`, phone: telefon });
    const epostali = await profiles.insert({ name: `E-postalı ${stamp}`, email: eposta });
    profileIds.push(telefonlu.id, epostali.id);

    const sonuc = await ac({ phone: telefon, email: eposta });
    expect(sonuc.status).toBe('conflict');
    if (sonuc.status !== 'conflict') return;
    expect(sonuc.profileIds).toHaveLength(2);
    // Yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir sohbetten pahalıdır.
    expect(await conversations.findByExternalRef(telefon)).toBeNull();
  });
});

describe('mesaj kaydı ve servis penceresi', () => {
  it('gelen mesaj pencereyi mesajın ANINA göre açar; giden mesaj pencereye dokunmaz', async () => {
    const sonuc = await ac({ phone: numara() });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    const alindi = '2026-08-08T09:00:00.000Z';
    await recordInboundMessage({ conversationId: sonuc.conversation.id, text: 'Mantı var mı?', receivedAt: alindi });

    const acik = await conversations.getById(sonuc.conversation.id);
    const beklenen = new Date(new Date(alindi).getTime() + SERVICE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    expect(an(acik?.windowExpiresAt)).toBe(beklenen);

    await recordOutboundMessage({ conversationId: sonuc.conversation.id, text: 'Var, 500 g paket.' });
    expect(an((await conversations.getById(sonuc.conversation.id))?.windowExpiresAt)).toBe(beklenen);
  });

  it('şablon adı verilen giden mesaj TEMPLATE olarak kaydedilir — tür ücret sınıfıdır', async () => {
    const sonuc = await ac({ phone: numara() });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    await recordOutboundMessage({
      conversationId: sonuc.conversation.id,
      text: 'Siparişiniz hazırlanıyor.',
      templateName: 'order_confirm',
    });

    const liste = await messages.listByConversation(sonuc.conversation.id);
    expect(liste[0]).toMatchObject({ direction: 'outbound', kind: 'template', templateName: 'order_confirm' });
  });

  it('pencere AÇIKKEN gönderilen şablon kaydı REDDEDİLMEZ — nöbetin işi gerçeği susturmak değil', async () => {
    // Adım 1'de mesaj zaten gönderilmiş oluyor (admin telefonundan yazıyor, biz deftere işliyoruz).
    // Olmuş bir şeyi kaydetmeyi reddetmek defteri yalancı yapardı; israf log'a düşer, deftere değil.
    // Gönderimi ENGELLEYEN kapı, gönderimin kendisi doğduğunda kurulur (15.11).
    const sonuc = await ac({ phone: numara() });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    await recordInboundMessage({
      conversationId: sonuc.conversation.id,
      text: 'Merhaba',
      receivedAt: new Date().toISOString(),
    });
    const kayit = await recordOutboundMessage({
      conversationId: sonuc.conversation.id,
      text: 'Siparişiniz hazırlanıyor.',
      templateName: 'order_confirm',
    });

    expect(kayit).toMatchObject({ kind: 'template', templateName: 'order_confirm' });
    // Pencere de kaymadı: giden mesaj onu ne uzatır ne kısaltır.
    const acik = await conversations.getById(sonuc.conversation.id);
    expect(serviceWindowState(acik?.windowExpiresAt).open).toBe(true);
  });
});
