import { afterAll, describe, expect, it } from 'vitest';
import { AppNotificationService, NotificationDeliveryService, PushDeviceService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { sweepPushReceipts } from './push-receipts';

/**
 * Makbuz süpürmesi (14.16) — çivilenen dört kural:
 *
 *   1. `DeviceNotRegistered` makbuzu JETONU BUDAR — taşıyıcının beyanı geldi, spam muamelesi
 *      görmeden kesilir; müşteri kendiliğinden mail sınıfına döner.
 *   2. Makbuzu henüz üretilmemiş bilet İŞARETLENMEZ — sonraki tur yine sorar; yarım işaret,
 *      ulaşılamayan makbuzu "soruldu" gösterirdi.
 *   3. Penceresi kaçan satır `expired` ile KAPANIR — sonsuza dek sorulmaz.
 *   4. Expo'ya ulaşılamayan tur HİÇBİR ŞEYİ işaretlemez, fırlatır — runner ize yazar.
 *
 * Ağ yok (sahte taşıyıcı); satırlar servislerle kurulur — burada sınanan süpürme, gönderim değil.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const notifications = new AppNotificationService(db);
const deliveries = new NotificationDeliveryService(db);
const devices = new PushDeviceService(db);

const stamp = Date.now();
const profileIds: string[] = [];

function fakeReceipts(data: Record<string, unknown>) {
  return (async () =>
    ({ ok: true, status: 200, json: async () => ({ data }) }) as Response) as unknown as typeof fetch;
}

/** Profil + cihaz + bildirim + push teslimi — süpürmenin okuyacağı asgari dünya. */
async function teslim(n: number, opts: { ticket: string; token?: string } = { ticket: 'T' }) {
  const profile = await profiles.insert({ name: `Makbuz ${stamp} ${n}` });
  profileIds.push(profile.id);
  const token = opts.token ?? `ExponentPushToken[makbuz-${stamp}-${n}]`;
  await devices.register({ profileId: profile.id, token, platform: 'android', enabled: true });
  const row = await notifications.record({ profileId: profile.id, kind: 'ticket_replied', dedupeKey: `test-makbuz:${stamp}:${n}` });
  const delivery = await deliveries.insert({
    notificationId: row!.id,
    channel: 'push',
    status: 'sent',
    ref: JSON.stringify([{ token, ticket: opts.ticket }]),
  });
  return { profileId: profile.id, token, deliveryId: delivery.id };
}

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('makbuz süpürmesi', () => {
  it('DeviceNotRegistered jetonu BUDAR; ok makbuzu satırı kapatır', async () => {
    const olu = await teslim(1, { ticket: `TDEAD-${stamp}` });
    const canli = await teslim(2, { ticket: `TOK-${stamp}` });

    const ozet = await sweepPushReceipts({
      minAgeMs: 0,
      fetcher: fakeReceipts({
        [`TDEAD-${stamp}`]: { status: 'error', message: 'kayıtsız', details: { error: 'DeviceNotRegistered' } },
        [`TOK-${stamp}`]: { status: 'ok' },
      }),
    });

    expect(ozet.pruned).toBeGreaterThanOrEqual(1);
    expect(await devices.findByToken(olu.token)).toBeNull(); // çürük jeton gitti
    expect(await devices.findByToken(canli.token)).not.toBeNull(); // canlı duruyor

    expect((await deliveries.getById(olu.deliveryId))?.receiptStatus).toBe('DeviceNotRegistered');
    expect((await deliveries.getById(canli.deliveryId))?.receiptStatus).toBe('ok');
  });

  it('makbuzu HENÜZ olmayan bilet işaretlenmez — sonraki tur yine sorar', async () => {
    const bekleyen = await teslim(3, { ticket: `TYOK-${stamp}` });

    await sweepPushReceipts({ minAgeMs: 0, fetcher: fakeReceipts({}) }); // Expo daha işlemedi
    expect((await deliveries.getById(bekleyen.deliveryId))?.receiptCheckedAt).toBeNull();

    // Pencere kaçarsa kapanır: ttl=0 → aynı satır `expired`.
    await sweepPushReceipts({ minAgeMs: 0, receiptTtlMs: 0, fetcher: fakeReceipts({}) });
    expect((await deliveries.getById(bekleyen.deliveryId))?.receiptStatus).toBe('expired');
  });

  it('Expo ulaşılamazsa tur FIRLATIR ve hiçbir şeyi işaretlemez', async () => {
    const t = await teslim(4, { ticket: `TERR-${stamp}` });
    const kirik = (async () => ({ ok: false, status: 503 }) as Response) as unknown as typeof fetch;

    await expect(sweepPushReceipts({ minAgeMs: 0, fetcher: kirik })).rejects.toThrow('503');
    expect((await deliveries.getById(t.deliveryId))?.receiptCheckedAt).toBeNull(); // yarım işaret yok
  });

  it('TAZE teslim hiç sorulmaz — Expo daha işlememiştir, boş tur olur', async () => {
    const taze = await teslim(5, { ticket: `TTAZE-${stamp}` });
    // Varsayılan yaş eşiği (15 dk) devrede: az önce yazılmış satır taramaya girmez.
    const ozet = await sweepPushReceipts({ fetcher: fakeReceipts({ [`TTAZE-${stamp}`]: { status: 'ok' } }) });
    expect((await deliveries.getById(taze.deliveryId))?.receiptCheckedAt).toBeNull();
    void ozet;
  });
});
