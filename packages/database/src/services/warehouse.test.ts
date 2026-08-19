import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { ReservationService } from './reservation.service';
import { StockService } from './stock.service';
import { StockIntakeService } from './stock-intake.service';
import { SupplierService } from './supplier.service';
import { PurchaseOrderService } from './purchase-order.service';
import { WarehouseService } from './warehouse.service';
import { WarehouseTransferService } from './warehouse-transfer.service';
import { createTestWarehouse, createTestWarehousePair } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';

/**
 * Depo ağı (19.1) — DB üstünde. Burada **depo geçişinin çıkış ölçütü** doğrulanır: aynı varyant iki
 * depoda, biri boş → boş depodan istenen mal ayrılamaz.
 *
 * Bu testin varlık sebebi şudur: depo süzgeci unutulan bir sorgu TEK DEPOLU bir veri setinde doğru
 * cevap verir ve hiçbir test kırılmaz. Sistem sessizce olmayan malı satmaya başlar ve bunu ancak
 * müşteri fark eder. İki depolu kurulum o sessizliği bozar.
 *
 * Kurallar motorun değil VERİNİN sorumluluğundadır (DOMAIN §17) — burada denenen de tam olarak o:
 * uygulama unutsa bile veritabanı reddediyor mu?
 */
const db = serviceDb();
const stocks = new StockService(db);
const reservations = new ReservationService(db);
const transfers = new WarehouseTransferService(db);
const warehouses = new WarehouseService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);
const suppliers = new SupplierService(db);
const purchaseOrders = new PurchaseOrderService(db);
const intakes = new StockIntakeService(db);

let doluDepo: string;
let bosDepo: string;
let variantId: string;
let productId: string;
let categoryId: string;
let supplierId: string;

const orderId = () => crypto.randomUUID();
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  doluDepo = primary.id;
  bosDepo = secondary.id;

  const category = await categories.create({ name: { tr: `Depo testi ${Date.now()}` } });
  const { product, variants } = await products.create({
    name: { tr: `Depo ürünü ${Date.now()}` },
    categoryId: category.id,
    dateType: 'DLC',
    shelfLifeDays: 360,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await suppliers.insert({ name: `Depo tedarikçisi ${Date.now()}` })).id;
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [doluDepo, bosDepo],
  });
});

beforeEach(async () => {
  await db.from('reservation').delete().eq('variant_id', variantId);
  // Transfer satırları partiye `restrict` ile bağlı: silme SIRASI zorunlu. Sıra yanlış olduğunda
  // parti silinmez, önceki testin stoğu bu teste sızar ve "kullanılabilir" hesabı yalancı geçer —
  // bir kez yaşandı, sevk testi bu yüzden yanlışlıkla yeşildi.
  const { data: partiler } = await db.from('stock').select('id').eq('variant_id', variantId);
  const ids = (partiler ?? []).map((p) => (p as { id: string }).id);
  if (ids.length > 0) {
    const { data: satirlar } = await db.from('warehouse_transfer_line').select('transfer_id').in('source_stock_id', ids);
    const transferIds = [...new Set((satirlar ?? []).map((l) => (l as { transfer_id: string }).transfer_id))];
    if (transferIds.length > 0) await db.from('warehouse_transfer').delete().in('id', transferIds); // satırları CASCADE
  }
  await db.from('stock').delete().eq('variant_id', variantId);
});

describe('kullanılabilir stok depo içinde hesaplanır', () => {
  it('bir deponun stoğu diğerinin kullanılabilirini ARTIRMAZ', async () => {
    await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 10, expiryDate: dayOffset(200) });

    expect(await stocks.getAvailable(doluDepo, variantId)).toMatchObject({ physicalQty: 10, availableQty: 10 });
    // Aynı varyant, öteki depo: "0 da bir cevaptır" — satır yokluğu değil, sıfır döner.
    expect(await stocks.getAvailable(bosDepo, variantId)).toMatchObject({ physicalQty: 0, availableQty: 0 });
  });

  it('harita da depo süzgeçlidir — iki deponun satırı birbirini EZMEZ', async () => {
    await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 7, expiryDate: dayOffset(200) });
    await stocks.insert({ variantId, warehouseId: bosDepo, physicalQty: 3, expiryDate: dayOffset(200) });

    // Süzgeç olmasaydı iki satır aynı anahtara düşer ve son okunan depo kazanırdı (T8'in kapattığı
    // sessiz kırılma). Her iki okuma da KENDİ deposunun sayısını vermeli.
    expect((await stocks.getAvailableMap(doluDepo, [variantId])).get(variantId)?.availableQty).toBe(7);
    expect((await stocks.getAvailableMap(bosDepo, [variantId])).get(variantId)?.availableQty).toBe(3);
  });

  it('depo-üstü toplam AYRI bir okumadır (tedarik ve "hiçbir depoda yok mu" için)', async () => {
    await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 7, expiryDate: dayOffset(200) });
    await stocks.insert({ variantId, warehouseId: bosDepo, physicalQty: 3, expiryDate: dayOffset(200) });

    // 7 + 3 = 10 ama bu SATIŞ KARARI DEĞİL: 10 kişilik sipariş bu maldan çıkmaz.
    expect((await stocks.getNetworkAvailabilityMap([variantId])).get(variantId)?.availableQty).toBe(10);
  });
});

