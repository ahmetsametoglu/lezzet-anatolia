import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StockIntakeService } from './stock-intake.service';
import { StockService } from './stock.service';
import { SupplierService } from './supplier.service';

/**
 * **Kabul defteri** (22.28) — "ne geldi" sorusunun okuma tarafı.
 *
 * Buradaki iddiaların üçü de SESSİZ arıza sınıfından: hiçbiri ekranı kırmaz, hepsi yanlış bir sayıyı
 * doğru gibi gösterir. Depo süzgeci düşerse defter başka şehrin kabullerini kendi kaydı gibi
 * listeler; sıra `date`e kayarsa operatörün az önce yazdığı kayıt listenin ortasına düşer ve
 * bulunamadığı için mal İKİNCİ kez girilir; `physical_qty` toplanırsa satılmış partiler geçmişteki
 * kabulü küçültür ve fark denetimi sessizce yanılır.
 *
 * İki depo kuruluyor çünkü süzgeç ancak ikincisi varken sınanabilir: tek depolu veride süzgeci
 * unutulan bir okuma da DOĞRU cevap verir (`CLAUDE §1` — depo bir boyut değil değişmezdir).
 */
const db = serviceDb();
const intakes = new StockIntakeService(db);
const stocks = new StockService(db);
const purchases = new PurchaseOrderService(db);

const stamp = Date.now();

let categoryId: string;
let productId: string;
let variantId: string;
let supplierId: string;
/** Defterin sahibi depo. */
let warehouseId: string;
/** Komşu depo — buraya yazılan kabul ötekinin defterinde GÖRÜNMEMELİ. */
let otherWarehouseId: string;

/** Sipariş bağlı kabul (kapanmış PO'nun numarası okunabilmeli). */
let purchaseOrderId: string;
let purchaseRef: string | null;

