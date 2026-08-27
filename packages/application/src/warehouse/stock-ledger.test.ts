import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  ProductService,
  StockIntakeService,
  StockMovementService,
  StockService,
  SupplierService,
  WarehouseTransferService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';

/**
 * **HAREKET DEFTERİNİN DEĞİŞMEZİ** (06.14) — `Σ(in) − Σ(out) = physical_qty`, parti başına.
 *
 * ── BU TEST NEDEN ASIL KAZANÇ ───────────────────────────────────────────────
 * Defter yokken bu denklem okuma katmanında ELDE kuruluyordu (`domain-core/stock/history` +
 * `application/warehouse/variant-history`, ~530 satır) ve künyeleri **dört ayrı üretim arızası**
 * kaydetmişti — dördü de kullanıcı ekran görüntüsüyle yakalanmış, dördü de aynı sınıftan: bir
 * hareketin iki yerde sayılması ya da hiç sayılamaması.
 *
 *   · hazırlanmış mal aynı anda üç yerde sayılıyordu (14.08)
 *   · iade restoku iki kez sayılıyordu — `120 − 3 − (−1) = 118` ama elde 117 (15.08)
 *   · yoldaki mal hiçbir `physical_qty`de yoktu, denklem onsuz sapıyordu
 *   · sayım farkı denklemden düşmüştü — `73 − 10 − 0 = 59`, fark tam `+4` (26.08)
 *
 * Artık denklem bir hesap değil bir DEĞİŞMEZ: aynı transaction hem `physical_qty`yi hem defter
 * satırını yazıyor. Bu dosya onu her koşuda sınıyor — bir gün bir RPC stoğu düşürüp deftere
 * yazmayı unutursa, arıza ekranda değil BURADA görünür.
 *
 * ── PARTİLER GERÇEK AKIŞLA KURULUYOR ────────────────────────────────────────
 * `StockService.insert` ile kurulan parti deftere satır düşürmez (o yol yalnız fikstür/seed
 * yoludur) ve denklem onda tanım gereği tutmaz. Bu yüzden buradaki her parti `receive_intake`
 * RPC'sinden doğuyor — üretimde partinin doğduğu tek yol o (ve `receive_transfer`).
 */
const db = serviceDb();
const stocks = new StockService(db);
const movements = new StockMovementService(db);
const intakes = new StockIntakeService(db);
const transfers = new WarehouseTransferService(db);