describe('19.1 çıkış ölçütü — iki depolu yarış', () => {
  it('boş depodan ayırma REDDEDİLİR, dolu depodan aynı istek geçer', async () => {
    await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 5, expiryDate: dayOffset(200) });

    const bos = await reservations.reserve({ orderId: orderId(), variantId, warehouseId: bosDepo, qty: 1 });
    expect(bos).toMatchObject({ ok: false, reservationId: null, available: 0 });

    const dolu = await reservations.reserve({ orderId: orderId(), variantId, warehouseId: doluDepo, qty: 3 });
    expect(dolu.ok).toBe(true);
  });

  it('bir depodaki rezervasyon diğerinin kullanılabilirini DÜŞÜRMEZ', async () => {
    await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 6, expiryDate: dayOffset(200) });
    await stocks.insert({ variantId, warehouseId: bosDepo, physicalQty: 6, expiryDate: dayOffset(200) });

    await reservations.reserve({ orderId: orderId(), variantId, warehouseId: doluDepo, qty: 4 });

    expect(await stocks.getAvailable(doluDepo, variantId)).toMatchObject({ reservedQty: 4, availableQty: 2 });
    expect(await stocks.getAvailable(bosDepo, variantId)).toMatchObject({ reservedQty: 0, availableQty: 6 });
  });

  it('partiye çıpalı ayırma başka deponun partisini isteyemez', async () => {
    const parti = await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 5, expiryDate: dayOffset(30) });

    await expect(
      reservations.reserve({ orderId: orderId(), variantId, warehouseId: bosDepo, qty: 1, stockId: parti.id }),
    ).rejects.toThrow();
  });
});

