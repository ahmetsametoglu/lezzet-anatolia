import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppNotificationService, NotificationDeliveryService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { createNotifier, type NotifyDriver, type NotifyRecipient } from '@lezzet/notify';
import type { TicketNotification, ZoneAvailableNotification } from '@lezzet/types';
import { dispatchCustomerNotification, dispatchStaffNotification } from './dispatch';

/**
 * **Bildirimin tek kapısı** (14.12) — kurgu incelemesinin (26.08) beş düzeltmesi burada çivili:
 *
 *   1. Önce SATIR, sonra kanal — teslim defteri kanal-başına ayrı kayıt (tek kolon diziyi ezemez).
 *   2. Tekrar = satır DA kanal DA yok — dedupe çakışan olayın maili de tekrarlanmaz.
 *   3. `ticket_received` satır yazmaz — teyit, müşterinin kendi eyleminin yankısıdır.
 *   4. Hesapsız alıcı satırsız kalır ama maili gider (`zone_available`ın çoğu alıcısı ziyaretçi).
 *   5. E-postasız müşterinin BELGESİ insana düşer — ölçülen açık: `wa_link` "sent" der, bağlantı
 *      hiçbir yere gitmez; dayanıklı ortam yükümlülüğü olan belge sessizce kayboluyordu.
 *
 * Personel fan-out'unda DEPO süzgeci ayrıca çivili: süzgeci unutulan dağıtım tek depolu veride
 * DOĞRU çalışır (CLAUDE'un tarif ettiği tuzak) — test bu yüzden İKİ ayrı depo kurar.
 *
 * Sahte sürücüyle koşar (ağa çıkmaz); sürücü sayacı "kaç kez gönderildi" sorusunu ayrı sorar.
 * Personel satırları GERÇEK personel profillerine yazılır (seed yöneticileri dahil) — kapının
 * döndürdüğü kimlikler purge'e taşınır, paylaşılan DB'de iz kalmaz (CLAUDE §4b).
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const notifications = new AppNotificationService(db);
const deliveries = new NotificationDeliveryService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const notificationIds: string[] = [];
let warehouseA: string;
let warehouseB: string;

/** Çağrıları KAYDEDEN sahte e-posta sürücüsü — adresi olana gönderir, olmayana yeteneksizdir. */
function fakeEmail(): NotifyDriver & { calls: string[] } {
  const calls: string[] = [];
  return {
    channel: 'email',
    calls,
    supports: (_event, recipient) => Boolean(recipient.email),
    send: async (event) => {
      calls.push(event);
      return { status: 'sent', channel: 'email', ref: `FAKE-${calls.length}` };
    },
  };
}

const alici = (email: string | null): NotifyRecipient => ({ name: 'Test', email, phone: null, locale: 'fr' });

/** En küçük geçerli talep yükü — kapı içeriğe bakmaz, sürücüye taşır. */
const ticketData: TicketNotification = {
  ticketId: '00000000-0000-4000-8000-000000000001',
  subject: 'Test',
  type: 'question',
  status: 'open',
  customerName: 'Test',
  locale: 'fr',
  orderReferenceNo: null,
  openedOn: '01.01.2026',
  history: [],
  previousStatus: null,
  ticketUrl: 'https://example.test/t',
  notificationPreferencesUrl: 'https://example.test/p',
};

