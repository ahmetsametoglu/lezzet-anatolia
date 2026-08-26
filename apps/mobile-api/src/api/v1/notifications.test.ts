import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, AppNotificationService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { createSignedInUser } from '../../lib/testing';

/**
 * `/api/v1/me/notifications` (14.13) — taşıma katmanının testi. KURAL BURADA SINANMIYOR (sahiplik,
 * akış davranışı, keyset: `packages/application/src/notification/read.test.ts`); burada ölçülen üç
 * şey points ucunun üçlüsüyle aynı: **kimlik doğru çözülüyor mu**, **ret doğru KODLA mı dönüyor**,
 * **zarfa sızmaması gereken alan sızıyor mu**.
 *
 * En kırılgan ayrım: yabancının satırı 404 `not_found` alır — 403 DEĞİL. Yasak, satırın VARLIĞINI
 * söylerdi; kimlik tahmin eden biri "var ama benim değil" bilgisini toplayabilirdi.
 */
const db = serviceDb();
const notifications = new AppNotificationService(db);

const stamp = Date.now();
const authUserIds: string[] = [];
const profileIds: string[] = [];

let musteriToken: string;
let musteriId: string;
let yabanciToken: string;

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const authPost = (token: string) => ({ method: 'POST', headers: { authorization: `Bearer ${token}` } });

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

async function satir(n: number): Promise<string> {
  const row = await notifications.record({
    profileId: musteriId,
    kind: 'ticket_replied',
    payload: { referenceNo: `SP-${n}` },
    dedupeKey: `test-uc:${stamp}:${n}`,
  });
  if (!row) throw new Error('satır kurulamadı');
  return row.id;
}

beforeAll(async () => {
  const musteri = await createSignedInUser({ prefix: 'bildirim-api', label: 'musteri' });
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
  musteriToken = musteri.token;
  musteriId = musteri.profileId;

  const yabanci = await createSignedInUser({ prefix: 'bildirim-api', label: 'yabanci' });
  authUserIds.push(yabanci.authUserId);
  profileIds.push(yabanci.profileId);
  yabanciToken = yabanci.token;
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('GET /me/notifications', () => {
  it('satırlar + rozet TEK zarfda; iç alanlar SIZMAZ', async () => {
    const id = await satir(1);

    const res = await app.request('/api/v1/me/notifications', auth(musteriToken));
    expect(res.status).toBe(200);
    const body = await dataOf<{ notifications: Record<string, unknown>[]; unread: number; nextCursor: string | null }>(res);

    expect(body.unread).toBe(1);
    const row = body.notifications.find((r) => r.id === id)!;
    expect(row).toMatchObject({ kind: 'ticket_replied', payload: { referenceNo: 'SP-1' }, readAt: null });
    // Sızıntı süzgeci (sözleşme künyesindeki daraltma): iç tesisat zarfa çıkmaz.
    expect(row).not.toHaveProperty('profileId');
    expect(row).not.toHaveProperty('dedupeKey');
    expect(row).not.toHaveProperty('warehouseId');
  });

  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/notifications')).status).toBe(401);
  });
});

describe('okundu / gizle / rozet', () => {
  it('read → rozet düşer; badge ucu listesiz aynı sayıyı söyler', async () => {
    const id = await satir(2);

    const res = await app.request(`/api/v1/me/notifications/${id}/read`, authPost(musteriToken));
    expect(res.status).toBe(200);

    const badge = await dataOf<{ unread: number }>(await app.request('/api/v1/me/notifications/badge', auth(musteriToken)));
    const feed = await dataOf<{ unread: number }>(await app.request('/api/v1/me/notifications', auth(musteriToken)));
    expect(badge.unread).toBe(feed.unread); // iki uç TEK tanımdan sayar — ayrışırlarsa rozet yalan söyler
  });

  it('YABANCININ satırı 404 `not_found` — 403 değil, varlık sızmaz; satır dokunulmamış kalır', async () => {
    const id = await satir(3);

    const res = await app.request(`/api/v1/me/notifications/${id}/read`, authPost(yabanciToken));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('not_found');
    expect((await notifications.getById(id))?.readAt).toBeNull();
  });

  it('dismiss listeden düşürür; read-all rozeti sıfırlar', async () => {
    const gizlenecek = await satir(4);
    await satir(5);

    expect((await app.request(`/api/v1/me/notifications/${gizlenecek}/dismiss`, authPost(musteriToken))).status).toBe(200);
    const feed = await dataOf<{ notifications: { id: string }[] }>(await app.request('/api/v1/me/notifications', auth(musteriToken)));
    expect(feed.notifications.map((r) => r.id)).not.toContain(gizlenecek);

    expect((await app.request('/api/v1/me/notifications/read-all', authPost(musteriToken))).status).toBe(200);
    const badge = await dataOf<{ unread: number }>(await app.request('/api/v1/me/notifications/badge', auth(musteriToken)));
    expect(badge.unread).toBe(0);
  });

  it('uuid olmayan kimlik 400 `invalid_id` — kapıya hiç inmez', async () => {
    const res = await app.request('/api/v1/me/notifications/abc/read', authPost(musteriToken));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_id');
  });
});