describe('transfer — iki fiziksel gerçek an', () => {
  it('sevk kaynaktan düşer, kabul hedefte YENİ parti doğurur (kimlik korunur)', async () => {
    const kaynak = await stocks.insert({
      variantId,
      warehouseId: doluDepo,
      physicalQty: 10,
      expiryDate: dayOffset(120),
      lotNumber: 'LOT-TRF-1',
      purchasePriceCents: 350,
    });

    const sevk = await transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: kaynak.id, qty: 4 }] });
    expect(sevk.referenceNo).toMatch(/^TRF-/);

    // Yoldaki mal HİÇBİR depoda satılabilir değil: kaynaktan düştü, hedefte henüz doğmadı.
    expect(await stocks.getAvailable(doluDepo, variantId)).toMatchObject({ physicalQty: 6 });
    expect(await stocks.getAvailable(bosDepo, variantId)).toMatchObject({ physicalQty: 0 });

    const [satir] = await transfers.listLines(sevk.transferId);
    await transfers.receive({ transferId: sevk.transferId, lines: [{ lineId: satir!.id, receivedQty: 4 }] });

    // Hedefte YENİ parti: tarih ve lot kopyalandı, `initialQty` kaynağınkinden bağımsız.
    const hedefPartiler = await stocks.listInStock(bosDepo, variantId);
    expect(hedefPartiler).toHaveLength(1);
    expect(hedefPartiler[0]).toMatchObject({ physicalQty: 4, initialQty: 4, lotNumber: 'LOT-TRF-1' });

    // Kaynak partinin girişteki miktarı BOZULMADI — fark raporu ve tüketim hesabı ona dayanır.
    const kaynakSonrasi = await stocks.getById(kaynak.id);
    expect(kaynakSonrasi).toMatchObject({ physicalQty: 6, initialQty: 10 });
  });

  it('söz verilmiş mal yola çıkamaz — ölçü fiili değil KULLANILABİLİR', async () => {
    const parti = await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 10, expiryDate: dayOffset(120) });
    await reservations.reserve({ orderId: orderId(), variantId, warehouseId: doluDepo, qty: 8 });

    // Fiili 10 ama kullanılabilir 2: fiiliye bakan bir sevk müşterinin malını başka şehre gönderirdi.
    await expect(
      transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: parti.id, qty: 5 }] }),
    ).rejects.toThrow();

    const izinli = await transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: parti.id, qty: 2 }] });
    expect(izinli.ok).toBe(true);
  });

  it('kabul edilmemiş satır bırakan kabul transferi KAPATAMAZ', async () => {
    const a = await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 6, expiryDate: dayOffset(90) });
    const b = await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 6, expiryDate: dayOffset(95) });
    const sevk = await transfers.dispatch({
      toWarehouseId: bosDepo,
      lines: [{ sourceStockId: a.id, qty: 2 }, { sourceStockId: b.id, qty: 3 }],
    });
    const satirlar = await transfers.listLines(sevk.transferId);

    // Tek satır gönderilirse öteki "konuşulmamış" kalır: kaynaktan düşmüş, hedefte doğmamış, yolda
    // da görünmez olurdu — mal sessizce buharlaşırdı.
    await expect(
      transfers.receive({ transferId: sevk.transferId, lines: [{ lineId: satirlar[0]!.id, receivedQty: 2 }] }),
    ).rejects.toThrow();

    // Kayıp BEYAN edilerek kapanır: "0 geldi" ile "hiç konuşulmadı" ayrı şeylerdir.
    const sonuc = await transfers.receive({
      transferId: sevk.transferId,
      lines: satirlar.map((s) => ({ lineId: s.id, receivedQty: s.qty === 3 ? 0 : s.qty })),
    });
    expect(sonuc.createdBatches).toBe(1);
  });

  it('sevk kaydı geri alınır: mal KAYNAK PARTİYE döner, yeni parti doğmaz (19.6)', async () => {
    const kaynak = await stocks.insert({
      variantId,
      warehouseId: doluDepo,
      physicalQty: 10,
      expiryDate: dayOffset(150),
      lotNumber: 'LOT-CANCEL',
    });
    const sevk = await transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: kaynak.id, qty: 4 }] });
    expect((await stocks.getById(kaynak.id))?.physicalQty).toBe(6);

    const geri = await transfers.cancel({ transferId: sevk.transferId, reason: 'Araca yüklenmedi, kayıt yanlış açıldı' });
    expect(geri).toMatchObject({ ok: true, restoredLines: 1 });

    // Mal AYNI partiye döndü: yeni parti açsaydık `initialQty` ve geri çağırma izi bölünürdü (T4).
    expect(await stocks.getById(kaynak.id)).toMatchObject({ physicalQty: 10, initialQty: 10 });
    expect(await stocks.listInStock(bosDepo, variantId)).toHaveLength(0); // hedefte hiçbir şey doğmadı

    // Kayıt SİLİNMEDİ, damgalandı: `reference_no` kâğıt klasördeki numaradır, karşılıksız kalamaz.
    const kayit = (await transfers.listForWarehouses([doluDepo])).rows.find((t) => t.id === sevk.transferId);
    expect(kayit).toMatchObject({ status: 'cancelled', cancelReason: 'Araca yüklenmedi, kayıt yanlış açıldı' });
    expect(kayit?.cancelledAt).not.toBeNull();

    // Yolda listesinden düştü — "yolda ne var" sorusunun tek kaynağı bu kayıt.
    expect((await transfers.listInTransit(bosDepo)).map((t) => t.id)).not.toContain(sevk.transferId);
  });

  it('geri alma İKİ KEZ çalışmaz ve kabul edilmiş transfer geri alınamaz', async () => {
    const parti = await stocks.insert({ variantId, warehouseId: doluDepo, physicalQty: 8, expiryDate: dayOffset(160) });

    // (1) İkinci geri alma stoğu İKİ KEZ geri yazardı — mal yoktan var olurdu.
    const iptal = await transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: parti.id, qty: 3 }] });
    await transfers.cancel({ transferId: iptal.transferId });
    await expect(transfers.cancel({ transferId: iptal.transferId })).rejects.toThrow();
    expect((await stocks.getById(parti.id))?.physicalQty).toBe(8); // 11 değil

    // (2) Kabul edilmiş transfer: mal hedefte parti olarak DOĞDU, belki satıldı bile. Cevap ters transfer.
    const kabul = await transfers.dispatch({ toWarehouseId: bosDepo, lines: [{ sourceStockId: parti.id, qty: 2 }] });
    const [satir] = await transfers.listLines(kabul.transferId);
    await transfers.receive({ transferId: kabul.transferId, lines: [{ lineId: satir!.id, receivedQty: 2 }] });
    await expect(transfers.cancel({ transferId: kabul.transferId })).rejects.toThrow();
  });
});

