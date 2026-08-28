import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderBoxService, OrderService, ProductService, ShipmentService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { RemoteShipment } from '@lezzet/sendcloud';
import { providerStub } from './provider.testkit';
import { scanOrphanShipments, sweepStuckShipments } from './watch';

/**
 * GÖNDERİ NÖBETİ (07.12) — webhook'un kaçırdığını yakalayan iki tarama.
 *
 * Sınananlar:
 *   1. Takılı gönderi yeniden sorulur; terminal olan sorulmaz (boş tur atılmaz).
 *   2. Sağlayıcıya ulaşılamayan tur SAYILIR — sessizce "bakıldı" sayılmaz.
 *   3. Uzlaştırmadan sonra hâlâ terminal olmayan gönderi KİMLİĞİYLE raporlanır.
 *   4. Öksüz (sağlayıcıda var, bizde yok) ve hayalet (bizde var, sağlayıcıda yok) ayrı sayılır.
 *   5. Sağlayıcı listesi kesildiyse bu SÖYLENİR — eksik tarama "öksüz yok" diye okunamaz.
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

/** Bu dosyanın kurduğu gönderiler — küresel sayıya bakan bir test başka ajanın verisiyle yanılır. */
const bizimGonderiler: string[] = [];

async function gonderiKur(opts: { status?: 'created' | 'delivered'; yasSaat?: number; providerId?: string | null; kutusuz?: boolean } = {}): Promise<string> {
  const tur = (sayac += 1);
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType: 'shipping', status: 'ready' },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: opts.status ?? 'created',
    providerShipmentId: opts.providerId === undefined ? `sc-watch-${stamp}-${tur}` : opts.providerId,
    carrierCode: 'sendcloud',
    carrierName: 'Sendcloud',
  });
  // Duyurulmuş gönderinin KUTUSU olur — uzlaştırma bizim kutularımız üzerinden yürüyor.
  if (!opts.kutusuz) {
    const box = await new OrderBoxService(db).insert({ orderId: order.id, warehouseId, boxNo: 1, code: `KN-${stamp}-${tur}` });
    await db
      .from('order_box')
      .update({ sealed_at: new Date().toISOString(), shipment_id: shipment.id, provider_parcel_ref: `pn-${stamp}-${tur}` })
      .eq('id', box.id);
  }
  if (opts.yasSaat) {
    await db
      .from('shipment')
      .update({ created_at: new Date(Date.now() - opts.yasSaat * 3_600_000).toISOString() })
      .eq('id', shipment.id);
  }
  bizimGonderiler.push(shipment.id);
  return shipment.id;
}

