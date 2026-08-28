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
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { ParcelStatus } from '@lezzet/sendcloud';
import type { ShippingRateProvider } from './port';
import { providerStub } from './provider.testkit';
import { syncShipmentStatus } from './sync-status';

/**
 * TAŞIYICI DURUMU → SİPARİŞ DURUMU (07.12).
 *
 * Bu dosyanın varlık sebebi ölçülmüş bir boşluk (tasarım kaydı §8.1): kargo siparişi `ready`de
 * TAKILI KALIYORDU — `out_for_delivery`yi yalnız kurye akışı yazıyor, `delivered`ı da yalnız
 * kurye kapısı. Aşağıdaki senaryolar zincirin kargo kulvarındaki her halkasını çiviliyor.
 *
 * Sınananlar:
 *   1. Taşıyıcı koliyi aldı → sipariş yola çıkar.
 *   2. **Çok kolili siparişte biri yoldayken sipariş TESLİM SAYILMAZ.**
 *   3. Atlanan adım yazılır: `ready` iken `DELIVERED` görülürse önce yola çıkar, sonra teslim olur.
 *   4. Bilinmeyen kod durumu DEĞİŞTİRMEZ ama SAYILIR; bilgi olayı ise sayılmaz.
 *   5. Defter DEĞİŞİMİ kaydeder — aynı kod ikinci turda satır üretmez.
 *   6. `returned` gönderiye yazılır, SİPARİŞE yazılmaz (iade stok+paraya dokunur, kararı insan verir).
 *   7. Terminal gönderi sağlayıcıya sorulmaz; sağlayıcı düşerse hiçbir satır yazılmaz.
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
let boxTypeId: string;

/** Sağlayıcı kimlikleri VERİTABANINDA benzersiz — sayaç dosya düzeyinde (announce.test.ts dersi). */
let sayac = 0;

function fakeProvider(parcels: ParcelStatus[] | (() => never)): ShippingRateProvider & { calls: number } {
  const state = { calls: 0 };
  return {
    ...providerStub({
      status: async () => {
        state.calls += 1;
        if (typeof parcels === 'function') parcels();
        return parcels as ParcelStatus[];
      },
    }),
    get calls() {
      return state.calls;
    },
  };
}

interface Kurulum {
  orderId: string;
  shipmentId: string;
  parcelRefs: string[];
}

/**
 * Duyurulmuş bir gönderi kurar — `announceOrderShipment`ten GEÇMEDEN, satırlar doğrudan yazılarak.
 * Gerekçe `kutuKur` ile aynı (announce.test.ts): burada sınanan UZLAŞTIRMA, duyurunun nasıl
 * yapıldığı değil. Duyuru kapısının kendi testi ayrı dosyada.
 */
async function gonderiKur(opts: { boxes: number; orderStatus?: 'ready' | 'out_for_delivery' }): Promise<Kurulum> {
  const tur = (sayac += 1);
  const { order, items } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType: 'shipping', status: opts.orderStatus ?? 'ready' },
    [{ variantId, qty: 2, unitPriceCents: 1500, vatRate: 5.5 }],
  );

  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: 'created',
    providerShipmentId: `sc-sync-${stamp}-${tur}`,
    shippingOptionCode: 'sendcloud:letter',
    carrierCode: 'sendcloud',
    carrierName: 'Sendcloud',
  });

  const boxes = new OrderBoxService(db);
  const parcelRefs: string[] = [];
  for (let i = 0; i < opts.boxes; i++) {
    const ref = `pr-${stamp}-${tur}-${i}`;
    const box = await boxes.insert({ orderId: order.id, warehouseId, boxNo: i + 1, code: `KS-${stamp}-${tur}-${i}` });
    await db
      .from('order_box')
      .update({ sealed_at: new Date().toISOString(), shipping_box_id: boxTypeId, shipment_id: shipment.id, provider_parcel_ref: ref, tracking_number: `TR-${stamp}-${tur}-${i}` })
      .eq('id', box.id);
    await db.from('order_box_item').insert({ box_id: box.id, order_item_id: items[0]!.id, qty: 1 });
    parcelRefs.push(ref);
  }

  return { orderId: order.id, shipmentId: shipment.id, parcelRefs };
}

