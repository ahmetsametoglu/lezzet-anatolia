import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderBoxService,
  OrderService,
  ProductService,
  ShipmentService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { buildOrderNotification } from '../order/notification-data';
import { getCustomerOrderDetail } from '../order/customer-orders';
import { readOrderTracking } from './tracking';

/**
 * SİPARİŞİN TAKİP KÜNYESİ (07.12) — üç yüzeyin TEK kaynağı.
 *
 * Bu dosya kaynağı ve onu okuyan iki yüzeyi birlikte sınıyor, ve bu bilinçli: kural tek kapıda
 * ama değeri ancak yüzeye ULAŞTIĞINDA var. Kaynağı tek başına doğrulayan bir test, "yolda"
 * mailinin takip kutusunu hâlâ hiç çizmediğini göremezdi — ölçüldüğünde tam olarak bu oluyordu
 * (`tracking: null` sabitti).
 *
 * Sınananlar:
 *   1. Duyurulan gönderi konuşur; koli başına numara döner.
 *   2. Çok kutuluda sıra (`2/3`) basılır, tek kutuluda BASILMAZ.
 *   3. Elle girilen numara meşru ikinci yol — ve bağlantısı taşıyıcı kalıbından üretilir.
 *   4. Gönderi varsa elle girilen bayattır: gönderi konuşur.
 *   5. İptal edilmiş gönderi takip edilmez.
 *   6. Numarası yazılmamış gönderi künye AÇMAZ ama "gönderi yok" da demez.
 *   7. "Yolda" maili ve müşteri sipariş detayı bu kaynaktan besleniyor.
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
let sayac = 0;

async function siparisKur(deliveryType: 'shipping' | 'route' = 'shipping'): Promise<string> {
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType, status: 'ready', locale: 'tr' },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  return order.id;
}

/** Duyurulmuş gönderi + N kutu; `numarasiz` = koli açıldı ama takip numarası henüz yazılmadı. */
async function gonderiKur(orderId: string, opts: { boxes: number; numarasiz?: boolean; iptal?: boolean } = { boxes: 1 }): Promise<string> {
  const tur = (sayac += 1);
  const shipment = await new ShipmentService(db).insert({
    orderId,
    warehouseId,
    status: opts.iptal ? 'cancelled' : 'handed_over',
    providerShipmentId: `sc-trk-${stamp}-${tur}`,
    carrierCode: 'chronopost',
    carrierName: 'Chronopost',
    ...(opts.iptal ? { cancelledAt: new Date().toISOString() } : {}),
  });

  const boxes = new OrderBoxService(db);
  for (let i = 0; i < opts.boxes; i++) {
    const box = await boxes.insert({ orderId, warehouseId, boxNo: i + 1, code: `KT-${stamp}-${tur}-${i}` });
    await db
      .from('order_box')
      .update({
        sealed_at: new Date().toISOString(),
        shipment_id: shipment.id,
        provider_parcel_ref: `pt-${stamp}-${tur}-${i}`,
        ...(opts.numarasiz ? {} : { tracking_number: `TR${stamp}${tur}${i}`, tracking_url: `https://takip.test/${stamp}${tur}${i}` }),
      })
      .eq('id', box.id);
  }
  return shipment.id;
}

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'TRK' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);

  const cat = await new CategoryService(db).create({ name: { tr: `Takip testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Takip ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' } }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Takip müşterisi ${stamp}` })).id;
  profileIds.push(customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('readOrderTracking — kaynak', () => {
  it('duyurulan gönderi konuşur; koli başına numara döner', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 1 });

    const tracking = await readOrderTracking(db, orderId);
    expect(tracking).toMatchObject({ carrierName: 'Chronopost', status: 'handed_over' });
    expect(tracking!.parcels).toHaveLength(1);
    expect(tracking!.parcels[0]).toMatchObject({ boxNo: 1, totalBoxes: 1 });
  });

  it('ÇOK KUTULUDA her kolinin kendi numarası var — tek numara döndürmek ikisini görünmez kılardı', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 3 });

    const tracking = await readOrderTracking(db, orderId);
    expect(tracking!.parcels).toHaveLength(3);
    expect(tracking!.parcels.map((p) => `${p.boxNo}/${p.totalBoxes}`)).toEqual(['1/3', '2/3', '3/3']);
    expect(new Set(tracking!.parcels.map((p) => p.trackingNumber)).size).toBe(3);
  });

  it('ELLE girilen numara meşru ikinci yol — bağlantısı taşıyıcı kalıbından üretilir', async () => {
    const orderId = await siparisKur();
    const tracking = await readOrderTracking(db, orderId, { carrier: 'colissimo', trackingNumber: '6A12345678901' });

    expect(tracking).toMatchObject({ carrierName: 'colissimo', status: null });
    expect(tracking!.parcels[0]!.trackingUrl).toContain('6A12345678901');
  });

  it('gönderi VARSA elle girilen bayattır — gönderi konuşur', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 1 });

    const tracking = await readOrderTracking(db, orderId, { carrier: 'ups', trackingNumber: 'ESKI-NUMARA' });
    expect(tracking!.carrierName).toBe('Chronopost');
    expect(tracking!.parcels[0]!.trackingNumber).not.toBe('ESKI-NUMARA');
  });

  it('İPTAL edilmiş gönderi takip edilmez — ölü numara müşteriyi boş sayfaya yollar', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 1, iptal: true });

    expect(await readOrderTracking(db, orderId)).toBeNull();
    // Elle girilmiş numara varsa ona düşülür.
    const yedekli = await readOrderTracking(db, orderId, { carrier: 'dhl', trackingNumber: 'EL-1' });
    expect(yedekli!.parcels[0]!.trackingNumber).toBe('EL-1');
  });

  it('numarası yazılmamış gönderi künye AÇMAZ ama "gönderi yok" da DEMEZ', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 2, numarasiz: true });

    const tracking = await readOrderTracking(db, orderId);
    // İki hâl ayrı: `null` = takip edilecek bir şey yok · boş dizi = gönderi var, numara bekleniyor.
    expect(tracking).not.toBeNull();
    expect(tracking!.parcels).toEqual([]);
    expect(tracking!.carrierName).toBe('Chronopost');
  });

  it('takip edilecek hiçbir şey yoksa null', async () => {
    expect(await readOrderTracking(db, await siparisKur())).toBeNull();
  });
});