/** Kabul kimlikleri — kurulum sırasıyla; defter bunları TERS sırada döndürmeli. */
let firstIntakeId: string;
let backdatedIntakeId: string;
let otherIntakeId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DEF' })).id;
  otherWarehouseId = (await createTestWarehouse(db, { label: 'KOM' })).id;
  supplierId = (await new SupplierService(db).insert({ name: `Defter tedarikçisi ${stamp}` })).id;

  const category = await new CategoryService(db).create({ name: { tr: `Defter ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kayısı reçeli ${stamp}` },
    categoryId: category.id,
    shelfLifeDays: 365,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const draft = await purchases.createDraft(supplierId, [{ variantId, qty: 12 }]);
  purchaseOrderId = draft.order.id;
  purchaseRef = draft.order.referenceNo;

  // (1) Siparişli kabul — İKİ kalem, yani iki parti. Kalem sayısı buradan sayılacak.
  firstIntakeId = (
    await intakes.receive({
      supplierId,
      warehouseId,
      purchaseOrderId,
      date: dayOffset(0),
      lines: [
        { variantId, qty: 8, expiryDate: dayOffset(200), lotNumber: `L1-${stamp}`, unitCostCents: 250 },
        { variantId, qty: 4, expiryDate: dayOffset(240), lotNumber: `L2-${stamp}`, unitCostCents: 250 },
      ],
    })
  ).intakeId;

  // (2) SİPARİŞSİZ ve GERİYE DÖNÜK tarihli kabul: irsaliye günü dünden, kaydın yazıldığı an ŞİMDİ.
  // Sıra iddiasının çekirdeği bu — `date`e göre sıralayan bir defter bunu birincinin ARDINA koyar.
  backdatedIntakeId = (
    await intakes.receive({
      warehouseId,
      date: dayOffset(-3),
      note: 'rampada sayıldı',
      lines: [{ variantId, qty: 5, expiryDate: dayOffset(180), unitCostCents: 300 }],
    })
  ).intakeId;

  // (3) KOMŞU deponun kabulü — hiçbir iddiada görünmemeli.
  otherIntakeId = (
    await intakes.receive({
      supplierId,
      warehouseId: otherWarehouseId,
      date: dayOffset(0),
      lines: [{ variantId, qty: 7, expiryDate: dayOffset(300), unitCostCents: 250 }],
    })
  ).intakeId;
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

describe('kabul defteri · listRecent (22.28)', () => {
  it('DEPO SÜZGECİ tutar — komşu deponun kabulü defterde görünmez', async () => {
    const page = await intakes.listRecent({ warehouseIds: [warehouseId] });
    const ids = page.rows.map((row) => row.id);

    expect(ids).toContain(firstIntakeId);
    expect(ids).toContain(backdatedIntakeId);
    // Asıl iddia: süzgeç düşse bu satır da gelirdi ve operatör onu kendi kaydı sanırdı.
    expect(ids).not.toContain(otherIntakeId);
  });

  it('BOŞ dizi "hiçbiri" demek, "hepsi" değil', async () => {
    // Kapsamı boş bir personele bütün depoların defterini göstermek, süzgecin var oluş sebebini
    // tersine çevirirdi (`stock.service.ts` ile aynı sözleşme).
    expect(await intakes.listRecent({ warehouseIds: [] })).toEqual({ rows: [], nextCursor: null });
  });

  it('SIRA kayıt anından — geriye dönük tarihli kabul yine BAŞTA durur', async () => {
    const page = await intakes.listRecent({ warehouseIds: [warehouseId] });
    const kendi = page.rows.filter((row) => row.id === firstIntakeId || row.id === backdatedIntakeId);

    // İkinci yazılan kayıt (irsaliyesi 3 gün eski) listenin başında: "az önce ne girdim" sorusunun
    // cevabı budur. `date` sıralaması bu satırı üç gün geriye atardı ve operatör onu göremezdi.
    expect(kendi[0]?.id).toBe(backdatedIntakeId);
    expect(kendi[1]?.id).toBe(firstIntakeId);
    expect(kendi[0]?.date).toBe(dayOffset(-3));
  });

  it('SİPARİŞSİZ kabul de deftere girer — tedarikçi ve sipariş boş olabilir', async () => {
    const page = await intakes.listRecent({ warehouseIds: [warehouseId] });
    const row = page.rows.find((r) => r.id === backdatedIntakeId);

    // Siparişsiz kabul bir eksiklik değil ayrı bir yoldur (dökme/plansız alım); defter onu
    // dışlasaydı depoya giren malın bir kısmı hiçbir yerden okunamazdı.
    expect(row?.supplierId).toBeNull();
    expect(row?.purchaseOrderId).toBeNull();
    expect(row?.note).toBe('rampada sayıldı');
  });

  it('sayfa TAVANI imleç üretir — defter sınırsız büyür, sessizce kırpılmaz', async () => {
    const page = await intakes.listRecent({ warehouseIds: [warehouseId], limit: 1 });

    expect(page.rows).toHaveLength(1);
    // İmleç yoksa ekran "hepsi bu" der; oysa ikinci kayıt duruyor (`CLAUDE §1` — sayfalayan her
    // okumanın tüketeni olmalı).
    expect(page.nextCursor).not.toBeNull();

    const next = await intakes.listRecent({ warehouseIds: [warehouseId], limit: 1, cursor: page.nextCursor! });
    expect(next.rows[0]?.id).toBe(firstIntakeId);
    expect(next.rows[0]?.id).not.toBe(page.rows[0]?.id);
  });
});

describe('kabul defteri · parti özeti', () => {
  it('KALEM sayısı ve GİREN adet partilerden toplanır', async () => {
    const summary = await stocks.summaryByIntake([firstIntakeId, backdatedIntakeId]);

    // İki lot = iki parti = iki kalem; 8 + 4 paket girdi.
    expect(summary.get(firstIntakeId)).toEqual({ lineCount: 2, qty: 12 });
    expect(summary.get(backdatedIntakeId)).toEqual({ lineCount: 1, qty: 5 });
  });

  it('SATILAN mal giriş adedini KÜÇÜLTMEZ — defter "ne geldi" der, "ne kaldı" değil', async () => {
    const batches = await stocks.listByVariant(warehouseId, variantId);
    const batch = batches.find((row) => row.intakeId === backdatedIntakeId);
    expect(batch).toBeDefined();

    // Partinin fiilisi erisin: satış, imha, hazırlık — hepsi bu alanı düşürür.
    await stocks.setPhysicalQty(batch!.id, 1);

    const summary = await stocks.summaryByIntake([backdatedIntakeId]);
    // `physical_qty` toplansaydı burada 1 çıkardı ve geçmişteki kabul küçülmüş görünürdü; fark
    // denetimi ("sipariş 12, gelen 5") aylar sonra sessizce yanlış cevap verirdi.
    expect(summary.get(backdatedIntakeId)?.qty).toBe(5);
  });

  it('BOŞ kimlik listesi boş harita döner — sorgu bile atılmaz', async () => {
    expect(await stocks.summaryByIntake([])).toEqual(new Map());
  });
});

describe('kabul defteri · sipariş künyesi', () => {
  it('KAPANMIŞ siparişin numarası okunabiliyor — `listOpen` onu artık vermez', async () => {
    // 12 adetlik siparişin tamamı geldi, yani sipariş `received`e döndü ve açık listeden çıktı.
    const open = await purchases.listOpen();
    expect(open.map((order) => order.id)).not.toContain(purchaseOrderId);

    const rows = await purchases.listByIds([purchaseOrderId]);
    // Numara okunamasaydı defter satırı "siparişsiz kabul" derdi — doğru bilgi yokluğa dönüşürdü.
    expect(rows[0]?.referenceNo).toBe(purchaseRef);
  });

  it('BOŞ kimlik listesi boş dizi döner', async () => {
    expect(await purchases.listByIds([])).toEqual([]);
  });
});
