import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, PriceService, ProductService, ProductVariantService, StockService, SupplierProductService, SupplierService, TicketService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { ManagementHub, OfferCandidatesResponse, OfferOpenResponse, SupplyDraftResponse, SupplyResponse } from '@lezzet/types';
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
let supplierId: string;
let nearExpiryProductId: string;
let nearExpiryVariantId: string;
let nearExpiryStockId: string;
let expiredStockId: string;

const today = new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

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

  // ── Y3 fikstürü: raf ömrünün ~%3'ü kalmış parti (30 günün 1'i) — her makul eşiğin altında.
  // Aynı üründen DLC'si GEÇMİŞ ikinci parti: teklife açılamaz, yalnız imha (must_discard yolu).
  const nearExpiry = await new ProductService(db).create({
    name: { tr: `Su Böreği Tepsi ${stamp}` },
    categoryId,
    dateType: 'DLC',
    shelfLifeDays: 30,
  });
  nearExpiryProductId = nearExpiry.product.id;
  nearExpiryVariantId = nearExpiry.variants[0]!.id;
  await new PriceService(db).insert({ variantId: nearExpiryVariantId, channel: 'b2c', amountCents: 1000 });
  nearExpiryStockId = (
    await new StockService(db).insert({
      warehouseId,
      variantId: nearExpiryVariantId,
      physicalQty: 6,
      expiryDate: dayOffset(1),
      purchasePriceCents: 400,
    })
  ).id;
  expiredStockId = (
    await new StockService(db).insert({
      warehouseId,
      variantId: nearExpiryVariantId,
      physicalQty: 2,
      expiryDate: dayOffset(-1),
      purchasePriceCents: 400,
    })
  ).id;

  // ── Y4 fikstürü: eşik 10, elde 2 → öneri; tercihli tedarikçi eşlemesiyle gruba düşer.
  await new ProductVariantService(db).update({ id: variantId, minStockQty: 10 });
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 2,
    expiryDate: dayOffset(60),
    purchasePriceCents: 300,
  });
  supplierId = (await new SupplierService(db).insert({ name: `Yönetim Ucu Tedarik ${stamp}` })).id;
  await new SupplierProductService(db).insert({
    supplierId,
    variantId,
    supplierCode: `GZL-${stamp}`,
    isPreferred: true,
    lastPurchasePriceCents: 810,
  });

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
    productIds: [productId, nearExpiryProductId],
    categoryIds: [categoryId],
    profileIds: [admin.profileId, depocu.profileId, musteri.profileId],
    warehouseIds: [warehouseId],
    supplierIds: [supplierId],
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

const get = (user: SignedInUser, path: string) =>
  app.request(`/api/v1/management/${path}`, { headers: bearer(user.token) });
const post = (user: SignedInUser, path: string, body: unknown) =>
  app.request(`/api/v1/management/${path}`, {
    method: 'POST',
    headers: { ...bearer(user.token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Y3 · yakın-SKT teklif onayı', () => {
  it('aday listesi bizim partiyi öneri fiyatıyla taşıyor; onay teklifi GERÇEKTEN açıyor', async () => {
    const list = await envelopeData<OfferCandidatesResponse>(await get(admin, 'offer-candidates'));
    const candidate = list.candidates.find((row) => row.stockId === nearExpiryStockId);
    expect(candidate).toBeDefined();
    // Öneri = liste fiyatı × (1 − ayarın indirimi). Ayar yerelde değişebilir; sayı yerine BAĞ
    // iddia edilir: öneri liste fiyatından küçük ve pozitif.
    expect(candidate!.listPriceCents).toBe(1000);
    expect(candidate!.suggestedCents).not.toBeNull();
    expect(candidate!.suggestedCents!).toBeGreaterThan(0);
    expect(candidate!.suggestedCents!).toBeLessThan(1000);

    const open = await envelopeData<OfferOpenResponse>(
      await post(admin, 'offers', { items: [{ stockId: nearExpiryStockId, offerPriceCents: 700 }] }),
    );
    expect(open.results).toEqual([{ stockId: nearExpiryStockId, status: 'ok' }]);

    const { data: row } = await db.from('stock').select('offer_price').eq('id', nearExpiryStockId).single();
    expect(Number(row!.offer_price)).toBeCloseTo(7);

    // Teklife açılan parti aday listesinden DÜŞER — kutunun sayısı ile ekranın listesi aynı motor.
    const after = await envelopeData<OfferCandidatesResponse>(await get(admin, 'offer-candidates'));
    expect(after.candidates.some((row2) => row2.stockId === nearExpiryStockId)).toBe(false);
  });

  it('DLC geçmiş partiye teklif AÇILAMAZ — 200 + satırda must_discard, yazım yok', async () => {
    const open = await envelopeData<OfferOpenResponse>(
      await post(admin, 'offers', { items: [{ stockId: expiredStockId, offerPriceCents: 500 }] }),
    );
    expect(open.results).toEqual([{ stockId: expiredStockId, status: 'must_discard' }]);

    const { data: row } = await db.from('stock').select('offer_price').eq('id', expiredStockId).single();
    expect(row!.offer_price).toBeNull();
  });

  it('DEPOCU 403 — teklif kararı yönetimin', async () => {
    expect((await get(depocu, 'offer-candidates')).status).toBe(403);
  });
});

describe('Y4 · tedarik önerisi', () => {
  it('grup tedarikçi adıyla ve motorun önerisiyle; onay TASLAK TS yazıyor', async () => {
    const supply = await envelopeData<SupplyResponse>(await get(admin, 'supply'));
    const group = supply.groups.find((row) => row.supplierId === supplierId);
    expect(group).toBeDefined();
    expect(group!.supplierName).toContain('Yönetim Ucu Tedarik');
    const line = group!.lines.find((row) => row.variantId === variantId);
    expect(line).toBeDefined();
    expect(line!.minStockQty).toBe(10);
    // Öneri motorun sözü: eşiğe çıkaracak kadar (10−2=8); koli eşlemesi yok, yuvarlama değişmez.
    expect(line!.suggestedQty).toBe(8);

    const draft = await envelopeData<SupplyDraftResponse>(
      await post(admin, 'supply/draft', { warehouseId, supplierId }),
    );
    expect(draft.status).toBe('ok');
    if (draft.status !== 'ok') return;
    const { data: po } = await db
      .from('purchase_order')
      .select('status, supplier_id')
      .eq('id', draft.purchaseOrderId)
      .single();
    expect(po).toMatchObject({ status: 'draft', supplier_id: supplierId });
    // Hedef depo KALEMDE yazılır (C7: niyet beyanı satır bazlı) — "yolda" hesabı bu alandan döner.
    const { data: items } = await db
      .from('purchase_order_item')
      .select('target_warehouse_id, qty')
      .eq('purchase_order_id', draft.purchaseOrderId);
    expect(items?.length).toBeGreaterThanOrEqual(1);
    expect(items![0]).toMatchObject({ target_warehouse_id: warehouseId });
  });

  it('öneri kalmadıysa onay hata değil CEVAP: no_suggestion', async () => {
    // Taslak açıldı (üstteki test) → taslaktaki adet eşiğe sayılmaz ama öneri süzgeci yoldakini
    // düşer... Burada iddia daha dar: OLMAYAN tedarikçiyle onay `no_suggestion` döner.
    const draft = await envelopeData<SupplyDraftResponse>(
      await post(admin, 'supply/draft', { warehouseId, supplierId: '00000000-0000-4000-8000-00000000dead' }),
    );
    expect(draft.status).toBe('no_suggestion');
  });
});
