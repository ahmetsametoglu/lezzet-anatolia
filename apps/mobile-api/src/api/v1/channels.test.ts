import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consumeWhatsappLink } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData } from '../../lib/testing';

/**
 * Uçtan dönen kod, webhook'un tükettiği biçimde değilse ya da profile yazılmazsa müşteri mesajı gönderdiği hâlde bağ kurulmaz;
 * test bu zinciri uçtan okumaya kadar sınar.
 */
const db = serviceDb();
const authUserIds: string[] = [];
const profileIds: string[] = [];
let token: string;

// Aktif numara küresel tekil; koşular birbirini kirletmesin diye numara zamandan türer.
const phone = `+336${String(Date.now()).slice(-8)}`;

beforeAll(async () => {
  const user = await createSignedInUser({ prefix: 'whatsapp-api', label: 'musteri' });
  token = user.token;
  authUserIds.push(user.authUserId);
  profileIds.push(user.profileId);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

type Channels = { channels: { source: string; linked: boolean; numbers: string[] }[] };
const whatsappRow = (view: Channels) => view.channels.find((channel) => channel.source === 'whatsapp');

describe('/api/v1/me/channels', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/channels')).status).toBe(401);
    expect((await app.request('/api/v1/me/channels/code', { method: 'POST' })).status).toBe(401);
  });

  it('uçtan dönen kodla gönderilen mesaj numarayı bağlar ve okuma onu gösterir', async () => {
    const before = await envelopeData<Channels>(await app.request('/api/v1/me/channels', { headers: bearer(token) }));
    expect(whatsappRow(before)).toMatchObject({ linked: false, numbers: [] });

    const link = await envelopeData<{ code: string; expiresAt: string }>(
      await app.request('/api/v1/me/channels/code', { method: 'POST', headers: bearer(token) }),
    );
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const outcome = await consumeWhatsappLink(db, phone, `Bonjour ! ${link.code}`);
    expect(outcome).toMatchObject({ status: 'linked', customerId: profileIds[0] });

    const after = await envelopeData<Channels>(await app.request('/api/v1/me/channels', { headers: bearer(token) }));
    expect(whatsappRow(after)).toMatchObject({ linked: true, numbers: [phone] });
  });
});