const uzak = (providerShipmentId: string, externalReferenceId: string | null): RemoteShipment => ({ providerShipmentId, externalReferenceId, parcelIds: [] });

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'NBT' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);

  const cat = await new CategoryService(db).create({ name: { tr: `Nöbet testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Nöbet ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' }, packedWeightG: 500, packedLengthMm: 100, packedWidthMm: 100, packedHeightMm: 100 }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Nöbet müşterisi ${stamp}` })).id;
  profileIds.push(customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('sweepStuckShipments', () => {
  it('takılı gönderi yeniden sorulur ve ilerlerse SAYILIR', async () => {
    const id = await gonderiKur({ yasSaat: 48 });
    const ref = (await new OrderBoxService(db).listByOrder((await new ShipmentService(db).getById(id))!.orderId))[0]!.providerParcelRef!;
    const sonuc = await sweepStuckShipments(db, providerStub({ status: async () => [{ parcelId: ref, trackingNumber: null, code: 'SORTED', message: null }] }), {
      olderThanHours: 24,
      limit: 200,
    });

    // Kendi satırımızı sayıyoruz: küresel sayı başka ajanın verisiyle oynar (CLAUDE §4b).
    expect(sonuc.checked).toBeGreaterThan(0);
    expect((await new ShipmentService(db).getById(id))!.status).toBe('in_transit');
  });

  it('TERMİNAL gönderi listeye hiç girmez — sağlayıcıya boş tur atılmaz', async () => {
    const teslim = await gonderiKur({ status: 'delivered', yasSaat: 48 });
    const acik = await gonderiKur({ yasSaat: 48 });

    const takililar = (await new ShipmentService(db).listStuck(24, 500)).map((s) => s.id);
    expect(takililar).toContain(acik);
    expect(takililar).not.toContain(teslim);
  });

  /**
   * **KUTUSUZ GÖNDERİ İLERLEMEZ — ve bu ölçülerek bulundu.** Uzlaştırma BİZİM kutularımız
   * üzerinden yürüyor; kutusu olmayan bir gönderide "en gerideki koli" diye bir şey yok, yani
   * cevap "bilmiyorum"dur. Sağlayıcının dizisine düşülseydi, kutuları kaybolmuş bir gönderi
   * sessizce teslim sayılabilirdi. Bu hâl bir veri arızasıdır ve nöbet onu TAKILI diye raporlar —
   * doğru davranış budur: susturmak değil, insanı masaya çağırmak.
   */
  it('KUTUSUZ gönderi ilerlemez, takılı raporlanır — sessizce teslim sayılmaz', async () => {
    const id = await gonderiKur({ yasSaat: 48, kutusuz: true });
    const sonuc = await sweepStuckShipments(db, providerStub({ status: async () => [{ parcelId: null, trackingNumber: null, code: 'DELIVERED', message: null }] }), {
      olderThanHours: 24,
      limit: 200,
    });

    expect((await new ShipmentService(db).getById(id))!.status).toBe('created');
    expect(sonuc.stillStuck).toContain(id);
  });

  it('SAĞLAYICIYA ULAŞILAMAYAN tur sayılır — "bakıldı" sayılmaz', async () => {
    await gonderiKur({ yasSaat: 48 });
    const sonuc = await sweepStuckShipments(
      db,
      providerStub({
        status: () => Promise.reject(Object.assign(new Error('ağ düştü'), { code: 'network' })),
      }),
      { olderThanHours: 24, limit: 200 },
    );

    expect(sonuc.unreachable).toBeGreaterThan(0);
    expect(sonuc.advanced).toBe(0);
  });

  it('uzlaştırmadan sonra HÂLÂ terminal olmayan gönderi kimliğiyle raporlanır', async () => {
    const id = await gonderiKur({ yasSaat: 48 });
    const ref = (await new OrderBoxService(db).listByOrder((await new ShipmentService(db).getById(id))!.orderId))[0]!.providerParcelRef!;
    const sonuc = await sweepStuckShipments(db, providerStub({ status: async () => [{ parcelId: ref, trackingNumber: null, code: 'AT_CUSTOMS', message: null }] }), {
      olderThanHours: 24,
      limit: 200,
    });

    expect(sonuc.stillStuck).toContain(id);
  });

  it('eşiğin altındaki TAZE gönderi sorulmaz', async () => {
    const id = await gonderiKur({ yasSaat: 1 });
    const sonuc = await sweepStuckShipments(db, providerStub({ status: async () => [] }), { olderThanHours: 24, limit: 200 });
    expect(sonuc.stillStuck).not.toContain(id);
  });
});

describe('scanOrphanShipments — yalnız TESPİT', () => {
  it('sağlayıcıda var bizde yok = ÖKSÜZ; bizde var sağlayıcıda yok = HAYALET', async () => {
    const bizim = await gonderiKur();
    const bizimSaglayici = (await new ShipmentService(db).getById(bizim))!.providerShipmentId!;
    const hayalet = await gonderiKur();

    const sonuc = await scanOrphanShipments(
      db,
      providerStub({
        listRecent: async () => ({
          shipments: [
            // Bizim gönderimiz — `external_reference_id` bizim kimliğimizi taşıyor, eşleşiyor.
            uzak(bizimSaglayici, bizim),
            // Bizde karşılığı olmayan koli.
            uzak(`sc-oksuz-${stamp}`, null),
          ],
          truncated: false,
        }),
      }),
      { sinceDays: 1 },
    );

    expect(sonuc.orphans).toContain(`sc-oksuz-${stamp}`);
    expect(sonuc.orphans).not.toContain(bizimSaglayici);
    // Sağlayıcının listesinde hiç görünmeyen kendi gönderimiz hayalet.
    expect(sonuc.ghosts).toContain(hayalet);
    expect(sonuc.ghosts).not.toContain(bizim);
  });

  it('yabancı `external_reference_id` de ÖKSÜZDÜR — kimliği bizim tablomuzda yok', async () => {
    const sonuc = await scanOrphanShipments(
      db,
      providerStub({ listRecent: async () => ({ shipments: [uzak(`sc-yabanci-${stamp}`, crypto.randomUUID())], truncated: false }) }),
      { sinceDays: 1 },
    );
    expect(sonuc.orphans).toContain(`sc-yabanci-${stamp}`);
  });

  /**
   * Süzgeç ÖLÇÜMLE doğdu: nöbet gerçek hesapta koşturulunca iki besleme gönderisini hayalet diye
   * saydı. Seed sağlayıcıya hiç çıkmıyor (duyuru gerçek para harcar), yani o satırların orada
   * OLMAMASI beklenen hâldir. Yerel makinede her hafta yanlış alarm veren bir nöbet susturulmayı
   * öğretir — ve susturulan alarm alarm değildir.
   */
  it('BESLEME satırı hayalet sayılmaz — sağlayıcıda olmaması beklenen hâl', async () => {
    const seedli = await gonderiKur({ providerId: `seed-hayalet-${stamp}` });
    const gercek = await gonderiKur();

    const sonuc = await scanOrphanShipments(db, providerStub({ listRecent: async () => ({ shipments: [], truncated: false }) }), { sinceDays: 1 });
    expect(sonuc.ghosts).not.toContain(seedli);
    expect(sonuc.ghosts).toContain(gercek);
  });

  it('liste kesildiyse SÖYLENİR — eksik tarama "öksüz yok" diye okunamaz', async () => {
    const sonuc = await scanOrphanShipments(db, providerStub({ listRecent: async () => ({ shipments: [], truncated: true }) }), { sinceDays: 1 });
    expect(sonuc).toMatchObject({ truncated: true, remote: 0 });
  });
});
