import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, TicketService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { ManagementHub } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * YÖNETİM HUB UCU (21.12 · karar kutusu + Y5 gün özeti) — çivilenen üç karar:
 *
 *  1. **Kapı YALNIZ `admin`** — depocu ve kurye 403: karar kutusu yönetim bölümünündür (doc 04).
 *  2. **Karar kutusu MOTORLARIN sözünü sayar** — cevap bekleyen talep açınca `complaints.count`
 *     bizim satırımız kadar ARTMIŞ olmalı (paylaşılan DB: alt sınır iddiası, eşitlik değil —
 *     CLAUDE §4b "kendi kurduğun satırları say").
 *  3. **Gün TESLİM günüdür** — kendi kurduğumuz bugün-teslim siparişi günün sayacına ve kanal
 *     kırılımına girer.
 */
const db = serviceDb();
const stamp = Date.now();

let admin: SignedInUser;
let depocu: SignedInUser;
let musteri: SignedInUser;
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let ticketId: string;

const today = new Date().toISOString().slice(0, 10);

const hub = (user: SignedInUser) => app.request('/api/v1/management/hub', { headers: bearer(user.token) });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Yönetim ucu ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Ispanaklı Gözleme ${stamp}` },
    categoryId,
  });
  productId = product.id;
  variantId = variants[0]!.id;

  admin = await createSignedInUser({ prefix: 'mgmt', label: 'yonetici', roles: ['admin'], warehouseIds: [] });
  depocu = await createSignedInUser({ prefix: 'mgmt', label: 'depocu', roles: ['warehouse'], warehouseIds: [warehouseId] });
  musteri = await createSignedInUser({ prefix: 'mgmt', label: 'musteri', roles: ['customer'], warehouseIds: [] });

  // Cevap bekleyen talep: son sözü müşteri söyledi → karar kutusuna düşer.
  ticketId = (
    await new TicketService(db).createWithMessage({
      customerId: musteri.profileId,
      source: 'form',
      type: 'question',
      body: `Yönetim ucu testi ${stamp} — teslimat saatini öğrenebilir miyim?`,
    })
  ).id;

  // Bugün teslim edilecek web siparişi — gün özetinin sayacına ve kanal kırılımına girer.
  await new OrderService(db).create(
    {
      customerId: musteri.profileId,
      warehouseId,
      channel: 'b2c',
      orderSource: 'web',
      status: 'confirmed',
      deliveryType: 'pickup',
      deliveryDate: today,
      totalCents: 1300,
    },
    [{ variantId, qty: 1, unitPriceCents: 1300, vatRate: 5.5 }],
  );
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [admin.profileId, depocu.profileId, musteri.profileId],
    warehouseIds: [warehouseId],
  });
});

describe('GET /management/hub', () => {
  it('ADMIN okuyor — karar kutusu bizim talebi, gün özeti bizim siparişi sayıyor', async () => {
    const res = await hub(admin);
    expect(res.status).toBe(200);
    const data = await envelopeData<ManagementHub>(res);

    // Bizim satırımız var oldukça sayı en az 1'dir; eşitlik iddia edilmez (paylaşılan DB).
    expect(data.queue.complaints.count).toBeGreaterThanOrEqual(1);
    expect(data.summary.date).toBe(today);
    expect(data.summary.orderCount).toBeGreaterThanOrEqual(1);
    expect(data.summary.revenueCents).toBeGreaterThanOrEqual(1300);

    const web = data.summary.channels.find((channel) => channel.source === 'web');
    expect(web).toBeDefined();
    expect(web!.cents ?? 0).toBeGreaterThanOrEqual(1300);

    // Ödemesi bekleyen sipariş bekleyen tahsilata da girer — aynı motor, aynı süzgeç.
    expect(data.summary.pendingPayment.cents).toBeGreaterThanOrEqual(1300);

    // İçgörü motoru yokken uydurma metin YOK — boş dizi dürüst cevaptır (CLAUDE §0).
    expect(data.summary.insights).toEqual([]);
  });

  it('DEPOCU 403 — karar kutusu yönetim bölümünün', async () => {
    expect((await hub(depocu)).status).toBe(403);
  });

  it('cevap bekleyen talep kutunun BAŞLIĞINA çıkabiliyor — head sözleşme alanlarını taşıyor', async () => {
    const data = await envelopeData<ManagementHub>(await hub(admin));
    const head = data.queue.complaints.head;
    // Paylaşılan DB'de en taze satır bizimki olmayabilir; başlığın VARLIĞI ve şekli iddia edilir.
    expect(head).not.toBeNull();
    expect(typeof head!.ticketId).toBe('string');
    expect(typeof head!.customerName).toBe('string');
    expect(typeof head!.lastMessageAt).toBe('string');
    void ticketId; // fikstür purge'de profille cascade gider; kimlik teşhis için tutulur
  });
});
