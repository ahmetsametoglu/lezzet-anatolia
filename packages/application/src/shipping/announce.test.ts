import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderBoxService,
  OrderService,
  ProductService,
  ShipmentEventService,
  ShipmentService,
  ShippingBoxService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { AnnouncedShipment } from '@lezzet/sendcloud';
import { announceOrderShipment } from './announce';
import type { ShippingRateProvider } from './port';

/**
 * GÖNDERİ DUYURUSU (07.12) — gerçek para harcayan tek kapı.
 *
 * Sınanan altı değişmez:
 *   1. Rota siparişine gönderi AÇILMAZ. Kural `check` olamıyor (başka tabloya bakar), o yüzden
 *      kapıda ve burada çivili — kısıtsız bırakılsaydı hiçbir yerde denetlenmezdi.
 *   2. Mühürsüz kutu duyurulmaz: açık kutunun içeriği kesinleşmemiştir, ağırlığı da öyle.
 *   3. Kutu TİPİ seçilmemişse duyurulmaz — ölçü oradan geliyor.
 *   4. Tartılmamış mal tarifeye giremez.
 *   5. İkinci duyuru REDDEDİLİR — ikinci koli gerçek paradır.
 *   6. ⚠ Sağlayıcı düşerse HİÇBİR SATIR YAZILMAZ. Referans projenin "öksüz koli" runbook'unun
 *      sebebi tersiydi (satır önce yazılıyor, çağrı düşünce yarım kayıt kalıyordu).
 */
const db = serviceDb();
const stamp = Date.now();
const warehouseIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];
const profileIds: string[] = [];

let warehouseId: string;
let customerId: string;
let variantId: string;
let olcusuzVariantId: string;
let boxTypeId: string;

const paris = { countryCode: 'FR', postalCode: '75001', city: 'Paris', name: 'Test Alıcı' };

/**
 * Sahte kimlik sayacı — **dosya düzeyinde**, sağlayıcı örneği düzeyinde DEĞİL.
 *
 * Hem `shipment.provider_shipment_id` hem `order_box.provider_parcel_ref` veritabanında
 * BENZERSİZ. İlk yazımda ikisi de sabitti ve testler birbirinin satırlarıyla çarpıştı — yani
 * **iki kısıt da fikstür tarafından yaşanarak doğrulandı.** Sayaç dosya düzeyinde çünkü her test
 * kendi sağlayıcısını kuruyor; örnek düzeyinde sayaç sıfırdan başlar ve aynı kimliği üretir.
 */
let sahteGonderiSayaci = 0;

function fakeProvider(opts: { throws?: boolean; parcels?: number } = {}): ShippingRateProvider & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    quote: () => Promise.reject(new Error('bu testte teklif çağrılmamalı')),
    cancel: () => Promise.resolve(),
    announce: async (args): Promise<AnnouncedShipment> => {
      state.calls += 1;
      if (opts.throws) throw Object.assign(new Error('sağlayıcı reddetti'), { code: 'validation' });
      const tur = (sahteGonderiSayaci += 1);
      return {
        providerShipmentId: `sc-${stamp}-${tur}`,
        carrierCode: 'chronopost',
        carrierName: 'Chronopost',
        parcels: args.parcels.map((_, i) => ({
          providerParcelRef: `p-${stamp}-${tur}-${i}`,
          trackingNumber: `TR-${stamp}-${tur}-${i}`,
          trackingUrl: `https://takip/${i}`,
          labelPdf: Buffer.from('PDF'),
        })),
        warnings: [],
      };
    },
  };
}

/** Kutu kodu GLOBAL benzersiz — `boxNo` her siparişte 1'den başlar, sayaç ayrı tutulur. */
let kodSayaci = 0;

/**
 * Mühürlü kutu kurar — hâl DOĞRUDAN yazılıyor, mühür RPC'siyle değil, ve bu bilinçli:
 * `seal_order_box` tam bir stok zinciri istiyor (parti, rezervasyon, picks) ve o zincirin kendi
 * testi 23.6'da. Burada sınanan DUYURU; kutunun nasıl mühürlendiği bu testin konusu değil.
 */
async function kutuKur(orderId: string, opts: { boxNo: number; tipli?: boolean; itemId: string; qty: number }): Promise<string> {
  kodSayaci += 1;
  const box = await new OrderBoxService(db).insert({
    orderId,
    warehouseId,
    boxNo: opts.boxNo,
    code: `KT-${stamp}-${kodSayaci}`,
  });
  await db.from('order_box').update({ sealed_at: new Date().toISOString(), shipping_box_id: opts.tipli === false ? null : boxTypeId }).eq('id', box.id);
  await db.from('order_box_item').insert({ box_id: box.id, order_item_id: opts.itemId, qty: opts.qty });
  return box.id;
}

async function siparisKur(deliveryType: 'shipping' | 'route', useVariant = variantId): Promise<{ orderId: string; itemId: string }> {
  const { order, items } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType, status: 'confirmed' },
    [{ variantId: useVariant, qty: 2, unitPriceCents: 1500, vatRate: 5.5 }],
  );
  return { orderId: order.id, itemId: items[0]!.id };
}

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'DUY' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);
  await new WarehouseService(db).update({ id: wh.id, address: { line1: 'Depo sok. 3', postalCode: '67000', city: 'Strasbourg' } });

  const cat = await new CategoryService(db).create({ name: { tr: `Duyuru testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Duyuru ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [
      { label: { tr: 'ölçülü' }, packedWeightG: 600, packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 },
      { label: { tr: 'tartılmamış' } },
    ],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;
  olcusuzVariantId = variants[1]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Duyuru müşterisi ${stamp}` })).id;
  profileIds.push(customerId);

  boxTypeId = (
    await new ShippingBoxService(db).insert({
      warehouseId,
      name: `Duyuru kutusu ${stamp}`,
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      tareG: 130,
      maxContentG: 10_000,
    })
  ).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

