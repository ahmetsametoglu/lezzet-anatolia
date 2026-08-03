import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { ReorderService } from './reorder.service';
import { StockIntakeService } from './stock-intake.service';
import { StockService } from './stock.service';
import { SupplierProductService, SupplierService } from './supplier.service';

/**
 * Tedarik zinciri (06.8–06.11) — DB üstünde. Zincirin bütünü doğrulanır:
 * eşik altı öneri → PO taslağı → mal kabul → partiler + PO kapanışı + son alış fiyatı.
 */
const db = serviceDb();
const suppliers = new SupplierService(db);
const mappings = new SupplierProductService(db);
const orders = new PurchaseOrderService(db);
const intakes = new StockIntakeService(db);
const stocks = new StockService(db);
const reorder = new ReorderService(db);

let supplierId: string;
let variantId: string;
let productId: string;
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
const createdSuppliers: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'TED' })).id;
  const stamp = Date.now();
  const category = await new CategoryService(db).create({ name: { tr: `Tedarik testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `İçli köfte ${stamp}` },
    categoryId: category.id,
    shelfLifeDays: 300,
    variants: [{ label: { tr: '500gr' }, minStockQty: 20 }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const supplier = await suppliers.insert({ name: `Anadolu Gıda ${stamp}`, paymentTermDays: 30 });
  supplierId = supplier.id;
  createdSuppliers.push(supplier.id);
  await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
});

beforeEach(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
});

// Tedarik grafiği `restrict` FK'lerle bağlı: giriş → sipariş → tedarikçi sırasıyla toplanır.
afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: createdSuppliers,
    warehouseIds: [warehouseId],
  });
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Testin ürettiği tedarik numarası — **sayaçlı**, damgalı değil. `Date.now()` aynı milisaniyede iki
 * kez çağrılabilir ve numara UNIQUE; damga kullanan bir yardımcı arada bir, tekrarlanmayan biçimde
 * düşerdi (`CLAUDE.md §4b`: yalancı düşüş yavaş koşudan pahalıdır).
 */
let refCounter = 0;
function testRef(): string {
  refCounter += 1;
  return `TS-26-T${String(Date.now()).slice(-4)}${String(refCounter).padStart(2, '0')}`;
}

describe('tedarikçi ve kod eşlemesi (06.8)', () => {
  it('aynı varyant aynı tedarikçide iki kez tanımlanmaz — kod değişirse satır güncellenir', async () => {
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-9999' });

    const mapped = await mappings.listBySupplier(supplierId);
    expect(mapped.filter((m) => m.variantId === variantId)).toHaveLength(1);
    expect(mapped.find((m) => m.variantId === variantId)?.supplierCode).toBe('AG-9999');
    await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', packQty: 12 });
  });

  it('tercihli işareti tekildir — ikinci tedarikçi tercihli olunca ilki düşer', async () => {
    const second = await suppliers.insert({ name: `Alternatif Gıda ${Date.now()}` });
    createdSuppliers.push(second.id);
    const a = await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', isPreferred: true });
    const b = await mappings.setMapping({ supplierId: second.id, variantId, supplierCode: 'ALT-77' });

    await mappings.setPreferred(b.id);
    const sources = await mappings.listByVariant(variantId);
    expect(sources.find((m) => m.id === b.id)?.isPreferred).toBe(true);
    expect(sources.find((m) => m.id === a.id)?.isPreferred).toBe(false);
    await mappings.setPreferred(a.id); // sonraki testler için tercihliyi geri al
  });

  it('borç türetilir: girişler − ödemeler', async () => {
    await intakes.receive({
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 10, expiryDate: dayOffset(250), unitCostCents: 400 }],
    });

    // Ödeme tarafı 12.3'te bağlandı; buradaki sözleşme yalnız denklemin kendisidir
    // (ödemenin borcu gerçekten kapattığı `apps/web/lib/money/supplier-debt.test.ts`'te).
    const debt = await suppliers.debt(supplierId);
    expect(debt.intakeTotalCents).toBeGreaterThanOrEqual(4000);
    expect(debt.balanceCents).toBe(debt.intakeTotalCents - debt.paidCents);
  });

  /**
   * Dönemli toplam (tedarik talebi §6) — kart "bu yıl ne kadar iş yaptık" soruyor, ömür boyu toplam
   * o soruya cevap vermiyor. Kendi kurduğumuz girişleri sayıyoruz, küresel sayıya bakmıyoruz
   * (`CLAUDE.md §4b`).
   */
  it('dönem verilince yalnız o aralığın girişleri sayılır', async () => {
    const gecmis = await suppliers.debt(supplierId, { to: new Date(Date.now() - 86_400_000) });
    // Bu testin girişleri az önce yazıldı; dünden öncesi onları GÖRMEMELİ.
    expect(gecmis.intakeTotalCents).toBe(0);

    const bugun = await suppliers.debt(supplierId, { from: new Date(Date.now() - 86_400_000) });
    expect(bugun.intakeTotalCents).toBeGreaterThanOrEqual(4000);
  });

  it('dönemsiz çağrı bugünkü davranışı korur — hiçbir çağıran kırılmaz', async () => {
    expect(await suppliers.debt(supplierId)).toEqual(await suppliers.debt(supplierId, {}));
  });
});

describe('tedarik siparişi (06.9)', () => {
  it('taslak kalemleri tedarikçi koduyla eşleşir; liste onun diliyle çıkar', async () => {
    const { order, items } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }], 'Haftalık sipariş');
    expect(order.status).toBe('draft');
    expect(items[0]!.supplierProductId).not.toBeNull();

    const printable = await orders.printableList(order.id);
    expect(printable[0]).toEqual({ supplierCode: 'AG-1234', nameAtSupplier: 'Icli kofte 500g', qty: 24, packQty: 12 });
  });

  it('gönderim işareti insana aittir; kalemsiz taslak açılmaz', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 12 }]);
    const gonderilen = await orders.markSent(order.id, testRef());
    expect(gonderilen.status).toBe('sent');
    expect(gonderilen.sentAt).not.toBeNull();

    await expect(orders.createDraft(supplierId, [])).rejects.toThrow();
  });

  it('mal gelmiş sipariş iptal edilemez — zincir kopmaz', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 12 }]);
    await intakes.receive({ warehouseId, supplierId, purchaseOrderId: order.id, lines: [{ variantId, qty: 12, expiryDate: dayOffset(250) }] });

    await expect(orders.cancel(order.id)).rejects.toThrow();
  });
});

describe('mal kabul (06.10)', () => {
  it('partiler girişe bağlanır, PO kapanır, son alış fiyatı tazelenir — tek işlemde', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);

    const outcome = await intakes.receive({
      warehouseId,
      supplierId,
      purchaseOrderId: order.id,
      lines: [
        { variantId, qty: 12, expiryDate: dayOffset(250), lotNumber: 'LOT-A', unitCostCents: 350, location: 'Dolap 1' },
        { variantId, qty: 12, expiryDate: dayOffset(280), lotNumber: 'LOT-B', unitCostCents: 350 },
      ],
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.stockIds).toHaveLength(2);
    expect(outcome.totalAmountCents).toBe(8400); // 24 × 3,50 €

    const batches = await stocks.listByVariant(warehouseId, variantId);
    expect(batches.every((p) => p.intakeId === outcome.intakeId)).toBe(true);
    expect(batches.find((p) => p.lotNumber === 'LOT-A')?.location).toBe('Dolap 1');

    expect((await orders.getById(order.id))?.status).toBe('received');
    expect((await mappings.listByVariant(variantId)).find((m) => m.supplierId === supplierId)?.lastPurchasePriceCents).toBe(350);
  });

  it('eksik gelen mal fark olarak görünür — parti satılsa bile rakam erimez', async () => {
    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 24 }]);
    const outcome = await intakes.receive({
      warehouseId,
      supplierId,
      purchaseOrderId: order.id,
      lines: [{ variantId, qty: 20, expiryDate: dayOffset(250) }],
    });

    // Kabulden sonra partiden satış/fire olsa da "gelen" 20 kalır: giriş miktarı tarihtir.
    await stocks.setPhysicalQty(outcome.stockIds[0]!, 5);

    const diff = await intakes.orderVsReceived(order.id);
    expect(diff.find((f) => f.variantId === variantId)).toMatchObject({ orderedQty: 24, receivedQty: 20, diff: -4 });
  });

  it('kalemsiz mal kabul yapılamaz', async () => {
    await expect(intakes.receive({ warehouseId, supplierId, lines: [] })).rejects.toThrow();
  });
});

describe('"sipariş zamanı" önerisi (06.11)', () => {
  it('eşik altı varyant tedarikçisine göre gruplanır ve koliye yuvarlanır', async () => {
    await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(250) }); // eşik 20

    const groups = await reorder.suggestions(warehouseId);
    const group = groups.find((g) => g.supplierId === supplierId);
    const row = group?.lines.find((l) => l.variantId === variantId);

    expect(row).toMatchObject({ availableQty: 5, minStockQty: 20, supplierCode: 'AG-1234' });
    expect(row?.suggestedQty).toBe(24); // 15 gerekiyor, koli 12 → 2 koli
  });

  it('öneriden tek dokunuşla PO taslağı çıkar', async () => {
    await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(250) });

    const group = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId)!;
    const { order, items } = await reorder.createDraftFrom(group, 'Eşik altı otomatik taslak');

    expect(order.supplierId).toBe(supplierId);
    expect(items.find((i) => i.variantId === variantId)?.qty).toBe(24);
  });

  it('tedarikçisi eşlenmemiş kalemlerden sipariş açılmaz (açıkça reddedilir)', async () => {
    await expect(reorder.createDraftFrom({ supplierId: null, warehouseId, lines: [] })).rejects.toThrow();
  });

  /**
   * "Yolda" hesabı (09.14 üçüncü talep · kullanıcı bulgusu): sipariş verdikten sonra öneri satırı
   * OLDUĞU GİBİ duruyordu. Sipariş stoğu değiştirmez (mal gelmedi), o yüzden eşik hâlâ delikti —
   * davranış tanıma göre doğru ama sonucu arıza: aynı tedarikçiye üst üste basmak ikinci siparişi
   * açıyordu ve hiçbir yerde uyarı yoktu.
   */
  describe('öneri açık siparişleri görür', () => {
    /**
     * Bu blokta açılan siparişler her testten sonra TOPLANIR.
     *
     * Şart, çünkü dosyanın önceki testleri de açık sipariş bırakıyor ve "yolda" hesabı tam olarak
     * onları okuyor: temizlik olmadan ikinci test birincinin siparişini görür ve satır beklenmedik
     * yerde düşerdi. Mutlak sayı yerine FARK ölçen iddialar da aynı sebeple (`CLAUDE.md §4b`).
     */
    const acilanlar: string[] = [];
    afterEach(async () => {
      for (const id of acilanlar.splice(0)) await db.from('purchase_order').delete().eq('id', id);
    });

    /** Bu varyantın o andaki öneri satırı — yoksa `undefined` (eksik kapanmış demektir). */
    async function öneriSatiri() {
      return (await reorder.suggestions(warehouseId))
        .find((g) => g.supplierId === supplierId)
        ?.lines.find((l) => l.variantId === variantId);
    }

    beforeEach(async () => {
      await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(250) });
    });

    it('taslak açılınca satır DÜŞMEZ ama "taslakta" olarak görünür — tedarikçi haberdar değil', async () => {
      const önceki = (await öneriSatiri())?.draftQty ?? 0;
      const grup = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId)!;
      const { order } = await reorder.createDraftFrom(grup, 'Test');
      acilanlar.push(order.id);

      const satir = await öneriSatiri();
      // Taslak eşiğe GİRMEZ: açıp göndermeyi unuttuğumuz bir taslak eksiği "kapatmış" görünseydi
      // raf sessizce boş kalırdı.
      expect(satir).toBeDefined();
      expect((satir?.draftQty ?? 0) - önceki).toBe(24);
      expect(satir?.incomingQty).toBe(0);
    });

    it('GÖNDERİLİNCE satır düşer — mal yolda, ikinci sipariş açılmamalı', async () => {
      const grup = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId)!;
      const { order } = await reorder.createDraftFrom(grup, 'Test');
      acilanlar.push(order.id);
      await orders.markSent(order.id, testRef());

      // Asıl bulgunun kapanışı: eksik 15 (20 − 5), yolda 24 → satır artık öneri değil.
      expect(await öneriSatiri()).toBeUndefined();
    });

    it('öneriden açılan sipariş HEDEF DEPOYU taşır — yoksa "yolda" hiç hesaplanamazdı', async () => {
      const grup = (await reorder.suggestions(warehouseId)).find((g) => g.supplierId === supplierId)!;
      expect(grup.warehouseId).toBe(warehouseId);

      const { order, items } = await reorder.createDraftFrom(grup, 'Test');
      acilanlar.push(order.id);
      expect(items[0]?.targetWarehouseId).toBe(warehouseId);
    });

    it('HEDEFSİZ sipariş hiçbir deponun eksiğini kapatmaz — ama görünür kalır', async () => {
      const önceki = (await öneriSatiri())?.unassignedQty ?? 0;

      // Elle açılmış, hedefi yazılmamış sipariş: mal fiilen nereye inecek bilinmiyor (C7/K6).
      const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 100 }]);
      acilanlar.push(order.id);
      await orders.markSent(order.id, testRef());

      const satir = await öneriSatiri();
      // 100 adet yolda ama hangi depoya? Bilinmiyor → eksik KAPANMADI sayılır, sayı ayrı gösterilir.
      // Bakılan depoya saymak malın oraya geleceğini varsaymaktı ve K6 tam bunu yasaklıyor.
      expect(satir).toBeDefined();
      expect(satir?.incomingQty).toBe(0);
      expect((satir?.unassignedQty ?? 0) - önceki).toBe(100);
    });
  });

  it('stok eşiğin üstündeyse öneri çıkmaz', async () => {
    await stocks.insert({ variantId, warehouseId, physicalQty: 50, expiryDate: dayOffset(250) });

    const groups = await reorder.suggestions(warehouseId);
    expect(groups.flatMap((g) => g.lines).find((l) => l.variantId === variantId)).toBeUndefined();
  });
});

/**
 * Siparişler ekranının sayfası (09.14) — `listRows`.
 *
 * Buradaki iddia okumanın DOĞRULUĞU değil yalnız; **tek turda ifade edilebildiği**. Zincir üç
 * yabancı anahtar üzerinden gidiyor (`purchase_order → supplier`, `stock → purchase_order_item`,
 * `stock → warehouse`) ve gömülü select onu taşıyabiliyorsa RPC eşiği geçilmiyor (`STACK §13`).
 * Gömme bozulursa (FK kalkar, alan adı değişir) bu testler kırılır — sessizce N+1'e düşülmez.
 */
describe('tedarik siparişi listesi (09.14)', () => {
  it('satır tedarikçiyi, kalemleri ve GİREN partileri tek turda taşır', async () => {
    const { order, items } = await orders.createDraft(supplierId, [{ variantId, qty: 10, unitPriceCents: 450 }]);
    await orders.markSent(order.id, testRef());
    await intakes.receive({
      warehouseId,
      supplierId,
      purchaseOrderId: order.id,
      lines: [{ variantId, qty: 6, expiryDate: dayOffset(200), unitCostCents: 450, purchaseOrderItemId: items[0]!.id }],
    });

    const satir = (await orders.listRows({ supplierId })).rows.find((r) => r.id === order.id);

    expect(satir?.supplier?.name).toContain('Anadolu Gıda');
    expect(satir?.items).toHaveLength(1);
    // Depo kırılımı FİİLEN giren partiden çıkar — kalemin hedef deposundan değil (K6).
    expect(satir?.items[0]?.batches[0]).toMatchObject({ initialQty: 6 });
    expect(satir?.items[0]?.batches[0]?.warehouse?.id).toBe(warehouseId);
  });

  it('keyset imleci kurulur — liste sonsuz kaydırmaya açık', async () => {
    await orders.createDraft(supplierId, [{ variantId, qty: 1, unitPriceCents: 100 }]);
    await orders.createDraft(supplierId, [{ variantId, qty: 2, unitPriceCents: 100 }]);

    const ilk = await orders.listRows({ supplierId, limit: 1 });
    expect(ilk.rows).toHaveLength(1);
    expect(ilk.nextCursor).not.toBeNull();

    const ikinci = await orders.listRows({ supplierId, limit: 1, cursor: ilk.nextCursor! });
    expect(ikinci.rows[0]?.id).not.toBe(ilk.rows[0]?.id);
  });

  it('bekleyen sayacı yalnız GÖNDERİLMİŞ ve kapanmamışları sayar', async () => {
    // Sayaç KENDİ tedarikçimizle daraltılıyor: küresel sayıya bakan test, başka bir ajanın açtığı
    // siparişle oynar ve tekrarlanmayan bir düşüş üretir (`CLAUDE.md §4b`).
    const önce = await orders.countPending(supplierId);

    const { order } = await orders.createDraft(supplierId, [{ variantId, qty: 3, unitPriceCents: 100 }]);
    // Taslak henüz gönderilmedi: "yolda" değil.
    expect(await orders.countPending(supplierId)).toBe(önce);

    await orders.markSent(order.id, testRef());
    expect(await orders.countPending(supplierId)).toBe(önce + 1);

    await orders.cancel(order.id);
    expect(await orders.countPending(supplierId)).toBe(önce);
  });
});

/**
 * Tedarik ailesinin euro↔cent sınırı (02.9 dilim 4 · `STACK §8`).
 *
 * Kolon HAM okunur (`db.from(...).select(...)`), servisten değil: iki tarafı da servisten okuyan bir
 * test, dönüşüm yanlış sabitle yapılsa bile geçerdi — gidiş ve dönüş aynı hatayı taşırdı. Sınırın
 * doğrulanması ancak kolonun kendi birimine bakarak mümkün.
 *
 * Üç kapı da ayrı ayrı sınanıyor, çünkü üçü ayrı yollardan geçiyor: eşleme ve PO kalemi taban
 * sınıfın `moneyFields` eşlemesinden, mal kabul ise RPC'den (jsonb — eşlemenin dışında).
 */
describe('euro↔cent sınırı (02.9)', () => {
  it('eşlemenin son alışı: cent yazılır, kolon euro tutar, cent okunur', async () => {
    const mapping = await mappings.setMapping({ supplierId, variantId, supplierCode: 'AG-1234', lastPurchasePriceCents: 1234 });
    expect(mapping.lastPurchasePriceCents).toBe(1234);

    const { data } = await db.from('supplier_product').select('last_purchase_price').eq('id', mapping.id).single();
    expect(Number((data as { last_purchase_price: number | string }).last_purchase_price)).toBe(12.34);

    expect((await mappings.getById(mapping.id))?.lastPurchasePriceCents).toBe(1234);
  });

  it('PO kaleminin beklenen alışı: cent yazılır, kolon euro tutar, cent okunur', async () => {
    const { order, items } = await orders.createDraft(supplierId, [{ variantId, qty: 2, unitPriceCents: 675 }]);
    expect(items[0]!.unitPriceCents).toBe(675);

    const { data } = await db.from('purchase_order_item').select('unit_price').eq('id', items[0]!.id).single();
    expect(Number((data as { unit_price: number | string }).unit_price)).toBe(6.75);

    // Liste satırı GÖMÜLÜ kalemden okuyor — ayrı bir dönüşüm yolu, ayrıca doğrulanmalı.
    const satir = (await orders.listRows({ supplierId })).rows.find((r) => r.id === order.id);
    expect(satir?.items[0]?.unitPriceCents).toBe(675);
  });

  it('mal kabul RPC’si: cent gider, kolonlar euro tutar, cent döner', async () => {
    const outcome = await intakes.receive({
      warehouseId,
      supplierId,
      lines: [{ variantId, qty: 4, expiryDate: dayOffset(240), unitCostCents: 1105 }],
    });
    expect(outcome.totalAmountCents).toBe(4420); // 4 × 11,05 €

    const { data: giris } = await db.from('stock_intake').select('total_amount').eq('id', outcome.intakeId).single();
    expect(Number((giris as { total_amount: number | string }).total_amount)).toBe(44.2);
    const { data: parti } = await db.from('stock').select('purchase_price').eq('id', outcome.stockIds[0]!).single();
    expect(Number((parti as { purchase_price: number | string }).purchase_price)).toBe(11.05);

    expect((await intakes.getById(outcome.intakeId))?.totalAmountCents).toBe(4420);
  });
});