const koli = (parcelId: string, code: string | null, message: string | null = null): ParcelStatus => ({
  parcelId,
  trackingNumber: null,
  code,
  message,
});

const durumu = async (orderId: string): Promise<string> => (await new OrderService(db).getById(orderId))!.status;

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'SYN' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);

  const cat = await new CategoryService(db).create({ name: { tr: `Senkron testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Senkron ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' }, packedWeightG: 600, packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Senkron müşterisi ${stamp}` })).id;
  profileIds.push(customerId);

  boxTypeId = (
    await new ShippingBoxService(db).insert({ warehouseId, name: `Senkron kutusu ${stamp}`, lengthMm: 300, widthMm: 200, heightMm: 150, tareG: 130, maxContentG: 10_000 })
  ).id;
});

afterAll(async () => {
  // Hata kaydı `purgeTestData`nın hedefi DEĞİL (iş kaydı değil, gözlemleme kaydı) — bu dosya
  // bilerek warning ürettiği için kendi satırını kendisi topluyor. Damgayla süzülüyor: küresel
  // bir silme başka şeridin kaydını götürürdü.
  await db.from('error_log').delete().ilike('message', `%BILINMEYEN_${stamp}%`);
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('syncShipmentStatus — sipariş zinciri', () => {
  it('taşıyıcı koliyi aldı → sipariş YOLA ÇIKAR (kargonun kuryesi yok, bunu yazan başka şey de yok)', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'PICKED_UP_BY_DRIVER')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', shipmentStatus: 'handed_over', changed: true, orderMoved: 'out_for_delivery' });
    expect(await durumu(k.orderId)).toBe('out_for_delivery');
  });

  it('ÇOK KOLİDE biri yoldayken sipariş TESLİM SAYILMAZ — gönderi en gerideki kolisi kadar ilerler', async () => {
    const k = await gonderiKur({ boxes: 3 });
    const sonuc = await syncShipmentStatus(
      db,
      fakeProvider([koli(k.parcelRefs[0]!, 'DELIVERED'), koli(k.parcelRefs[1]!, 'DELIVERED'), koli(k.parcelRefs[2]!, 'SHIPMENT_ON_ROUTE')]),
      { shipmentId: k.shipmentId },
    );

    expect(sonuc).toMatchObject({ status: 'ok', shipmentStatus: 'out_for_delivery', orderMoved: 'out_for_delivery' });
    expect(await durumu(k.orderId)).toBe('out_for_delivery');

    // Son koli de teslim olunca sipariş kapanır.
    const ikinci = await syncShipmentStatus(db, fakeProvider(k.parcelRefs.map((r) => koli(r, 'DELIVERED'))), { shipmentId: k.shipmentId });
    expect(ikinci).toMatchObject({ status: 'ok', shipmentStatus: 'delivered', orderMoved: 'delivered' });
    expect(await durumu(k.orderId)).toBe('delivered');
  });

  it('SAĞLAYICININ BİLDİRMEDİĞİ kutu teslim sayılmaz — eksik ölçüm terminale taşımaz', async () => {
    const k = await gonderiKur({ boxes: 2 });
    // Sağlayıcı yalnız birinci koliyi bildiriyor; ikincisi ölçülemedi.
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'DELIVERED')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', changed: false, orderMoved: null });
    expect(await durumu(k.orderId)).toBe('ready');
  });

  it('ATLANAN ADIM yazılır: `ready` iken DELIVERED görülürse önce yola çıkar, sonra teslim olur', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'DELIVERED')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', shipmentStatus: 'delivered', orderMoved: 'delivered' });
    expect(await durumu(k.orderId)).toBe('delivered');

    // Ara adım GERÇEKTEN yazıldı — `deliver_order` yalnız `out_for_delivery`den teslim ediyor.
    const { data } = await db.from('order_status_log').select('to_status').eq('order_id', k.orderId).order('created_at');
    expect((data ?? []).map((r) => r.to_status)).toEqual(['out_for_delivery', 'delivered']);
  });

  it('TESLİM NOKTASINDAN ALINDI da teslimdir; BEKLİYOR değildir', async () => {
    const bekleyen = await gonderiKur({ boxes: 1 });
    await syncShipmentStatus(db, fakeProvider([koli(bekleyen.parcelRefs[0]!, 'AWAITING_CUSTOMER_PICKUP')]), { shipmentId: bekleyen.shipmentId });
    expect(await durumu(bekleyen.orderId)).toBe('out_for_delivery');

    const alinan = await gonderiKur({ boxes: 1 });
    await syncShipmentStatus(db, fakeProvider([koli(alinan.parcelRefs[0]!, 'COLLECTED_BY_CUSTOMER')]), { shipmentId: alinan.shipmentId });
    expect(await durumu(alinan.orderId)).toBe('delivered');
  });

  it('İADE gönderiye yazılır, SİPARİŞE yazılmaz — stok etkisi malın depoya dönüşüne çıpalı', async () => {
    const k = await gonderiKur({ boxes: 1, orderStatus: 'out_for_delivery' });
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'RETURNED_TO_SENDER')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', shipmentStatus: 'returned', orderMoved: null });
    expect((await new ShipmentService(db).getById(k.shipmentId))!.status).toBe('returned');
    expect(await durumu(k.orderId)).toBe('out_for_delivery');
  });
});