const girdi = (orderId: string) => ({
  orderId,
  warehouseId,
  shippingOptionCode: 'sendcloud:letter',
  to: paris,
});

describe('announceOrderShipment — ön koşullar (sağlayıcıya eksik girdiyle gidilmez)', () => {
  it('ROTA siparişine gönderi açılmaz — kural `check` olamıyor, kapıda duruyor', async () => {
    const { orderId, itemId } = await siparisKur('route');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId))).toMatchObject({ status: 'not_shipping' });
    expect(p.calls).toBe(0);
  });

  it('MÜHÜRSÜZ sipariş duyurulmaz — açık kutunun ağırlığı kesinleşmemiştir', async () => {
    const { orderId } = await siparisKur('shipping');
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId))).toMatchObject({ status: 'no_sealed_box' });
    expect(p.calls).toBe(0);
  });

  it('kutu TİPİ seçilmemişse duyurulmaz ve HANGİ kutu olduğu söylenir', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2, tipli: false });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId))).toMatchObject({ status: 'box_type_missing', boxNos: [1] });
    expect(p.calls).toBe(0);
  });

  it('TARTILMAMIŞ mal tarifeye giremez', async () => {
    const { orderId, itemId } = await siparisKur('shipping', olcusuzVariantId);
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId))).toMatchObject({ status: 'unmeasured', variantIds: [olcusuzVariantId] });
    expect(p.calls).toBe(0);
  });

  it('BAŞKA deponun operatörü duyuramaz — depo bir boyut değil değişmez', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    const yabanci = await announceOrderShipment(db, p, { ...girdi(orderId), warehouseId: warehouseIds[0] === warehouseId ? crypto.randomUUID() : warehouseId });
    expect(yabanci).toMatchObject({ status: 'not_found' });
    expect(p.calls).toBe(0);
  });
});

describe('announceOrderShipment — duyuru', () => {
  it('gönderi açılır, HER KUTU kendi takip numarasını alır, defter ilk satırını yazar', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    const box1 = await kutuKur(orderId, { boxNo: 1, itemId, qty: 1 });
    const box2 = await kutuKur(orderId, { boxNo: 2, itemId, qty: 1 });

    const sonuc = await announceOrderShipment(db, fakeProvider(), { ...girdi(orderId), quotedCents: 1190 });
    expect(sonuc.status).toBe('ok');

    const boxes = await new OrderBoxService(db).listByOrder(orderId);
    const takip = new Map(boxes.map((b) => [b.id, b.trackingNumber]));
    // Numaralar SIRAYLA kutulara dağıtılır: 1. kutu 1. koli, 2. kutu 2. koli.
    expect(takip.get(box1)).toMatch(/-0$/);
    expect(takip.get(box2)).toMatch(/-1$/);
    expect(takip.get(box1)).not.toBe(takip.get(box2));
    // İKİ KİMLİK UZAYI: gönderi kimliği shipment'ta, koli kimliği kutuda.
    expect(boxes.every((b) => b.providerParcelRef !== null)).toBe(true);

    const [shipment] = await new ShipmentService(db).listByOrder(orderId);
    expect(shipment).toMatchObject({ carrierCode: 'chronopost', quotedCents: 1190 });
    expect(shipment!.providerShipmentId).toMatch(/^sc-/);

    const events = await new ShipmentEventService(db).listByShipment(shipment!.id);
    expect(events.map((e) => e.providerCode)).toEqual(['ANNOUNCED']);
  });

  it('bildirilen ağırlık İÇERİK + DARA — kutunun kendisi de taşınıyor', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });

    let gonderilen: number | null = null;
    const p: ShippingRateProvider = {
      quote: () => Promise.reject(new Error('çağrılmamalı')),
      cancel: () => Promise.resolve(),
      announce: async (args) => {
        gonderilen = args.parcels[0]!.weightG;
        const tur = (sahteGonderiSayaci += 1);
        return {
          providerShipmentId: `sc-agirlik-${stamp}-${tur}`,
          carrierCode: 'c',
          carrierName: 'C',
          parcels: [{ providerParcelRef: `p-agirlik-${stamp}-${tur}`, trackingNumber: `TR-agirlik-${stamp}-${tur}`, trackingUrl: null, labelPdf: null }],
          warnings: [],
        };
      },
    };
    await announceOrderShipment(db, p, girdi(orderId));
    // 2 × 600 g içerik + 130 g dara
    expect(gonderilen).toBe(1330);
  });

  it('İKİNCİ duyuru reddedilir — ikinci koli gerçek paradır', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    const ilk = await announceOrderShipment(db, p, girdi(orderId));
    expect(ilk.status).toBe('ok');

    const ikinci = await announceOrderShipment(db, p, girdi(orderId));
    expect(ikinci).toMatchObject({ status: 'already_announced' });
    // Sağlayıcıya İKİNCİ kez gidilmedi.
    expect(p.calls).toBe(1);
  });

  it('⚠ sağlayıcı düşerse HİÇBİR SATIR YAZILMAZ — öksüz koli üretmeyiz', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    const boxId = await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });

    const sonuc = await announceOrderShipment(db, fakeProvider({ throws: true }), girdi(orderId));
    expect(sonuc).toMatchObject({ status: 'provider_error', code: 'validation' });

    expect(await new ShipmentService(db).listByOrder(orderId)).toHaveLength(0);
    const [box] = (await new OrderBoxService(db).listByOrder(orderId)).filter((b) => b.id === boxId);
    expect(box?.trackingNumber).toBeNull();
    expect(box?.shipmentId).toBeNull();
  });
});