describe('tedarik — tek sipariş, iki depoda parçalı kabul (K6)', () => {
  it('fark raporu KÜMÜLATİFTİR — ikinci kabul ilkini yok saymaz', async () => {
    const po = await purchaseOrders.insert({ supplierId, status: 'sent' });
    await db.from('purchase_order_item').insert({ purchase_order_id: po.id, variant_id: variantId, qty: 30 });

    await intakes.receive({
      supplierId,
      warehouseId: doluDepo,
      purchaseOrderId: po.id,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(120) }],
    });

    // İlk kabulden SONRA kalan beklenti 10 olmalı — 30 değil. Ham `qty`'ye bakan bir hesap ikinci
    // depodaki kabul ekranında "20 eksik" derdi, aynı anda PO durumu "tamamlandı" olurdu: sistem
    // aynı soruya iki cevap verirdi.
    const progress = await purchaseOrders.progressOf(po.id);
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ orderedQty: 30, receivedQty: 20, missingQty: 10 });

    await db.from('purchase_order').delete().eq('id', po.id);
  });

  it('ilk kabul siparişi KAPATMAZ, tamamlanınca kapanır', async () => {
    const po = await purchaseOrders.insert({ supplierId, status: 'sent' });
    await db.from('purchase_order_item').insert({ purchase_order_id: po.id, variant_id: variantId, qty: 30 });

    await intakes.receive({
      supplierId,
      warehouseId: doluDepo,
      purchaseOrderId: po.id,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(120) }],
    });
    expect(await purchaseOrders.getById(po.id)).toMatchObject({ status: 'partially_received' });

    // Kalanı BAŞKA depoya gelir — depo bağı siparişe değil kabule takılıdır.
    await intakes.receive({
      supplierId,
      warehouseId: bosDepo,
      purchaseOrderId: po.id,
      lines: [{ variantId, qty: 10, expiryDate: dayOffset(120) }],
    });
    expect(await purchaseOrders.getById(po.id)).toMatchObject({ status: 'received' });

    await db.from('purchase_order').delete().eq('id', po.id);
  });
});

describe('depo kaydı — kurallar veritabanında', () => {
  /**
   * Test KENDİ kargo deposunu kurar ve kendi topluyor (CLAUDE.md §4b).
   *
   * Seed'in bıraktığı `STR` satırına yaslanmak cazipti ama tehlikeli: o satır yoksa insert
   * BAŞARILI olur, test düşer **ve** geride aktif bir kargo deposu bırakır. O satır kısmi unique
   * indeksi işgal ettiği için sonraki seed'in kendi kargo deposunu yazması da imkânsızlaşır —
   * düşen bir test yerel ortamı kalıcı bozardı. Ülke `DE` seçildi: FR'deki gerçek kargo deposuyla
   * hiç yarışmaz.
   */
  it('ülke başına ikinci aktif kargo deposu açılamaz, başka ülkede serbesttir', async () => {
    const ilk = await createTestWarehouse(db, { label: 'SHIP', countryCode: 'DE', shipsOnline: true });
    try {
      await expect(
        createTestWarehouse(db, { label: 'SHIP2', countryCode: 'DE', shipsOnline: true }),
      ).rejects.toThrow();

      // Aynı anda BAŞKA ülkede kargo deposu açılabilmeli — kısıt ülke başına.
      const baskaUlke = await createTestWarehouse(db, { label: 'SHIPFR', countryCode: 'FR', shipsOnline: false });
      expect(baskaUlke.id).toBeTruthy();
      await purgeTestData(db, { warehouseIds: [baskaUlke.id] });
    } finally {
      await purgeTestData(db, { warehouseIds: [ilk.id] });
    }
  });

  it('reorder TEK turda sıralar — yarı sıralı ara hâl yok (talep §5a)', async () => {
    // Depo sırası her seçicide okunuyor (bağlam · süzgeç · transfer hedefi). Satır satır `update`
    // atılırsa aradaki bir okuma iki depoyu aynı `sortOrder` ile görür; `reorderBy` tek turda yazar.
    const a = await createTestWarehouse(db, { label: 'ORD1' });
    const b = await createTestWarehouse(db, { label: 'ORD2' });
    try {
      await warehouses.reorder([b.id, a.id]);
      const sirali = (await warehouses.list({ warehouseIds: [a.id, b.id] })).map((w) => w.id);
      expect(sirali).toEqual([b.id, a.id]);

      // Tersine çevir: sıra kalıcı bir alan, çağrının yan etkisi değil.
      await warehouses.reorder([a.id, b.id]);
      expect((await warehouses.list({ warehouseIds: [a.id, b.id] })).map((w) => w.id)).toEqual([a.id, b.id]);
    } finally {
      await purgeTestData(db, { warehouseIds: [a.id, b.id] });
    }
  });
});
