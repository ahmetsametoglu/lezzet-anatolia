import { afterAll, describe, expect, it } from 'vitest';
import { AppNotificationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from './read';

/**
 * **Bildirim okuması** (14.13) — çivilenen şey iki kural:
 *
 *   1. **SAHİPLİK:** satır kimliği istemciden gelir ve tek başına hiçbir şey açmaz — başkasının
 *      satırını okundu/gizli işaretlemeye çalışan `not_found` alır ve satır DOKUNULMAMIŞ kalır.
 *      Cevap bilerek "yok"tur, "yasak" değil: yasak, satırın varlığını söylerdi.
 *   2. **AKIŞ ≠ GELEN KUTUSU:** okunan satır listede kalır (yalnız rozetten düşer); gizlenen
 *      listeden de rozetten de kalkar ama SİLİNMEZ.
 *
 * Satırlar doğrudan servisle kurulur (dispatch değil): burada sınanan okuma, yazım değil —
 * yazımın kuralları `dispatch.test.ts`te.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const notifications = new AppNotificationService(db);

const stamp = Date.now();
const profileIds: string[] = [];

async function musteri(ad: string): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}` });
  profileIds.push(row.id);
  return row.id;
}

async function satir(profileId: string, n: number): Promise<string> {
  const row = await notifications.record({ profileId, kind: 'ticket_replied', dedupeKey: `test-read:${stamp}:${profileId}:${n}` });
  if (!row) throw new Error('satır kurulamadı');
  return row.id;
}

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('sahiplik', () => {
  it('BAŞKASININ satırı işaretlenemez — not_found döner ve satır dokunulmamış kalır', async () => {
    const sahip = await musteri('Sahip');
    const yabanci = await musteri('Yabancı');
    const id = await satir(sahip, 1);

    expect(await markNotificationRead(db, { profileId: yabanci, notificationId: id })).toBe('not_found');
    expect(await dismissNotification(db, { profileId: yabanci, notificationId: id })).toBe('not_found');

    const feed = await listNotifications(db, { profileId: sahip });
    expect(feed.rows[0]).toMatchObject({ id, readAt: null, dismissedAt: null }); // dokunulmadı
    expect(feed.unread).toBe(1);
  });

  it('markAllRead yalnız KENDİ satırlarını kapatır', async () => {
    const a = await musteri('Toplu A');
    const b = await musteri('Toplu B');
    await satir(a, 1);
    await satir(b, 1);

    await markAllNotificationsRead(db, a);
    expect(await unreadNotificationCount(db, a)).toBe(0);
    expect(await unreadNotificationCount(db, b)).toBe(1); // komşuya dokunulmadı
  });
});

describe('akış davranışı', () => {
  it('okunan satır LİSTEDE kalır, rozetten düşer; gizlenen ikisinden de kalkar ama SİLİNMEZ', async () => {
    const id = await musteri('Akışlı');
    const okunacak = await satir(id, 1);
    const gizlenecek = await satir(id, 2);
    await satir(id, 3);

    await markNotificationRead(db, { profileId: id, notificationId: okunacak });
    await dismissNotification(db, { profileId: id, notificationId: gizlenecek });

    const feed = await listNotifications(db, { profileId: id });
    expect(feed.rows.map((r) => r.id)).toContain(okunacak); // akış — gelen kutusu değil
    expect(feed.rows.map((r) => r.id)).not.toContain(gizlenecek);
    expect(feed.unread).toBe(1);
    // Gizlenen SİLİNMEDİ: geçmiş durur, yalnız görünümden kalkar.
    expect(await notifications.getById(gizlenecek)).not.toBeNull();
  });

  it('keyset sayfalama: en yeni üstte, imleç kuyruğu kaçırmaz, tekrarlamaz', async () => {
    const id = await musteri('Sayfalı');
    for (let i = 1; i <= 5; i += 1) await satir(id, i);

    const ilk = await listNotifications(db, { profileId: id, limit: 2 });
    expect(ilk.rows).toHaveLength(2);
    expect(ilk.nextCursor).not.toBeNull();

    const ikinci = await listNotifications(db, { profileId: id, cursor: ilk.nextCursor!, limit: 2 });
    const ucuncu = await listNotifications(db, { profileId: id, cursor: ikinci.nextCursor!, limit: 2 });

    const hepsi = [...ilk.rows, ...ikinci.rows, ...ucuncu.rows].map((r) => r.id);
    expect(new Set(hepsi).size).toBe(5); // ne tekrar ne kayıp
    expect(ucuncu.nextCursor).toBeNull();
  });
});