describe('syncShipmentStatus — defter', () => {
  it('BİLİNMEYEN kod durumu değiştirmez ama SAYILIR ve ham hâli saklanır', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'QUANTUM_TELEPORTED', 'ışınlandı')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', changed: false, unrecognized: 1, events: 1, orderMoved: null });
    expect(await durumu(k.orderId)).toBe('ready');

    const [olay] = await new ShipmentEventService(db).listByShipment(k.shipmentId);
    expect(olay).toMatchObject({ providerCode: 'QUANTUM_TELEPORTED', mappedStatus: null, recognized: false });
    // Ham hâl sağlayıcı yükünün TAMAMI değil, okuduğumuz iki alan — kişisel veri yapıca giremez.
    expect(olay!.raw).toEqual({ code: 'QUANTUM_TELEPORTED', message: 'ışınlandı', source: 'rest' });
  });

  /**
   * Tanınmayan kod **operatöre görünür** olmalı ve görünme yeri bir sayaç değil hata kaydıdır:
   * sayaç kaç tane olduğunu söyler, operatörün ihtiyacı HANGİ kod olduğudur — eşleme tablosuna
   * yazılacak şey odur. `error_log` kod başına gruplayıp sayıyor ve çözülmemiş kaydı süresiz
   * tutuyor; bir sayaç pencere geçince sıfırlanırdı.
   */
  it('bilinmeyen kod HATA KAYDINA warning olarak düşer — hangi kod olduğu yazılı', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const kod = `BILINMEYEN_${stamp}`;
    await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, kod)]), { shipmentId: k.shipmentId });

    const { data } = await db.from('error_log').select('level, source, message, context').ilike('message', `%${kod}%`).limit(1).single();
    expect(data).toMatchObject({ level: 'warning', source: 'application-shipping' });
    // Kimlik yazılır, içerik yazılmaz.
    expect((data!.context as Record<string, unknown>).shipmentId).toBe(k.shipmentId);
  });

  it('BİLGİ olayı deftere girer ama alarmı şişirmez — tanınıyor, yalnız yer söylemiyor', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const sonuc = await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'DELIVERY_ADDRESS_CHANGED')]), { shipmentId: k.shipmentId });

    expect(sonuc).toMatchObject({ status: 'ok', changed: false, unrecognized: 0, events: 1 });
    const [olay] = await new ShipmentEventService(db).listByShipment(k.shipmentId);
    expect(olay).toMatchObject({ providerCode: 'DELIVERY_ADDRESS_CHANGED', mappedStatus: null, recognized: true, raw: null });
  });

  it('defter DEĞİŞİMİ kaydeder — aynı kod ikinci turda satır üretmez', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const parcels = [koli(k.parcelRefs[0]!, 'SORTED')];

    expect(await syncShipmentStatus(db, fakeProvider(parcels), { shipmentId: k.shipmentId })).toMatchObject({ events: 1, changed: true });
    expect(await syncShipmentStatus(db, fakeProvider(parcels), { shipmentId: k.shipmentId })).toMatchObject({ events: 0, changed: false });
    expect(await new ShipmentEventService(db).listByShipment(k.shipmentId)).toHaveLength(1);

    // Kod değişince yeniden yazılır.
    await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'SHIPMENT_ON_ROUTE')]), { shipmentId: k.shipmentId });
    expect(await new ShipmentEventService(db).listByShipment(k.shipmentId)).toHaveLength(2);
  });

  it('bizde karşılığı olmayan koli de deftere girer — ÖKSÜZ KOLİ izinin ilk satırı', async () => {
    const k = await gonderiKur({ boxes: 1 });
    await syncShipmentStatus(db, fakeProvider([koli(k.parcelRefs[0]!, 'SORTED'), koli('bizde-yok', 'SORTED')]), { shipmentId: k.shipmentId });

    const olaylar = await new ShipmentEventService(db).listByShipment(k.shipmentId);
    expect(olaylar).toHaveLength(2);
    expect(olaylar.filter((o) => o.orderBoxId === null)).toHaveLength(1);
  });
});