async function musteri(ad: string, email: string | null): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}`, email });
  profileIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  warehouseA = (await createTestWarehouse(db)).id;
  warehouseB = (await createTestWarehouse(db)).id;
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, notificationIds, warehouseIds: [warehouseA, warehouseB] });
});

describe('müşteri kapısı', () => {
  it('önce SATIR, sonra kanal — teslim kanal-başına AYRI kayıt', async () => {
    const id = await musteri('Satırlı', `bild-satir-${stamp}@ornek.test`);
    const driver = fakeEmail();

    const sonuc = await dispatchCustomerNotification(
      db,
      {
        event: 'ticket_replied',
        customerId: id,
        recipient: alici(`bild-satir-${stamp}@ornek.test`),
        data: ticketData,
        target: { type: 'ticket', id: ticketData.ticketId },
        payload: { referenceNo: 'SP-TEST' },
      },
      { notifier: createNotifier([driver]) },
    );

    expect(sonuc).toEqual([{ status: 'sent', channel: 'email', ref: 'FAKE-1' }]);
    const satirlar = (await notifications.listByProfile(id)).rows;
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({
      kind: 'ticket_replied',
      targetType: 'ticket',
      payload: { referenceNo: 'SP-TEST' },
      readAt: null,
    });
    // Teslim defteri: olgu ile taşıma ayrı kayıtlarda — "gerçekten ne gitti" buradan okunur.
    const teslim = await deliveries.listByNotification(satirlar[0]!.id);
    expect(teslim).toHaveLength(1);
    expect(teslim[0]).toMatchObject({ channel: 'email', status: 'sent', ref: 'FAKE-1' });
  });

  it('TEKRAR = satır da kanal da yok — dedupe maili de susturur', async () => {
    const id = await musteri('Tekrarlı', `bild-tekrar-${stamp}@ornek.test`);
    const driver = fakeEmail();
    const notifier = createNotifier([driver]);
    const girdi = {
      event: 'order_out_for_delivery' as const,
      customerId: id,
      recipient: alici(`bild-tekrar-${stamp}@ornek.test`),
      // Kapı yükün İÇİNE bakmaz; sürücü sahte — sipariş yükü kurmaya gerek yok.
      data: ticketData as never,
      dedupeKey: `test-order:${stamp}:out_for_delivery`,
    };

    expect((await dispatchCustomerNotification(db, girdi, { notifier }))[0]?.status).toBe('sent');
    const ikinci = await dispatchCustomerNotification(db, girdi, { notifier });

    expect(ikinci).toEqual([{ status: 'skipped', channel: 'email', reason: 'duplicate' }]);
    expect(driver.calls).toHaveLength(1); // mail İKİNCİ kez gitmedi — defter ile posta kutusu ayrışmaz
    expect((await notifications.listByProfile(id)).rows).toHaveLength(1);
  });

  it('`ticket_received` satır YAZMAZ ama maili gider — teyit zile düşmez', async () => {
    const id = await musteri('Teyitli', `bild-teyit-${stamp}@ornek.test`);
    const driver = fakeEmail();

    const sonuc = await dispatchCustomerNotification(
      db,
      { event: 'ticket_received', customerId: id, recipient: alici(`bild-teyit-${stamp}@ornek.test`), data: ticketData },
      { notifier: createNotifier([driver]) },
    );

    expect(sonuc[0]?.status).toBe('sent'); // teyit MAİLİ gider (ekran söz veriyor)
    expect((await notifications.listByProfile(id)).rows).toHaveLength(0); // ama zile düşmez
  });

  it('HESAPSIZ alıcı satırsız kalır, maili gider — zone_available ziyaretçisi', async () => {
    const driver = fakeEmail();
    const data: ZoneAvailableNotification = {
      customerName: null,
      locale: 'fr',
      postalCode: '67000',
      catalogUrl: 'https://example.test/c',
      notificationPreferencesUrl: 'https://example.test/p',
    };

    const sonuc = await dispatchCustomerNotification(
      db,
      { event: 'zone_available', customerId: null, recipient: alici(`bild-ziyaretci-${stamp}@ornek.test`), data },
      { notifier: createNotifier([driver]) },
    );

    expect(sonuc[0]?.status).toBe('sent');
    expect(driver.calls).toEqual(['zone_available']);
  });

  it('E-POSTASIZ müşterinin BELGESİ insana düşer — document_undeliverable yöneticiye yazılır', async () => {
    // Ölçülen açık (26.08): e-postasız müşterinin sipariş onayı `wa_link` "sent" raporluyordu ama
    // üretimde bağlantı hiçbir yere gitmiyordu — dayanıklı ortam yükümlülüğü olan belge sessizce
    // kayboluyordu. Artık kaybolmuyor: yönetici satırdan görüyor.
    const id = await musteri('Adressiz', null);
    const anahtar = `test-belge:${stamp}`;

    const sonuc = await dispatchCustomerNotification(
      db,
      {
        event: 'order_confirmed',
        customerId: id,
        recipient: alici(null), // adres yok → sahte sürücü de yeteneksiz
        data: ticketData as never,
        dedupeKey: anahtar,
        payload: { referenceNo: 'SP-BELGE' },
      },
      { notifier: createNotifier([fakeEmail()]) },
    );
    expect(sonuc[0]?.status).toBe('skipped'); // kanal yok — olgu, hata değil (notifier sözleşmesi)

    // Yöneticilere düşen satırlar (seed yöneticileri DAHİL — kimlikleri purge'e taşınır).
    const dusen = await db.from('notification').select('id, payload').eq('dedupe_key', `undeliverable:${anahtar}`);
    const satirlar = dusen.data ?? [];
    expect(satirlar.length).toBeGreaterThan(0);
    expect(satirlar[0]!.payload).toMatchObject({ event: 'order_confirmed', referenceNo: 'SP-BELGE' });
    notificationIds.push(...satirlar.map((s) => s.id as string));
  });

  it('E-POSTALI müşterinin belgesi insana DÜŞMEZ — düşüş adressizliğe bağlı, gönderime değil', async () => {
    const id = await musteri('Adresli belge', `bild-belge-${stamp}@ornek.test`);
    const anahtar = `test-belge-adresli:${stamp}`;

    await dispatchCustomerNotification(
      db,
      {
        event: 'order_confirmed',
        customerId: id,
        recipient: alici(`bild-belge-${stamp}@ornek.test`),
        data: ticketData as never,
        dedupeKey: anahtar,
      },
      { notifier: createNotifier([fakeEmail()]) },
    );

    const dusen = await db.from('notification').select('id').eq('dedupe_key', `undeliverable:${anahtar}`);
    expect(dusen.data ?? []).toHaveLength(0);
  });
});

describe('personel fan-out', () => {
  it('DEPO süzgeci: olayın deposundaki personel alır, öteki deponunki ALMAZ', async () => {
    // Süzgeci unutulan dağıtım tek depolu veride DOĞRU çalışır — test bu yüzden iki depo kurar.
    const depocuA = await profiles.insert({ name: `Depocu A ${stamp}`, roles: ['warehouse'], warehouseIds: [warehouseA] });
    const depocuB = await profiles.insert({ name: `Depocu B ${stamp}`, roles: ['warehouse'], warehouseIds: [warehouseB] });
    profileIds.push(depocuA.id, depocuB.id);

    const ids = await dispatchStaffNotification(db, {
      kind: 'document_undeliverable',
      roles: ['warehouse'],
      warehouseId: warehouseA,
      dedupeKey: `test-depo:${stamp}`,
    });
    notificationIds.push(...ids);

    const alanlar = await db.from('notification').select('profile_id').in('id', ids);
    const kimler = (alanlar.data ?? []).map((r) => r.profile_id as string);
    expect(kimler).toContain(depocuA.id);
    expect(kimler).not.toContain(depocuB.id);
  });

  it('yönetici depo-ÜSTÜDÜR: kapsamı olmasa da depo-bağlamlı olayı alır', async () => {
    const yonetici = await profiles.insert({ name: `Yönetici ${stamp}`, roles: ['admin'], warehouseIds: [] });
    profileIds.push(yonetici.id);

    const ids = await dispatchStaffNotification(db, {
      kind: 'document_undeliverable',
      roles: ['admin', 'warehouse'],
      warehouseId: warehouseA,
      dedupeKey: `test-muaf:${stamp}`,
    });
    notificationIds.push(...ids);

    const alanlar = await db.from('notification').select('profile_id').in('id', ids);
    expect((alanlar.data ?? []).map((r) => r.profile_id as string)).toContain(yonetici.id);
  });

  it('MÜŞTERİ personel olayı almaz — rol kesişimi boş', async () => {
    const id = await musteri('Sıradan müşteri', `bild-musteri-${stamp}@ornek.test`);

    const ids = await dispatchStaffNotification(db, {
      kind: 'document_undeliverable',
      roles: ['warehouse'],
      warehouseId: warehouseA,
      dedupeKey: `test-musteri-disi:${stamp}`,
    });
    notificationIds.push(...ids);

    const alanlar = await db.from('notification').select('profile_id').in('id', ids);
    expect((alanlar.data ?? []).map((r) => r.profile_id as string)).not.toContain(id);
  });
});

describe('okuma hâli (servis)', () => {
  it('rozet sayacı okunmamış VE gizlenmemiş sayar; okundu/gizlendi ayrı düşürür', async () => {
    const id = await musteri('Sayaçlı', `bild-sayac-${stamp}@ornek.test`);
    const notifier = createNotifier([fakeEmail()]);
    const gonder = (n: number) =>
      dispatchCustomerNotification(
        db,
        { event: 'ticket_replied', customerId: id, recipient: alici(`bild-sayac-${stamp}@ornek.test`), data: ticketData, dedupeKey: `test-sayac:${stamp}:${n}` },
        { notifier },
      );
    await gonder(1);
    await gonder(2);
    await gonder(3);
    expect(await notifications.unreadCount(id)).toBe(3);

    const rows = (await notifications.listByProfile(id)).rows;
    await notifications.markReadOwned(rows[0]!.id, id);
    await notifications.dismissOwned(rows[1]!.id, id); // gizlenen, OKUNMAMIŞ olsa da rozete sayılmaz
    expect(await notifications.unreadCount(id)).toBe(1);

    await notifications.markAllRead(id);
    expect(await notifications.unreadCount(id)).toBe(0);
  });
});