let categoryId: string;
let productId: string;
let variantId: string;
let supplierId: string;
let warehouseId: string;
/** Sevkin hedefi — transfer ancak iki tesis varken sınanabilir. */
let targetWarehouseId: string;

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DFT' })).id;
  targetWarehouseId = (await createTestWarehouse(db, { label: 'HDF' })).id;
  const stamp = Date.now();
  supplierId = (await new SupplierService(db).insert({ name: `Defter Tedarik ${stamp}` })).id;
  const category = await new CategoryService(db).create({ name: { tr: `Defter testi ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Defter Böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 180,
  });
  productId = product.id;
  variantId = variants[0]!.id;
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [warehouseId, targetWarehouseId],
  });
});

/** Bir partiyi GERÇEK yoldan kurar: mal kabul RPC'si — defter satırı da onunla doğar. */
async function malKabul(qty: number, opts: { warehouseId?: string } = {}): Promise<string> {
  const result = await intakes.receive({
    supplierId,
    warehouseId: opts.warehouseId ?? warehouseId,
    lines: [{ variantId, qty, expiryDate: gun(60), lotNumber: `DFT-${Date.now()}-${qty}`, unitCostCents: 500 }],
  });
  return result.stockIds[0]!;
}

/** Partinin defter bakiyesi — `Σin − Σout`. */
async function bakiye(stockId: string): Promise<number> {
  const rows = await movements.listByStock(stockId);
  return rows.reduce((sum, row) => sum + (row.direction === 'in' ? row.qty : -row.qty), 0);
}

/** Değişmezin kendisi: defter bakiyesi ile fiili stok AYNI olmalı. */
async function mutabakat(stockId: string): Promise<{ defter: number; fiili: number }> {
  const [defter, parti] = await Promise.all([bakiye(stockId), stocks.getById(stockId)]);
  return { defter, fiili: parti?.physicalQty ?? -1 };
}

describe('hareket defteri — değişmez', () => {
  it('MAL KABUL partiyi ve giriş satırını BİRLİKTE doğurur', async () => {
    const stockId = await malKabul(40);

    const rows = await movements.listByStock(stockId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'intake', direction: 'in', qty: 40, unitCostCents: 500 });
    // Kaynak belge ZORUNLU (`stock_movement_source` kısıtı): kabulün girişi hangi belgeden doğduğunu
    // kendi taşır — yoksa "bu mal nereden geldi" sorusu bir daha sorulamazdı.
    expect(rows[0]!.intakeId).not.toBeNull();

    const { defter, fiili } = await mutabakat(stockId);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(40);
  });

  it('İMHA defterden düşer — mutabakat korunur', async () => {
    const stockId = await malKabul(30);
    await movements.adjust({ stockId, qty: 7, direction: 'out', kind: 'write_off', reason: 'expired' });

    const { defter, fiili } = await mutabakat(stockId);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(23);
  });

  it('SAYIM FAZLASI defteri artırır — mutabakat iki yönde de korunur', async () => {
    const stockId = await malKabul(20);
    await movements.adjust({ stockId, qty: 5, direction: 'in', kind: 'count_diff', note: 'rafta fazla çıktı' });

    const { defter, fiili } = await mutabakat(stockId);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(25);
  });

  it('ARDIŞIK hareketler birikir — denklem her adımda tutar', async () => {
    const stockId = await malKabul(100);
    await movements.adjust({ stockId, qty: 10, direction: 'out', kind: 'write_off', reason: 'damaged' });
    await movements.adjust({ stockId, qty: 3, direction: 'in', kind: 'count_diff', note: 'sayımda bulundu' });
    await movements.adjust({ stockId, qty: 4, direction: 'out', kind: 'write_off', reason: 'lost' });

    const { defter, fiili } = await mutabakat(stockId);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(89); // 100 − 10 + 3 − 4
  });

  /**
   * **REDDEDİLEN yazım defteri KİRLETMEZ** — bölünmezliğin öteki yüzü.
   *
   * Partide olmayan miktar düşülemiyor; bunu zaten biliyorduk. Buradaki asıl iddia şu: red anında
   * defter satırı da yazılmamış olmalı. Yazılsaydı bakiye fiili stoktan sapardı ve o sapma
   * ekranda değil, aylar sonra bir mutabakat sorgusunda görünürdü.
   */
  it('REDDEDİLEN düşüm ne stoğu ne defteri değiştirir', async () => {
    const stockId = await malKabul(5);
    await expect(
      movements.adjust({ stockId, qty: 99, direction: 'out', kind: 'write_off', reason: 'lost' }),
    ).rejects.toThrow();

    const { defter, fiili } = await mutabakat(stockId);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(5);
    expect(await movements.listByStock(stockId)).toHaveLength(1); // yalnız kabulün girişi
  });
});

/**
 * **SEVK, KABUL VE İPTAL** — defterin en zor üç adımı, çünkü İKİ parti ve iki depo var.
 *
 * `receive_transfer` hedefte YENİ parti doğurur (parti kimliği korunur, birleştirilmez — `T4`), yani
 * mal kaynaktan çıkar ve hedefte başka bir satır olarak doğar. Denklem her iki partide ayrı ayrı
 * tutmalı: kaynağın çıkışı kendi bakiyesinden düşer, hedefin girişi kendi bakiyesine yazılır.
 */
describe('hareket defteri — transfer', () => {
  it('SEVK kaynaktan düşer, KABUL hedefte yeni parti doğurur — ikisi de defterde', async () => {
    const kaynak = await malKabul(50);
    const dispatch = await transfers.dispatch({
      toWarehouseId: targetWarehouseId,
      lines: [{ sourceStockId: kaynak, qty: 12 }],
    });

    // Kaynak: kabul (+50) ve sevk (−12).
    const kaynakDurum = await mutabakat(kaynak);
    expect(kaynakDurum.defter).toBe(kaynakDurum.fiili);
    expect(kaynakDurum.fiili).toBe(38);
    const kaynakSatirlar = await movements.listByStock(kaynak);
    expect(kaynakSatirlar.map((r) => r.kind).sort()).toEqual(['intake', 'transfer_out']);

    // Kabul: hedefte yeni parti + `transfer_in` satırı.
    const lines = await transfers.listLines(dispatch.transferId);
    await transfers.receive({
      transferId: dispatch.transferId,
      lines: lines.map((line) => ({ lineId: line.id, receivedQty: 12 })),
    });

    const hedefLines = await transfers.listLines(dispatch.transferId);
    const hedefStockId = hedefLines[0]!.targetStockId!;
    const hedefDurum = await mutabakat(hedefStockId);
    expect(hedefDurum.defter).toBe(hedefDurum.fiili);
    expect(hedefDurum.fiili).toBe(12);
    expect((await movements.listByStock(hedefStockId)).map((r) => r.kind)).toEqual(['transfer_in']);
  });

  /**
   * **EKSİK KABUL: kayıp mal HİÇBİR partiye yazılmaz** ve bu bilinçli (`0006` künyesi).
   *
   * `transfer_loss` diye bir tip YOK: kaynak parti `transfer_out` ile zaten düşüldü (oraya ikinci
   * bir çıkış yazmak aynı malı iki kez düşürürdü), hedefte o mal için parti hiç doğmadı. Kayıp iki
   * hareketin FARKIDIR ve o fark `warehouse_transfer_line`da duruyor. Denklem yine de tutar: mal
   * kaynaktan çıktı (yazıldı), hedefe girmedi (yazılmadı) — iki depo arasında yok oldu.
   */
  it('EKSİK kabulde denklem yine tutar — kayıp iki hareketin farkında durur', async () => {
    const kaynak = await malKabul(30);
    const dispatch = await transfers.dispatch({
      toWarehouseId: targetWarehouseId,
      lines: [{ sourceStockId: kaynak, qty: 10 }],
    });
    const lines = await transfers.listLines(dispatch.transferId);
    await transfers.receive({
      transferId: dispatch.transferId,
      lines: lines.map((line) => ({ lineId: line.id, receivedQty: 7 })), // 3 adet yolda kayboldu
    });

    const kaynakDurum = await mutabakat(kaynak);
    expect(kaynakDurum.defter).toBe(kaynakDurum.fiili);
    expect(kaynakDurum.fiili).toBe(20);

    const hedefStockId = (await transfers.listLines(dispatch.transferId))[0]!.targetStockId!;
    const hedefDurum = await mutabakat(hedefStockId);
    expect(hedefDurum.defter).toBe(hedefDurum.fiili);
    expect(hedefDurum.fiili).toBe(7);

    // Kayıp defterde bir satır DEĞİL, iki sayının farkı: sevk 10, kabul 7.
    const satir = (await transfers.listLines(dispatch.transferId))[0]!;
    expect(satir.qty - satir.receivedQty!).toBe(3);
  });

  /**
   * **İPTAL = TERS KAYIT, silme DEĞİL** (SAP 551↔552 deseni).
   *
   * `cancel_transfer` eskiden stoğu geri yazıp hiçbir yere satır düşmüyordu: mal çıkmış ve dönmüştü
   * ama defterde yalnız çıkışı vardı — yani `physical_qty` deftere göre FAZLA görünüyordu ve geçmiş
   * yalanlanıyordu. Artık her sevk satırının karşısına, aslını işaret eden bir giriş doğuyor.
   */
  it('SEVK İPTALİ ters kayıt yazar — asıl satır yerinde kalır, mutabakat düzelir', async () => {
    const kaynak = await malKabul(25);
    const dispatch = await transfers.dispatch({
      toWarehouseId: targetWarehouseId,
      lines: [{ sourceStockId: kaynak, qty: 9 }],
    });
    expect((await mutabakat(kaynak)).fiili).toBe(16);

    await transfers.cancel({ transferId: dispatch.transferId, reason: 'Araç bozuldu, mal hiç çıkmadı' });

    const { defter, fiili } = await mutabakat(kaynak);
    expect(defter).toBe(fiili);
    expect(fiili).toBe(25); // mal geri geldi

    const rows = await movements.listByStock(kaynak);
    const cikis = rows.find((r) => r.kind === 'transfer_out');
    const ters = rows.find((r) => r.kind === 'transfer_cancel');
    // Asıl satır SİLİNMEDİ — defter append-only'dir ve "mal çıktı" olgusu geçmişte gerçekten oldu.
    expect(cikis).toBeDefined();
    expect(ters).toBeDefined();
    // Ters kayıt aslını İŞARET EDER: hangi çıkışın geri alındığı satırdan okunur.
    expect(ters!.reversesId).toBe(cikis!.id);
    expect(ters!.qty).toBe(cikis!.qty);
  });
});
