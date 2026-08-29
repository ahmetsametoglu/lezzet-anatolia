import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderBoxService, OrderService, ProductService, ShipmentService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { providerStub } from '@lezzet/application/shipping/provider.testkit';
import { shipmentWatchJob, SHIPMENT_WATCH } from './shipment-watch';

/**
 * TAKILI GÖNDERİ NÖBETİ (07.12) — webhook'un kaçırdığını yakalayan emniyet kemeri.
 *
 * Nöbetin değeri ancak KAÇAN bir webhook varken görünür, o yüzden burada sınanan şey sayılar değil
 * DAVRANIŞ: anahtarsız ortamda sağlayıcıya hiç gidilmiyor mu, ilerlemeyen gönderi operatöre
 * görünüyor mu, ve o kayıt SAYI mı KİMLİK mi taşıyor.
 *
 * Sağlayıcı sahte (`providerStub`) — tur ağa çıkmaz.
 */
const db = serviceDb();
const stamp = Date.now();
const warehouseIds: string[] = [];
const profileIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];
let warehouseId: string;
let customerId: string;
let variantId: string;
let sayac = 0;

/** Uzlaştırmanın okuyacağı asgari dünya: kargo siparişi + duyurulmuş gönderi + bir koli. */
async function takiliGonderi(opts: { status?: 'created' | 'in_transit'; yas?: number } = {}): Promise<{ shipmentId: string; parcelRef: string }> {
  const tur = (sayac += 1);
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType: 'shipping', status: 'ready' },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: opts.status ?? 'created',
    providerShipmentId: `nobet-${stamp}-${tur}`,
  });
  // Eskitme: `listStuck` eşiği `created_at`e bakıyor ve yeni satır eşiği geçmez.
  const eski = new Date(Date.now() - (opts.yas ?? 48) * 3_600_000).toISOString();
  await db.from('shipment').update({ created_at: eski }).eq('id', shipment.id);

  const ref = `nobet-p-${stamp}-${tur}`;
  const box = await new OrderBoxService(db).insert({ orderId: order.id, warehouseId, boxNo: 1, code: `NB-${stamp}-${tur}` });
  await db.from('order_box').update({ sealed_at: eski, shipment_id: shipment.id, provider_parcel_ref: ref }).eq('id', box.id);
  return { shipmentId: shipment.id, parcelRef: ref };
}

const uyarilar = async () =>
  (await db.from('error_log').select('message, level, context').eq('context->>job', SHIPMENT_WATCH).order('last_seen_at', { ascending: false })).data ?? [];

/*
  ANAHTARLAR TESTTE ELLE KURULUYOR ve bu bir ölçümün sonucu: arka ucun kendi ortamında Sendcloud
  anahtarı YOK (anahtarlar `apps/web/.env.local`da), yani tur burada kendini atlıyordu ve testler
  sessizce `{ skipped }` ölçüyordu. Ortama bağlı bir test, ortam değiştiği gün ne ölçtüğünü
  söylemeden yeşil kalır.
*/
const gercekAnahtarlar = { pub: process.env.SENDCLOUD_PUBLIC_KEY, sec: process.env.SENDCLOUD_SECRET_KEY };

