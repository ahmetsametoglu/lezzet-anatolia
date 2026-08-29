import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, ShipmentService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { providerStub } from '@lezzet/application/shipping/provider.testkit';
import { shipmentOrphanJob, SHIPMENT_ORPHAN } from './shipment-orphan';

/**
 * ÖKSÜZ / HAYALET GÖNDERİ MUTABAKATI (07.12) — yalnız TESPİT eder, hiçbir şeyi düzeltmez.
 *
 * Düzeltme bilerek elle: gerçek para söz konusu ve otomatik iptal riskli (gönderi yolda olabilir).
 * Bu dosyanın sınadığı şey bu yüzden "ne düzeltildi" değil, **operatöre ne söylendiği**:
 *
 *   1. Anahtarsız ortamda tur kendini atlar ve sağlayıcıya HİÇ gitmez.
 *   2. Öksüz = sağlayıcıda var, bizde satırı yok (koli açıldı, para ödendi, kayıt yazılamadı).
 *   3. Hayalet = bizde duyurulmuş görünüyor, sağlayıcıda yok.
 *   4. **KÖRLÜK bulguyla karışmaz:** liste sonuna kadar taranamadıysa AYRI uyarı çıkar — "0 öksüz"
 *      cevabıyla aynı satıra yazılsaydı eksik tarama "temiz" diye okunurdu.
 *   5. Temiz turda hiç uyarı yazılmaz — her hafta bağıran bir nöbet susturulmayı öğretir.
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

const gercekAnahtarlar = { pub: process.env.SENDCLOUD_PUBLIC_KEY, sec: process.env.SENDCLOUD_SECRET_KEY };

/** Bizde duyurulmuş görünen bir gönderi — sağlayıcı listesinde YOKSA hayalettir. */
async function bizdekiGonderi(providerId?: string): Promise<string> {
  const tur = (sayac += 1);
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType: 'shipping', status: 'ready' },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: 'created',
    providerShipmentId: providerId ?? `oksuz-${stamp}-${tur}`,
  });
  return shipment.id;
}

const uzak = (id: string, ext: string | null) => ({ providerShipmentId: id, externalReferenceId: ext, parcelIds: [] });

const uyarilar = async () =>
  (await db.from('error_log').select('message, level, context').eq('context->>job', SHIPMENT_ORPHAN)).data ?? [];

beforeAll(async () => {
  process.env.SENDCLOUD_PUBLIC_KEY = 'test-pub';
  process.env.SENDCLOUD_SECRET_KEY = 'test-sec';

  const wh = await createTestWarehouse(db, { label: 'OKS' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);

  const cat = await new CategoryService(db).create({ name: { tr: `Öksüz ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Öksüz ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' } }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Öksüz müşterisi ${stamp}` })).id;
  profileIds.push(customerId);
});

afterEach(async () => {
  await db.from('error_log').delete().eq('context->>job', SHIPMENT_ORPHAN);
});

afterAll(async () => {
  if (gercekAnahtarlar.pub === undefined) delete process.env.SENDCLOUD_PUBLIC_KEY;
  else process.env.SENDCLOUD_PUBLIC_KEY = gercekAnahtarlar.pub;
  if (gercekAnahtarlar.sec === undefined) delete process.env.SENDCLOUD_SECRET_KEY;
  else process.env.SENDCLOUD_SECRET_KEY = gercekAnahtarlar.sec;

  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('shipmentOrphanJob', () => {
  it('ANAHTARSIZ ortamda tur kendini atlar — sağlayıcıya hiç gidilmez', async () => {
    const eski = process.env.SENDCLOUD_PUBLIC_KEY;
    delete process.env.SENDCLOUD_PUBLIC_KEY;
    try {
      // Taban `providerStub` her ucu reddediyor: çağrılsaydı tur patlardı.
      expect(await shipmentOrphanJob({ provider: providerStub() })).toEqual({ skipped: 'not_configured' });
    } finally {
      if (eski !== undefined) process.env.SENDCLOUD_PUBLIC_KEY = eski;
    }
  });

  it('ÖKSÜZ bulunur ve kayıtta SAĞLAYICININ kimliği yazar — bizde başka kimliği yok', async () => {
    const sonuc = await shipmentOrphanJob({
      provider: providerStub({
        // Sağlayıcıda açılmış ama `external_reference_id`si bizde hiçbir satırı göstermiyor.
        listRecent: async () => ({ shipments: [uzak(`uzak-${stamp}`, 'bizde-olmayan-kimlik')], truncated: false }),
      }),
    });

    expect(sonuc).toMatchObject({ orphans: 1, truncated: false });
    const [uyari] = await uyarilar();
    expect(uyari).toMatchObject({ level: 'warning' });
    expect((uyari!.context as { orphans: string[] }).orphans).toContain(`uzak-${stamp}`);
  });

  it('HAYALET bulunur ve kayıtta BİZİM kimliğimiz yazar', async () => {
    const shipmentId = await bizdekiGonderi();
    // Sağlayıcı listesi boş: bizdeki satırın karşılığı yok.
    const sonuc = await shipmentOrphanJob({ provider: providerStub({ listRecent: async () => ({ shipments: [], truncated: false }) }) });

    expect((sonuc as { ghosts: number }).ghosts).toBeGreaterThanOrEqual(1);
    const [uyari] = await uyarilar();
    expect((uyari!.context as { ghosts: string[] }).ghosts).toContain(shipmentId);
  });

  it('EŞLEŞEN gönderi ne öksüz ne hayalet — künye `external_reference_id` üzerinden kuruluyor', async () => {
    const shipmentId = await bizdekiGonderi(`eslesen-${stamp}`);
    const sonuc = await shipmentOrphanJob({
      // Duyuruda kendi `shipment.id`mizi `external_reference_id` olarak yazıyoruz; eşleşme o bağdan.
      provider: providerStub({ listRecent: async () => ({ shipments: [uzak(`eslesen-${stamp}`, shipmentId)], truncated: false }) }),
    });

    expect(sonuc).toMatchObject({ orphans: 0 });
    const kayitlar = await uyarilar();
    const bende = kayitlar.filter((k) => JSON.stringify(k.context).includes(shipmentId));
    expect(bende).toHaveLength(0);
  });

  /**
   * **KÖRLÜK BULGU DEĞİLDİR** (`CLAUDE §1`). Liste sonuna kadar taranamadıysa sayılar EKSİKTİR;
   * bunu ayrı bir uyarıya yazmasaydık "0 öksüz" cevabı ile "sayamadım" aynı satırda görünür ve
   * eksik tarama temiz sanılırdı.
   */
  it('liste sonuna kadar taranamadıysa AYRI uyarı çıkar — "0 öksüz" ile karışmaz', async () => {
    const sonuc = await shipmentOrphanJob({
      provider: providerStub({ listRecent: async () => ({ shipments: [], truncated: true }) }),
    });

    expect(sonuc).toMatchObject({ truncated: true });
    const kesilme = (await uyarilar()).filter((u) => String(u.message).includes('taranamadı'));
    expect(kesilme).toHaveLength(1);
  });
});
