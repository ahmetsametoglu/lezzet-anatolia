import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, PriceService, ProductService, ProductVariantService, StockService, SupplierProductService, SupplierService, TicketService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { ComplaintResponse, ExceptionAskResponse, ExceptionsResponse, ManagementHub, OfferCandidatesResponse, OfferOpenResponse, SupplyDraftResponse, SupplyResponse, TicketActionResponse } from '@lezzet/types';
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
let scarceProductId: string;
let scarceVariantId: string;
let shortOrderId: string;
let shortItemId: string;
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

  // ── Y2 fikstürü: 3 istendi, rafta 1 var → 2 eksik; oran %66 > eşik → motor "müşteriye sor" der.
  const scarce = await new ProductService(db).create({ name: { tr: `Kadayıf ${stamp}` }, categoryId });
  scarceProductId = scarce.product.id;
  scarceVariantId = scarce.variants[0]!.id;
  await new StockService(db).insert({
    warehouseId,
    variantId: scarceVariantId,
    physicalQty: 1,
    expiryDate: dayOffset(30),
    purchasePriceCents: 200,
  });
  const shortOrder = await new OrderService(db).create(
    {
      customerId: musteri.profileId,
      warehouseId,
      channel: 'b2c',
      orderSource: 'web',
      status: 'confirmed',
      deliveryType: 'pickup',
      deliveryDate: today,
      totalCents: 1800,
    },
    [{ variantId: scarceVariantId, qty: 3, unitPriceCents: 600, vatRate: 5.5 }],
  );
  shortOrderId = shortOrder.order.id;
  shortItemId = shortOrder.items[0]!.id;

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
    productIds: [productId, nearExpiryProductId, scarceProductId],
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
    // Grup DEPO+tedarikçi ikilisiyle seçilir: eşleme varyant düzeyinde olduğundan öteki tesisler de
    // (stok 0'la) aynı tedarikçiye grup üretir ve düz `find` sırası koşudan koşuya değişir (ölçüldü:
    // STR'nin grubu yakalanınca öneri 10 çıkıyordu — bizim depoda 8).
    const group = supply.groups.find((row) => row.supplierId === supplierId && row.warehouseId === warehouseId);
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

describe('Y1 · şikâyet / talep detayı', () => {
  it('detay yazışmayı taşıyor; CEVAP gerçek kapıdan yazılıyor ve yazarın ADI görünüyor', async () => {
    const before = await envelopeData<ComplaintResponse>(await get(admin, `complaints/${ticketId}`));
    expect(before.complaint).not.toBeNull();
    expect(before.complaint!.customerName).toBe('musteri');
    expect(before.complaint!.awaitingReply).toBe(true);
    const messageCount = before.complaint!.messages.length;

    const reply = await envelopeData<TicketActionResponse>(
      await post(admin, `complaints/${ticketId}/reply`, { body: `Teslimat 14:00-16:00 arası — uç testi ${stamp}` }),
    );
    expect(reply).toEqual({ ok: true, reason: null });

    const after = await envelopeData<ComplaintResponse>(await get(admin, `complaints/${ticketId}`));
    expect(after.complaint!.messages.length).toBe(messageCount + 1);
    const last = after.complaint!.messages[after.complaint!.messages.length - 1]!;
    expect(last.sender).toBe('admin');
    // Yazan kişi adıyla — "OPERATÖR · yonetici" satırının verisi (v2:557).
    expect(last.authorName).toBe('yonetici');
    // Top artık bizde değil: son sözü personel söyledi.
    expect(after.complaint!.awaitingReply).toBe(false);
  });

  it('ÜSTLEN durum kapısından geçer; ikinci üstlenme reddi bir CÜMLEDİR, HTTP hatası değil', async () => {
    const claim = await envelopeData<TicketActionResponse>(await post(admin, `complaints/${ticketId}/claim`, {}));
    expect(claim.ok).toBe(true);

    const again = await envelopeData<TicketActionResponse>(await post(admin, `complaints/${ticketId}/claim`, {}));
    expect(again.ok).toBe(false);
    expect(typeof again.reason).toBe('string');
  });

  it('taslak yokken tüketme reddi adlandırılır: no_draft', async () => {
    const draft = await envelopeData<{ ok: boolean; reason: string | null; draft: string | null }>(
      await post(admin, `complaints/${ticketId}/draft`, { send: false }),
    );
    expect(draft).toEqual({ ok: false, reason: 'no_draft', draft: null });
  });

  it('DEPOCU 403', async () => {
    expect((await get(depocu, 'complaints/next')).status).toBe(403);
  });
});

describe('Y2 · sipariş istisnaları', () => {
  it('eksik kalem motor önerisi ve PARA önizlemesiyle listede; soru sorulunca kuyruktan düşer', async () => {
    const list = await envelopeData<ExceptionsResponse>(await get(admin, 'exceptions'));
    const mine = list.exceptions.find((row) => row.orderId === shortOrderId);
    expect(mine).toBeDefined();
    const line = mine!.lines.find((row) => row.orderItemId === shortItemId);
    expect(line).toMatchObject({
      orderedQty: 3,
      missingQty: 2,
      missingValueCents: 1200,
      // %66 eksik > %50 eşiği → motorun sözü "müşteriye sor" (suggestShortfallAction · large_share).
      advice: { action: 'ask_customer' },
    });

    const ask = await envelopeData<ExceptionAskResponse>(await post(admin, `exceptions/${shortItemId}/ask`, {}));
    expect(ask.status).toBe('ok');
    expect(ask.ticketId).not.toBeNull();

    // Çift soru koruması kapıda: aynı kaleme ikinci talep AÇILMAZ (10.3).
    const again = await envelopeData<ExceptionAskResponse>(await post(admin, `exceptions/${shortItemId}/ask`, {}));
    expect(again).toEqual({ status: 'already_asked', ticketId: ask.ticketId });

    // Soru sorulan kalem karar kuyruğundan KENDİLİĞİNDEN düşer — ikinci bir defter yok.
    const after = await envelopeData<ExceptionsResponse>(await get(admin, 'exceptions'));
    expect(after.exceptions.some((row) => row.orderId === shortOrderId)).toBe(false);
  });
});