describe('takip YÜZEYE ulaşıyor mu', () => {
  it('"yolda" maili takip numaralarını taşır — alan bir süre `null` sabitti', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 2 });

    const bundle = await buildOrderNotification(db, orderId, 'order_out_for_delivery');
    expect(bundle!.data.tracking).toHaveLength(2);
    // Sıra ÇOK kutuluda basılır; dilden bağımsız (rakam çifti).
    expect(bundle!.data.tracking!.map((p) => p.ordinal)).toEqual(['1/2', '2/2']);
    expect(bundle!.data.tracking![0]!.url).toContain('https://takip.test/');
  });

  it('TEK kutuda sıra basılmaz — `1/1` olmayan bir bölünmeyi varmış gibi gösterirdi', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 1 });

    const bundle = await buildOrderNotification(db, orderId, 'order_out_for_delivery');
    expect(bundle!.data.tracking).toHaveLength(1);
    expect(bundle!.data.tracking![0]!.ordinal).toBeNull();
  });

  it('numarası olmayan gönderi mailde takip kutusu AÇMAZ — boş "📦" teslimat bilgisinin yerini alırdı', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 1, numarasiz: true });

    const bundle = await buildOrderNotification(db, orderId, 'order_out_for_delivery');
    expect(bundle!.data.tracking).toBeNull();
    expect(bundle!.data.delivery).not.toBeNull();
  });

  it('ROTA siparişinde takip hiç sorulmaz', async () => {
    const orderId = await siparisKur('route');
    const bundle = await buildOrderNotification(db, orderId, 'order_out_for_delivery');
    expect(bundle!.data.tracking).toBeNull();
  });

  it('müşteri sipariş detayı da AYNI kaynaktan besleniyor', async () => {
    const orderId = await siparisKur();
    await gonderiKur(orderId, { boxes: 3 });

    const detail = await getCustomerOrderDetail(db, { customerId, locale: 'tr', lookup: { orderId } });
    expect(detail!.shipment).toMatchObject({ carrierName: 'Chronopost' });
    expect(detail!.shipment!.parcels.map((p) => p.ordinal)).toEqual(['1/3', '2/3', '3/3']);
  });
});