describe('syncShipmentStatus — boş tur atılmaz', () => {
  it('TERMİNAL gönderi sağlayıcıya sorulmaz', async () => {
    const k = await gonderiKur({ boxes: 1 });
    await new ShipmentService(db).setStatus(k.shipmentId, 'delivered');
    const p = fakeProvider([]);

    expect(await syncShipmentStatus(db, p, { shipmentId: k.shipmentId })).toMatchObject({ status: 'terminal', shipmentStatus: 'delivered' });
    expect(p.calls).toBe(0);
  });

  it('`force` ile terminal gönderi de sorulur — elle teşhis kapısı', async () => {
    const k = await gonderiKur({ boxes: 1 });
    await new ShipmentService(db).setStatus(k.shipmentId, 'delivered');
    const p = fakeProvider([koli(k.parcelRefs[0]!, 'DELIVERED')]);

    expect(await syncShipmentStatus(db, p, { shipmentId: k.shipmentId, force: true })).toMatchObject({ status: 'ok' });
    expect(p.calls).toBe(1);
  });

  it('duyurulmamış gönderi sorulmaz', async () => {
    const k = await gonderiKur({ boxes: 1 });
    await new ShipmentService(db).update({ id: k.shipmentId, providerShipmentId: null });
    const p = fakeProvider([]);

    expect(await syncShipmentStatus(db, p, { shipmentId: k.shipmentId })).toMatchObject({ status: 'no_provider_id' });
    expect(p.calls).toBe(0);
  });

  it('SAĞLAYICI DÜŞERSE hiçbir satır yazılmaz — sipariş de gönderi de yerinde kalır', async () => {
    const k = await gonderiKur({ boxes: 1 });
    const sonuc = await syncShipmentStatus(
      db,
      fakeProvider(() => {
        throw Object.assign(new Error('sağlayıcıya ulaşılamadı'), { code: 'network' });
      }),
      { shipmentId: k.shipmentId },
    );

    expect(sonuc).toMatchObject({ status: 'provider_error', code: 'network' });
    expect((await new ShipmentService(db).getById(k.shipmentId))!.status).toBe('created');
    expect(await new ShipmentEventService(db).listByShipment(k.shipmentId)).toHaveLength(0);
    expect(await durumu(k.orderId)).toBe('ready');
  });

  it('olmayan gönderi', async () => {
    expect(await syncShipmentStatus(db, fakeProvider([]), { shipmentId: crypto.randomUUID() })).toMatchObject({ status: 'not_found' });
  });
});
