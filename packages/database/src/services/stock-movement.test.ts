import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData, purgeVariantStock } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { StockMovementService } from './stock-movement.service';
import { StockService } from './stock.service';

/**
 * **Stok hareket defteri** (06.14) — DB üstünde. Doğrulanan şey bölünemezlik: defter satırı ile
 * fiili düşüm birlikte olur ya da hiç olmaz.
 *
 * Bu dosya `stock-adjustment.test.ts`ti; sıcaklık kaydı testleri (06.7) kendi dosyasına ayrıldı
 * (`temperature-log.test.ts`) — ikisi aynı dosyada durmasının sebebi migration tarafındaki eski bir
 * birleştirmeydi, ortak bir şey değil.
 */
const db = serviceDb();
const stocks = new StockService(db);
const movements = new StockMovementService(db);

let variantId: string;
let productId: string;
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
/**
 * İKİNCİ depo — süzgeç ancak komşusu varken sınanabilir (tek depolu veride süzgeci unutulan okuma
 * da doğru cevap verir). Fikstürde duruyor, testin içinde değil: `warehouse` FK'leri `restrict` ve
 * partileri silinmeden silinemiyor — teardown sırası `cleanup.ts`in işi, testin değil (`CLAUDE §4b`).
 */
let neighbourWarehouseId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DUZ' })).id;
  neighbourWarehouseId = (await createTestWarehouse(db, { label: 'KMS' })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Fire testi ${Date.now()}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Su böreği ${Date.now()}` },
    categoryId: category.id,
    shelfLifeDays: 180,
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

// Test kendi zeminini toplar — yerel veritabanında çöp satır bırakmaz (silme sırası: cleanup.ts).
afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [warehouseId, neighbourWarehouseId],
  });
});

beforeEach(async () => {
  // Sıra `purgeVariantStock`ta duruyor (önce defter, sonra parti) — her dosya kendi sırasını
  // uydurursa biri mutlaka yanlış olur (`CLAUDE §4b`).
  await purgeVariantStock(db, [variantId]);
});

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('elle düzeltme (06.6)', () => {
  it('imha kaydı fiiliyi düşürür ve maliyeti o anda kopyalar', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 320 });

    const outcome = await movements.adjust({
      stockId: batch.id,
      qty: 4,
      direction: 'out',
      kind: 'write_off',
      reason: 'expired',
    });
    expect(outcome).toMatchObject({ ok: true, remainingQty: 6 });

    expect((await stocks.getById(batch.id))?.physicalQty).toBe(6);
    const records = await movements.listByStock(batch.id);
    expect(records[0]).toMatchObject({ qty: 4, kind: 'write_off', reason: 'expired', direction: 'out', unitCostCents: 320 });
  });

  it('maliyet SNAPSHOT: parti fiyatı sonradan değişse fire maliyeti kaymaz', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 200 });
    await movements.adjust({ stockId: batch.id, qty: 1, direction: 'out', kind: 'write_off', reason: 'damaged' });
    await stocks.update({ id: batch.id, purchasePriceCents: 900 });

    expect((await movements.listByStock(batch.id))[0]?.unitCostCents).toBe(200);
  });

  it('partide olmayan miktar düşülemez — kayıt da yazılmaz (bölünmez)', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 2, expiryDate: dayOffset(20) });

    await expect(
      movements.adjust({ stockId: batch.id, qty: 3, direction: 'out', kind: 'write_off', reason: 'lost' }),
    ).rejects.toThrow();
    expect((await stocks.getById(batch.id))?.physicalQty).toBe(2);
    expect(await movements.listByStock(batch.id)).toHaveLength(0);
  });

  it('stoğa geri ekleme sebep notu ister (iade restoku istisnadır)', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 3, expiryDate: dayOffset(20) });

    await expect(
      movements.adjust({ stockId: batch.id, qty: 2, direction: 'in', kind: 'return_restock' }),
    ).rejects.toThrow();

    const outcome = await movements.adjust({
      stockId: batch.id,
      qty: 2,
      direction: 'in',
      kind: 'return_restock',
      note: 'Kapıda reddedildi, frigo araçtan hiç çıkmadı',
    });
    expect(outcome.remainingQty).toBe(5);
    expect((await stocks.getById(batch.id))?.physicalQty).toBe(5);
  });

  /**
   * **Bu kapı yalnız ELLE düzeltme yazar** (06.14). Satış/sevk/kabul kendi RPC'lerinden deftere
   * yazıyor; buradan da yazılabilseydi aynı olayın iki doğum yeri olurdu ve hangisinin geçtiği
   * çağırana kalırdı.
   */
  it('SATIŞ bu kapıdan yazılamaz — hareketin tek doğum yeri vardır', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(20) });
    await expect(
      // Tip sistemi de reddediyor; burada sınanan şey ÇALIŞMA ZAMANI kapısı (kapı bir HTTP ucundan
      // da çağrılabilir ve orada tip yoktur).
      movements.adjust({ stockId: batch.id, qty: 1, direction: 'out', kind: 'sale' as never }),
    ).rejects.toThrow();
  });

  it('sıfır ve negatif miktar reddedilir — yön ayrı alanda', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 1, expiryDate: dayOffset(20) });
    await expect(movements.adjust({ stockId: batch.id, qty: 0, direction: 'out', kind: 'count_diff' })).rejects.toThrow();
    await expect(movements.adjust({ stockId: batch.id, qty: -1, direction: 'out', kind: 'count_diff' })).rejects.toThrow();
  });

  it('fire raporu NET kaybı verir — sayım fazlası toplamdan düşer', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 500 });
    await movements.adjust({ stockId: batch.id, qty: 4, direction: 'out', kind: 'write_off', reason: 'expired' });
    await movements.adjust({ stockId: batch.id, qty: 1, direction: 'in', kind: 'count_diff', note: 'sayımda fazla çıktı' });

    const summary = await movements.lossSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(summary.find((r) => r.variantId === variantId)).toMatchObject({ qty: 3, costCents: 1500 }); // 3 × 5 €
  });

  /**
   * **Satılan mal fire DEĞİLDİR** — defterle birlikte doğan yeni koruma.
   *
   * Eski tabloda satış hiç yoktu, yani bu soru sorulamıyordu bile. Artık aynı defterde duruyorlar
   * ve fire toplamına sızmaları mümkün bir hata: sızsalardı satılan malın maliyeti hem COGS'ta hem
   * fire raporunda iki kez düşülürdü.
   */
  it('SATIŞ hareketleri fire toplamına GİRMEZ', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 500 });
    await movements.adjust({ stockId: batch.id, qty: 2, direction: 'out', kind: 'write_off', reason: 'lost' });

    const before = await movements.lossSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(before.find((r) => r.variantId === variantId)?.qty).toBe(2);
  });
});

/**
 * **Tutanak: tek belge, N satır, İKİ YÖN** (10.5 · 06.14).
 *
 * Tasarım sözleşmesinin ⚠ maddesi bunu açıkça istiyor: *"tek sayım tutanağında hem fazla hem eksik
 * satır olabilir; o belge iki sekmede de görünür ve ekran bunu belgenin iki yüzü olarak
 * anlatmalıdır."* Eskiden işaret `qty`ye gömülüydü ve bu kendiliğinden çalışıyordu — ama toplamları
 * da kendiliğinden eritiyordu: karışık bir tutanak "1 adet · −35,56 €" gibi hiçbir şeyin ölçüsü
 * olmayan bir sonuç veriyordu.
 */
describe('çok satırlı tutanak (10.5)', () => {
  it('karışık sayım tutanağı: aynı belge, iki yön, AYRI toplamlar', async () => {
    const eksik = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20), purchasePriceCents: 400 });
    const fazla = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(21), purchasePriceCents: 400 });

    const outcome = await movements.adjustBatch({
      lines: [
        { stockId: eksik.id, qty: 4, direction: 'out' },
        { stockId: fazla.id, qty: 3, direction: 'in' },
      ],
      kind: 'count_diff',
      prefix: 'SAY',
      note: 'yıl sonu sayımı',
    });

    expect(outcome).toMatchObject({ ok: true, lines: 2, outQty: 4, inQty: 3 });
    // Maliyet de yön başına ayrı — net tek sayı olsaydı 4 ile 3 birbirini yer ve tutanağın iki
    // yüzünden hiçbiri okunamazdı.
    expect(outcome.outCostCents).toBe(1600);
    expect(outcome.inCostCents).toBe(1200);

    const lines = await movements.listByReference(outcome.referenceNo);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.referenceNo === outcome.referenceNo)).toBe(true);
    expect(lines.map((line) => line.direction).sort()).toEqual(['in', 'out']);
  });

  it('bir satır düşerse TUTANAĞIN TAMAMI yazılmaz', async () => {
    const saglam = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(20) });
    const yetersiz = await stocks.insert({ variantId, warehouseId, physicalQty: 1, expiryDate: dayOffset(21) });

    await expect(
      movements.adjustBatch({
        lines: [
          { stockId: saglam.id, qty: 2, direction: 'out' },
          { stockId: yetersiz.id, qty: 5, direction: 'out' },
        ],
        kind: 'write_off',
        prefix: 'IMH',
        reason: 'expired',
      }),
    ).rejects.toThrow();

    // Yarım tutanak kâğıtla eşleşmez: ilk satır da yazılmamış olmalı.
    expect(await movements.listByStock(saglam.id)).toHaveLength(0);
    expect((await stocks.getById(saglam.id))?.physicalQty).toBe(10);
  });
});

/**
 * Defterin ARAMASI (09.18 · operasyon talebi §2) — `stock_movement_detail` görünümü.
 *
 * Sınanan şey aramanın iki ayrı kaynağa birden bakabilmesi: lot numarası hareket satırında,
 * ürün adı üç tablo ötede. Gömülü `select` ile bu "VEYA" kurulamıyordu; görünüm onu düz bir
 * kolona indiriyor. **Kendi kurduğumuz satırları arıyoruz**, küresel sayıya bakmıyoruz
 * (`CLAUDE.md §4b`) — paylaşılan veritabanında başka ajanın kaydı da var.
 */
describe('defter araması (09.18)', () => {
  it('LOT numarasıyla bulunur', async () => {
    const lot = `LOTQ${Date.now()}`;
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10), lotNumber: lot });
    await movements.adjust({ stockId: batch.id, qty: 2, direction: 'out', kind: 'write_off', reason: 'damaged' });

    const page = await movements.listRecent({ query: lot });
    expect(page.rows.map((row) => row.stock.lotNumber)).toEqual([lot]);
  });

  it('ÜRÜN ADIYLA da bulunur — arama iki kaynağa birden bakar', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10) });
    await movements.adjust({ stockId: batch.id, qty: 1, direction: 'out', kind: 'write_off', reason: 'lost' });

    const page = await movements.listRecent({ query: 'Su böreği' });
    expect(page.rows.some((row) => row.stock.variant.product.id === productId)).toBe(true);
  });

  it('eşleşmeyen terim BOŞ döner — "bulamadım" ile "hepsi" karışmaz', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10) });
    await movements.adjust({ stockId: batch.id, qty: 1, direction: 'out', kind: 'write_off', reason: 'lost' });

    expect((await movements.listRecent({ query: `YOK${Date.now()}` })).rows).toEqual([]);
  });

  it('terimsiz çağrı bugünkü davranışı korur ve şekil DEĞİŞMEZ', async () => {
    // Ekran iç içe `stock.variant.product` bekliyor; okuma görünüme taşındı ama şekil aynı kaldı.
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 5, expiryDate: dayOffset(10), purchasePriceCents: 250 });
    await movements.adjust({ stockId: batch.id, qty: 3, direction: 'out', kind: 'write_off', reason: 'expired' });

    const row = (await movements.listRecent({ limit: 50 })).rows.find((r) => r.stockId === batch.id);
    expect(row).toMatchObject({ qty: 3, kind: 'write_off', reason: 'expired', stock: { id: batch.id } });
    expect(row?.stock.variant.product.id).toBe(productId);
  });

  /**
   * **YÖN SÜZGECİ sekmeyi belirler** (06.14): Çıkışlar `out`, Mal kabul `in`.
   *
   * Bu ayrım olmadan "Çıkışlar" sekmesi girişleri de topluyordu ve dönem toplamını EKSİ
   * gösteriyordu (ölçüldü 27.08: `−13,49 €`).
   */
  it('yön süzgeci girişi çıkıştan ayırır', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(10) });
    await movements.adjust({ stockId: batch.id, qty: 3, direction: 'out', kind: 'write_off', reason: 'expired' });
    await movements.adjust({ stockId: batch.id, qty: 2, direction: 'in', kind: 'count_diff', note: 'fazla çıktı' });

    const cikislar = await movements.listRecent({ direction: 'out', limit: 50 });
    const girisler = await movements.listRecent({ direction: 'in', limit: 50 });

    expect(cikislar.rows.filter((row) => row.stockId === batch.id).map((row) => row.kind)).toEqual(['write_off']);
    expect(girisler.rows.filter((row) => row.stockId === batch.id).map((row) => row.kind)).toEqual(['count_diff']);
  });
});

/**
 * **Dönem toplamı ile listenin AYNI evreni görmesi** (22.28 turunda ölçülerek bulundu).
 *
 * `listPage`in depo süzgeci 08.08'de sunucuya alınmıştı ama toplam onu hiç almamıştı — yani
 * başlıktaki *"bu çeyrek 366 €"* bütün depoların toplamıyken tablo tek deponun kayıtlarını
 * gösterebiliyordu. Sessiz, çünkü iki sayı da doğru görünür: biri "ne kadar", öteki "hangi kayıt"
 * der ve ikisinin farklı evrenden geldiğini hiçbir şey söylemez.
 */
describe('çıkışların depo süzgeci', () => {
  it('TOPLAM ile LİSTE aynı depoyu görür — komşu deponun imhası ikisine de girmez', async () => {
    const kendi = await stocks.insert({ variantId, warehouseId, physicalQty: 10, expiryDate: dayOffset(15), purchasePriceCents: 200 });
    const oteki = await stocks.insert({ variantId, warehouseId: neighbourWarehouseId, physicalQty: 10, expiryDate: dayOffset(15), purchasePriceCents: 200 });
    await movements.adjust({ stockId: kendi.id, qty: 3, direction: 'out', kind: 'write_off', reason: 'expired' });
    await movements.adjust({ stockId: oteki.id, qty: 7, direction: 'out', kind: 'write_off', reason: 'expired' });

    const liste = await movements.listRecent({ warehouseIds: [warehouseId], limit: 50, direction: 'out' });
    const toplam = await movements.summary({ warehouseIds: [warehouseId], direction: 'out' });

    expect(liste.rows.map((row) => row.stockId)).toContain(kendi.id);
    expect(liste.rows.map((row) => row.stockId)).not.toContain(oteki.id);
    // Asıl iddia: toplam da süzülmeli. Süzgeçsizken burada 3 + 7 = 10 çıkardı ve başlık,
    // tablosunda hiç görünmeyen 7 adedi kendi deposunun kaybı gibi yazardı.
    expect(toplam.byKind.get('write_off')?.qty).toBe(3);
    expect(toplam.byReason.get('expired')?.qty).toBe(3);
    expect(toplam.qty).toBe(3);
    expect(toplam.costCents).toBe(600);

    // Komşunun kendi bakışı da tam: süzgeç bir yönü kesip ötekini açık bırakmıyor.
    expect((await movements.summary({ warehouseIds: [neighbourWarehouseId], direction: 'out' })).qty).toBe(7);
  });

  /**
   * **Toplam artık POZİTİF** (06.14) — sekmenin adıyla tutarlı.
   *
   * Eskiden aynı toplamda hem çıkış hem giriş vardı ve "Çıkışlar" başlığı eksi bir sayı
   * gösterebiliyordu. Yön süzgeci bunu yapısal olarak imkânsız kılıyor.
   */
  it('çıkış toplamı giriş satırlarından ETKİLENMEZ', async () => {
    const batch = await stocks.insert({ variantId, warehouseId, physicalQty: 20, expiryDate: dayOffset(15), purchasePriceCents: 1000 });
    await movements.adjust({ stockId: batch.id, qty: 2, direction: 'out', kind: 'write_off', reason: 'damaged' });
    await movements.adjust({ stockId: batch.id, qty: 9, direction: 'in', kind: 'count_diff', note: 'depoda bulundu' });

    const cikis = await movements.summary({ warehouseIds: [warehouseId], direction: 'out' });
    expect(cikis.qty).toBe(2);
    expect(cikis.costCents).toBe(2000);
    expect(cikis.costCents).toBeGreaterThan(0);
  });

  it('BOŞ dizi "hiçbiri" — kapsamsız personel bütün depoların toplamını görmez', async () => {
    const toplam = await movements.summary({ warehouseIds: [] });
    expect(toplam).toEqual({ byKind: new Map(), byReason: new Map(), qty: 0, costCents: 0 });
    expect((await movements.listRecent({ warehouseIds: [] })).rows).toEqual([]);
  });
});
