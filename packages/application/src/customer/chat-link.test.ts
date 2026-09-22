import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { consumeChatLink } from './chat-link';
import { startWhatsappLink } from './whatsapp-link';

/*
  Messenger/Instagram'da müşterinin yapıştırdığı kod sohbeti hesaba bağlamazsa kart "bağlı değil" kalır; kod tek kullanımlık
  olmazsa onu gören biri kendi sohbetini hesaba bağlar; başka hesaba bağlı sohbet ezilirse geçmiş yanlış hesaba geçer.
*/

const db = serviceDb();
const profiles = new UserProfileService(db);
const conversations = new ConversationService(db);
const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];

async function musteri(ad: string): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}` });
  profileIds.push(row.id);
  return row.id;
}

async function sohbet(customerId?: string) {
  const row = await conversations.open({ source: 'messenger', externalRef: `chat-link-${stamp}-${conversationIds.length}`, customerId });
  conversationIds.push(row.id);
  return row;
}

async function kod(customerId: string): Promise<string> {
  const outcome = await startWhatsappLink(db, customerId);
  if (outcome.status !== 'ok') throw new Error('kod üretilemedi');
  return `Merhaba! Bu sohbeti hesabıma bağlamak istiyorum. ${outcome.code}`;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('sohbet kodu', () => {
  it('bağsız sohbeti koda sahip hesaba bağlar; aynı kod ikinci sohbette işe yaramaz', async () => {
    const id = await musteri('Messenger');
    const mesaj = await kod(id);
    const ilk = await sohbet();

    expect(await consumeChatLink(db, ilk, mesaj)).toEqual({ status: 'linked', customerId: id });
    const satir = await conversations.findByExternalRef('messenger', ilk.externalRef);
    expect(satir?.customerId).toBe(id);
    expect(satir?.linkProof).toBe('chat_code');

    expect(await consumeChatLink(db, await sohbet(), mesaj)).toEqual({ status: 'invalid' });
  });

  it('başka hesaba bağlı sohbeti ezmez', async () => {
    const sahip = await musteri('Sahip');
    const yabanci = await musteri('Yabancı');
    const bagli = await sohbet(sahip);

    expect((await consumeChatLink(db, bagli, await kod(yabanci))).status).toBe('foreign');
    expect((await conversations.findByExternalRef('messenger', bagli.externalRef))?.customerId).toBe(sahip);
  });
});
