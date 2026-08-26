import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AppNotificationService,
  CategoryService,
  NotificationDeliveryService,
  OrderService,
  OrderStatusLogService,
  ProductService,
  TicketMessageService,
  TicketService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { notifyOrderException, notifyOrderStatus } from '../order/notify';
import { notifyTicketReceived, notifyTicketReplied } from '../ticket/notify';

/**
 * **UÇTAN UCA ZİNCİR** (14.12-14.16, kullanıcı isteği 26.08: "hem uçtan uca hem birim, hepsi") —
 * `dispatch.test.ts` kapıyı SAHTE sürücüyle ve DOĞRUDAN çağrıyla sınıyor; burada sınanan şey
 * kalan dikiş: **gerçek olay kaynağından** (sipariş satırı + durum kaydı · talep + mesajı) satıra
 * ve teslim defterine kadar, araya sahte hiçbir şey girmeden. Bu dikişin kendi tuzakları var ve
 * hiçbiri kapı testinde görünmez:
 *
 *   · sipariş yolunun İKİ dedupe katmanı üst üste doğru mu (status-log sayımı + satır anahtarı)
 *   · İSTİSNA olayının tekrarı hâlâ MEŞRU mu (naif anahtar onu yutar — kurgu incelemesi 4)
 *   · payload gerçekten dil-bağımsız referansı taşıyor mu (bundle → kapı aktarımı)
 *   · teyit (`ticket_received`) gerçek yoldan da satırsız mı
 *
 * Kanal tarafı canlıya çıkmaz: ortamda Resend anahtarı yok (e-posta `skipped` düşer) ve alıcının
 * push jetonu yok — zincir yine sonuna kadar koşar, teslim defteri o gerçeği aynen yazar.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const orders = new OrderService(db);
const statusLogs = new OrderStatusLogService(db);
const tickets = new TicketService(db);
const ticketMessages = new TicketMessageService(db);
const notifications = new AppNotificationService(db);
const deliveries = new NotificationDeliveryService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const orderIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let variantId: string;
let musteriId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Zincir testi ${stamp}` } })).id;
  const { variants } = await new ProductService(db).create({
    name: { tr: `Zincir ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  variantId = variants[0]!.id;
  // E-postalı müşteri: BELGE sınıfı olaylar personel düşüşü tetiklemesin (o hâl dispatch testinde).
  musteriId = (await profiles.insert({ name: `Zincir ${stamp}`, email: `zincir-${stamp}@ornek.test` })).id;
  profileIds.push(musteriId);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, orderIds, warehouseIds: [warehouseId], categoryIds: [categoryId] });
});

async function siparis(): Promise<{ id: string; referenceNo: string | null }> {
  const { order } = await orders.create(
    { warehouseId, customerId: musteriId, channel: 'b2c', deliveryType: 'shipping', totalCents: 2000, status: 'confirmed' },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  orderIds.push(order.id);
  await statusLogs.insert({ orderId: order.id, fromStatus: 'draft', toStatus: 'confirmed' });
  return { id: order.id, referenceNo: order.referenceNo };
}

describe('sipariş zinciri — durum kaydından satıra', () => {
  it('onay geçişi: satır + payload referansı + teslim defteri; İKİNCİ geçiş her iki katmanda da susar', async () => {
    const s = await siparis();

    const ilk = await notifyOrderStatus(db, s.id, 'confirmed');
    expect(ilk[0]?.channel).toBe('email'); // jetonsuz + anahtarsız ortam: e-posta skipped düşer, zincir yine tam

    const satirlar = (await notifications.listByProfile(musteriId)).rows.filter((r) => r.targetId === s.id);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({
      kind: 'order_confirmed',
      targetType: 'order',
      dedupeKey: `order:${s.id}:order_confirmed`,
      // Payload dil-BAĞIMSIZ referansı gerçek bundle'dan taşıyor — ekran cümleyi hedefe gitmeden kurar.
      payload: { referenceNo: s.referenceNo ?? '—' },
    });
    const teslim = await deliveries.listByNotification(satirlar[0]!.id);
    expect(teslim.map((t) => t.channel)).toContain('email'); // defter, anahtarsız ortamda bile gerçeği yazar

    // İkinci geçiş (kapıdan dönüp yeniden onaylanmış gibi): status-log sayımı İLK savunma...
    await statusLogs.insert({ orderId: s.id, fromStatus: 'preparing', toStatus: 'confirmed' });
    const ikinci = await notifyOrderStatus(db, s.id, 'confirmed');
    expect(ikinci).toEqual([{ status: 'skipped', channel: 'email', reason: 'already_notified' }]);
    // ...ve satır katmanı da tekrarı yazmadı — iki katman AYNI kuralın kapı ve defter uçları.
    expect((await notifications.listByProfile(musteriId)).rows.filter((r) => r.targetId === s.id)).toHaveLength(1);
  });

  it('İSTİSNANIN tekrarı meşru: iki eksik düzeltmesi İKİ satır — naif anahtar bunu yutardı', async () => {
    const s = await siparis();

    await notifyOrderException(db, s.id, 'order_shortfall');
    await notifyOrderException(db, s.id, 'order_shortfall'); // ikinci düzeltme = ikinci haber

    const satirlar = (await notifications.listByProfile(musteriId)).rows.filter(
      (r) => r.targetId === s.id && r.kind === 'order_shortfall',
    );
    expect(satirlar).toHaveLength(2);
    expect(satirlar.every((r) => r.dedupeKey === null)).toBe(true); // formülü olay tanımlar: istisnada anahtar YOK
  });
});

describe('talep zinciri — gerçek talepten satıra', () => {
  it('cevap satır yazar (target: ticket); TEYİT gerçek yoldan da satırsız', async () => {
    const ticket = await tickets.insert({ customerId: musteriId, source: 'form', type: 'question', subject: 'Zincir sorusu' });
    await ticketMessages.insert({ ticketId: ticket.id, sender: 'customer', body: 'Merhaba, bir sorum var.' });

    // Teyit: müşterinin kendi eylemi — maili gider (burada skipped), zile DÜŞMEZ.
    await notifyTicketReceived(db, ticket, 'customer');
    expect((await notifications.listByProfile(musteriId)).rows.filter((r) => r.targetId === ticket.id)).toHaveLength(0);

    // Cevap: karşı taraf konuştu — satır doğar ve zil bunu taşır. (Cevap METNİ deftere yazılmıyor:
    // bildirim kurucusu geçmişi mevcut mesajlardan okur; personel satırı kimlik kısıtı ister ve
    // burada sınanan şey o değil.)
    await notifyTicketReplied(db, ticket);

    const satirlar = (await notifications.listByProfile(musteriId)).rows.filter((r) => r.targetId === ticket.id);
    expect(satirlar).toHaveLength(1);
    expect(satirlar[0]).toMatchObject({ kind: 'ticket_replied', targetType: 'ticket', dedupeKey: null });

    // Her cevap ayrı haber: ikinci cevap ikinci satır (anahtar yok — bilinçli).
    await notifyTicketReplied(db, ticket);
    expect((await notifications.listByProfile(musteriId)).rows.filter((r) => r.targetId === ticket.id)).toHaveLength(2);
  });
});
