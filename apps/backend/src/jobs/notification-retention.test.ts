import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppNotificationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { AppNotificationKind } from '@lezzet/types';
import { notificationRetentionJob } from './notification-retention';

/**
 * Personel bildirim saklaması (14.15). **Bu iş VERİ SİLİYOR** — testi atlanamaz (purge-observability
 * testinin aynı kuralı): yanlış süpüren iş, kaybettiğini hiçbir yerde bildirmez.
 *
 * Sınanan üç değişmez:
 *  · GÖRÜLMEMİŞ personel satırı süpürülmez — okunmamış bildirim bekleyen işin işaretidir
 *  · MÜŞTERİ satırı yaşı/okunmuşluğu ne olursa olsun süpürülmez — akış müşterinin geçmişidir
 *  · eşikten TAZE görülmüş satır durur; süpürülen yalnız eski + görülmüş personel satırıdır
 *
 * **Küresel sayıya bakılmıyor** (CLAUDE §4b): iş tüm tabloyu tarar, başka ajanın eski satırları da
 * gidebilir. Ölçüt yalnız bu testin kurduğu satırların akıbeti.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const notifications = new AppNotificationService(db);

const stamp = Date.now();
const GUN_MS = 24 * 60 * 60 * 1000;
const gunOnce = (gun: number) => new Date(Date.now() - gun * GUN_MS).toISOString();

let profilId: string;
let eskiOkunmus: string;
let eskiGizlenmis: string;
let eskiOkunmamis: string;
let tazeOkunmus: string;
let eskiMusteriOkunmus: string;

/** Satır kur ve yaş/görülmüşlük damgala — süpürmenin ölçütü tam bu üç alan. */
async function satir(kind: AppNotificationKind, opts: { yasGun: number; okundu?: boolean; gizlendi?: boolean }): Promise<string> {
  const row = await notifications.record({
    profileId: profilId,
    kind,
    dedupeKey: `test-retention:${stamp}:${kind}:${opts.yasGun}:${opts.okundu ? 'r' : ''}${opts.gizlendi ? 'd' : ''}`,
  });
  if (!row) throw new Error('satır kurulamadı');
  const yama: Record<string, string> = { created_at: gunOnce(opts.yasGun) };
  if (opts.okundu) yama.read_at = gunOnce(opts.yasGun);
  if (opts.gizlendi) yama.dismissed_at = gunOnce(opts.yasGun);
  const { error } = await db.from('notification').update(yama).eq('id', row.id);
  if (error) throw error;
  return row.id;
}

beforeAll(async () => {
  const profil = await profiles.insert({ name: `retention testi ${stamp}` });
  profilId = profil.id;

  // Varsayılan eşik 90 gün: "eski" = 120, "taze" = 5.
  eskiOkunmus = await satir('document_undeliverable', { yasGun: 120, okundu: true });
  eskiGizlenmis = await satir('document_undeliverable', { yasGun: 120, gizlendi: true });
  eskiOkunmamis = await satir('document_undeliverable', { yasGun: 120 });
  tazeOkunmus = await satir('document_undeliverable', { yasGun: 5, okundu: true });
  eskiMusteriOkunmus = await satir('order_confirmed', { yasGun: 120, okundu: true });
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: [profilId] });
});

describe('notificationRetentionJob', () => {
  it('eski görülmüş personel satırı düşer; görülmemiş, taze ve müşteri satırları durur', async () => {
    const sonuc = await notificationRetentionJob();
    // Sayı küresel (başka eski satırlar da gidebilir) — iddia yalnız "bizimkiler dahil en az 2".
    expect(sonuc.purged as number).toBeGreaterThanOrEqual(2);

    const { data, error } = await db.from('notification').select('id').eq('profile_id', profilId);
    if (error) throw error;
    const kalan = new Set((data as { id: string }[]).map((r) => r.id));

    expect(kalan.has(eskiOkunmus)).toBe(false);
    expect(kalan.has(eskiGizlenmis)).toBe(false);
    // Okunmamış personel satırı bekleyen iştir — yaşı ne olursa olsun durur.
    expect(kalan.has(eskiOkunmamis)).toBe(true);
    // Eşikten taze görülmüş satır durur.
    expect(kalan.has(tazeOkunmus)).toBe(true);
    // Müşteri satırı süpürmenin konusu bile değil.
    expect(kalan.has(eskiMusteriOkunmus)).toBe(true);
  });

  it('ikinci tur idempotent: kalan üç satır tekrar taramada da yerinde', async () => {
    await notificationRetentionJob();
    const { data, error } = await db.from('notification').select('id').eq('profile_id', profilId);
    if (error) throw error;
    expect((data as unknown[]).length).toBe(3);
  });
});