beforeAll(async () => {
  process.env.SENDCLOUD_PUBLIC_KEY = 'test-pub';
  process.env.SENDCLOUD_SECRET_KEY = 'test-sec';
  const wh = await createTestWarehouse(db, { label: 'NOB' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);
  const cat = await new CategoryService(db).create({ name: { tr: `Nöbet ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Nöbet ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' } }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Nöbet müşterisi ${stamp}` })).id;
  profileIds.push(customerId);
});

afterEach(async () => {
  // Gözlemleme kaydı `purgeTestData`nın hedefi değil; bu dosya bilerek uyarı ürettiği için
  // kendi satırını kendisi topluyor — koşular birbirinin sayısını görmesin.
  await db.from('error_log').delete().eq('context->>job', SHIPMENT_WATCH);
});

afterAll(async () => {
  // Küresel env geri konur (`CLAUDE §4b`: teste ait olmayan tekil durum önce okunur, sonra iade edilir).
  if (gercekAnahtarlar.pub === undefined) delete process.env.SENDCLOUD_PUBLIC_KEY;
  else process.env.SENDCLOUD_PUBLIC_KEY = gercekAnahtarlar.pub;
  if (gercekAnahtarlar.sec === undefined) delete process.env.SENDCLOUD_SECRET_KEY;
  else process.env.SENDCLOUD_SECRET_KEY = gercekAnahtarlar.sec;

  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('shipmentWatchJob', () => {
  it('ANAHTARSIZ ortamda tur kendini atlar ve SÖYLER — sağlayıcıya hiç gidilmez', async () => {
    const eski = process.env.SENDCLOUD_PUBLIC_KEY;
    delete process.env.SENDCLOUD_PUBLIC_KEY;
    try {
      // `providerStub` taban hâlde her ucu reddediyor: çağrılsaydı tur patlardı.
      expect(await shipmentWatchJob({ provider: providerStub() })).toEqual({ skipped: 'not_configured' });
    } finally {
      if (eski !== undefined) process.env.SENDCLOUD_PUBLIC_KEY = eski;
    }
  });

  it('kaçan webhook TELAFİ EDİLİR — gönderi sağlayıcıya yeniden sorulup ilerletilir', async () => {
    const { shipmentId, parcelRef } = await takiliGonderi();
    const sonuc = await shipmentWatchJob({
      provider: providerStub({ status: async () => [{ parcelId: parcelRef, trackingNumber: null, code: 'DELIVERED', message: null }] }),
    });

    expect(sonuc).toMatchObject({ advanced: expect.any(Number) });
    expect((sonuc as { advanced: number }).advanced).toBeGreaterThanOrEqual(1);
    expect((await new ShipmentService(db).getById(shipmentId))!.status).toBe('delivered');
  });

  /**
   * Nöbetin ASIL işi bu: uzlaştırmadan sonra da ilerlemeyen gönderi operatöre görünmeli. Kayıt
   * SAYI değil KİMLİK taşır (`OBSERVABILITY §5`) — kaç tane olduğu `job_run`da zaten var, ekranda
   * gereken "hangisi".
   */
  it('HÂLÂ takılı gönderi operatöre görünür ve kayıtta KİMLİK yazar', async () => {
    const { shipmentId, parcelRef } = await takiliGonderi();
    const sonuc = await shipmentWatchJob({
      // Taşıyıcı hâlâ "sıralama merkezinde" diyor: terminal değil, yani takılı sayılır.
      provider: providerStub({ status: async () => [{ parcelId: parcelRef, trackingNumber: null, code: 'SORTED', message: null }] }),
    });

    expect(sonuc).toMatchObject({ stillStuck: 1 });
    const [uyari] = await uyarilar();
    expect(uyari).toMatchObject({ level: 'warning' });
    expect((uyari!.context as { shipmentIds: string[] }).shipmentIds).toContain(shipmentId);
  });

  it('sağlayıcıya ULAŞILAMAYAN gönderi "takıldı" diye damgalanmaz — ayrı sayılır', async () => {
    const { parcelRef } = await takiliGonderi();
    expect(parcelRef).toBeTruthy();
    const sonuc = await shipmentWatchJob({
      provider: providerStub({
        status: () => Promise.reject(Object.assign(new Error('ağ yok'), { code: 'network' })),
      }),
    });

    // Ulaşılamamak bir teşhis DEĞİL: gönderi ilerlemiş de olabilir. İki sayı ayrı tutulmazsa
    // her sağlayıcı kesintisi "N gönderi takıldı" alarmına dönüşürdü.
    expect(sonuc).toMatchObject({ stillStuck: 0 });
    expect((sonuc as { unreachable: number }).unreachable).toBeGreaterThanOrEqual(1);
    expect(await uyarilar()).toHaveLength(0);
  });

  /**
   * `Number(...) || 24` — `??` DEĞİL, ve bu bilinçli: env'de TANIMLI ama BOŞ bırakılmış bir değer
   * (`SHIPMENT_STUCK_HOURS=`) nullish değildir, yani `??` onu yakalamaz ve `Number('')` = 0 olur.
   * Sıfır saatlik eşik "her gönderi takılı" demekti. Aynı arıza `BACKEND_PORT`ta yaşanmıştı.
   */
  it('eşik env BOŞ bırakılırsa varsayılana düşer — sıfır saatlik eşik olmaz', async () => {
    const { shipmentId, parcelRef } = await takiliGonderi({ yas: 1 });
    const eski = process.env.SHIPMENT_STUCK_HOURS;
    process.env.SHIPMENT_STUCK_HOURS = '';
    try {
      await shipmentWatchJob({
        provider: providerStub({ status: async () => [{ parcelId: parcelRef, trackingNumber: null, code: 'SORTED', message: null }] }),
      });
      /*
        İddia KENDİ SATIRIMA bakıyor, turun sayacına DEĞİL (`CLAUDE §4b`: küresel sayıya bakan test
        yazılmaz — aynı dosyanın önceki testleri de gönderi bırakıyor). 1 saatlik gönderi 24 saatlik
        eşiği geçmiyor, yani turun ona dokunmamış olması gerekir; eşik 0'a düşseydi `in_transit`
        olurdu.
      */
      expect((await new ShipmentService(db).getById(shipmentId))!.status).toBe('created');
    } finally {
      if (eski === undefined) delete process.env.SHIPMENT_STUCK_HOURS;
      else process.env.SHIPMENT_STUCK_HOURS = eski;
    }
  });
});
