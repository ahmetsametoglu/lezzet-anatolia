import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  ProductService,
  StockMovementService,
  StockService,
  UserProfileService,
  WarehouseTransferService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehousePair, mustDelete, purgeVariantStock } from '@lezzet/database/testing';
import {
  cancelTransfer,
  dispatchTransfer,
  listClosedTransfers,
  listInboundTransfers,
  listOutboundTransfers,
  receiveTransfer,
  transitAgeOf,
} from './transfer';

/**
 * **Depolar arası transfer — D5** (19.1/19.6), 21.11.
 *
 * Bu kapı bir terfi DEĞİL: web'de karşılığı yoktu (`/operations/warehouses` servisi doğrudan
 * çağırıyor, `dispatch`/`receive`/`cancel`in hiç çağıranı yok). Dolayısıyla taşınacak bir test de
 * yoktu — sınanan üç şey kapının KENDİ eklediği kurallar:
 *
 *   1. **Depo kimliği** — sevkte kaynak, kabulde hedef, geri almada yine kaynak.
 *   2. **Eksik satır kabulü bloklar** (v2: *"0 = geldi ama kayıp; boş = sayılmadı"*).
 *   3. **Bayat durum GÖRÜNÜR** — kabul edilmiş transfer ikinci kez kapatılamaz.
 */
const db = serviceDb();
const stocks = new StockService(db);
const transfers = new WarehouseTransferService(db);

const stamp = Date.now();
let variantId: string;
let productId: string;
let categoryId: string;
/** Kaynak ve hedef — transfer tek depoyla sınanamaz. */
let fromWarehouseId: string;
let toWarehouseId: string;
let sourceBatch: string;
let foreignBatch: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  fromWarehouseId = primary.id;
  toWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Transfer kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Su Böreği ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

beforeEach(async () => {
  // **SIRA: hareket defteri → transfer → parti** (06.14). Defter transferi de partiyi de `restrict`
  // ile tutuyor (`stock_movement_transfer_fk`, `stock_movement_stock_id_fkey`); eskiden transfer
  // önce gidebiliyordu çünkü sevkin bir hareket kaydı yoktu.
  //
  // Hareketler PARTİDEN siliniyor ve bu transferinkileri de topluyor: her hareket bir partiye
  // bağlı (`stock_id` `not null`), yani parti süpürülünce sevk/kabul satırları da gider.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', fromWarehouseId));
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', toWarehouseId));

  sourceBatch = (
    await stocks.insert({ warehouseId: fromWarehouseId, variantId, physicalQty: 12, expiryDate: dayOffset(40), purchasePriceCents: 300, lotNumber: 'LOT-TRF' })
  ).id;
  // Hedef deponun KENDİ partisi — "kapsam dışı" iddiasının zemini.
  foreignBatch = (
    await stocks.insert({ warehouseId: toWarehouseId, variantId, physicalQty: 5, expiryDate: dayOffset(50), purchasePriceCents: 300 })
  ).id;
});

afterAll(async () => {
  // Transferler AYRICA silinmez: `purgeTestData` onları `warehouseIds`ten iki uçtan da topluyor
  // (§8). Elle yazılan bu satırlar teardown'ı öldürüyordu (ölçüldü 14.08, `cleanup.ts` künyesi).
  // `beforeEach`teki silme başka iş görür: testler arası izolasyon.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [fromWarehouseId, toWarehouseId],
  });
});

/** Yola çıkmış bir transfer — kabul/geri alma testlerinin en kısa zemini. */
async function inTransit(qty = 4) {
  const outcome = await dispatchTransfer(db, {
    fromWarehouseId,
    toWarehouseId,
    lines: [{ sourceStockId: sourceBatch, qty }],
    note: 'rampa testi',
  });
  if (outcome.status !== 'ok') throw new Error(`sevk kurulamadı: ${JSON.stringify(outcome)}`);
  const lines = await transfers.listLines(outcome.transferId);
  return { transferId: outcome.transferId, lineId: lines[0]!.id };
}

describe('sevk (D5 · "ver")', () => {
  it('mal kaynaktan DÜŞER ve transfer yola çıkar', async () => {
    const before = (await stocks.getById(sourceBatch))!.physicalQty;

    const outcome = await dispatchTransfer(db, {
      fromWarehouseId,
      toWarehouseId,
      lines: [{ sourceStockId: sourceBatch, qty: 4 }],
    });

    expect(outcome.status).toBe('ok');
    expect(outcome.status === 'ok' ? outcome.referenceNo : '').toMatch(/^TRF-/);
    // Yoldaki mal hiçbir deponun stoğunda değildir — sanal transit depo yok.
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(before - 4);
  });

  it('BAŞKA DEPONUN partisi sevk edilemez — yazım hiç yapılmaz', async () => {
    const outcome = await dispatchTransfer(db, {
      fromWarehouseId,
      toWarehouseId,
      lines: [{ sourceStockId: sourceBatch, qty: 1 }, { sourceStockId: foreignBatch, qty: 1 }],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope', stockIds: [foreignBatch] });
    // Kendi partisi de el değmeden kaldı: ret bütün sevke iner, satırı ayıklamaz.
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(12);
    expect(await transfers.listInTransit(toWarehouseId)).toHaveLength(0);
  });

  it('hedef kaynakla AYNIYSA sevk yoktur', async () => {
    const outcome = await dispatchTransfer(db, {
      fromWarehouseId,
      toWarehouseId: fromWarehouseId,
      lines: [{ sourceStockId: sourceBatch, qty: 1 }],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'same_warehouse' });
  });

  it('olmayan parti `not_found` döner', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000';

    const outcome = await dispatchTransfer(db, { fromWarehouseId, toWarehouseId, lines: [{ sourceStockId: ghost, qty: 1 }] });

    expect(outcome).toEqual({ status: 'not_found', stockIds: [ghost] });
  });

  it('satırsız sevk yazım YAPMAZ', async () => {
    expect(await dispatchTransfer(db, { fromWarehouseId, toWarehouseId, lines: [] })).toEqual({ status: 'empty' });
  });

  it('KULLANILABİLİRİ aşan sevk reddedilir — sebep operatöre taşınır', async () => {
    const outcome = await dispatchTransfer(db, {
      fromWarehouseId,
      toWarehouseId,
      lines: [{ sourceStockId: sourceBatch, qty: 999 }],
    });

    expect(outcome.status).toBe('failed');
    // "Sebep operatöre taşınır" artık ÖLÇÜLÜYOR (21.11c): RPC'nin kendi cümlesi geliyor, sabit
    // yedek metin ("Sevk yazılamadı") değil — kullanılabilir/fiili/ayrılmış üçlüsü mesajın içinde.
    expect(outcome.status === 'failed' ? outcome.message : '').toMatch(/999 sevk edilemez/);
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(12);
  });
});

describe('"bana ne geliyor" listesi', () => {
  it('hedef depoda görünür — satırlar adı ve sevk adediyle', async () => {
    const { transferId, lineId } = await inTransit(4);

    const inbound = await listInboundTransfers(db, { warehouseId: toWarehouseId });
    const mine = inbound.find((row) => row.transferId === transferId)!;

    expect(mine.fromWarehouseId).toBe(fromWarehouseId);
    expect(mine.note).toBe('rampa testi');
    expect(mine.lines).toEqual([
      {
        lineId,
        sourceStockId: sourceBatch,
        name: `Su Böreği ${stamp} (1 kg)`,
        // Parti künyesi satırda (19.6): rampadaki eşleşme lottan yapılır, web kabul penceresi de
        // aynı satırı okur — fikstürün kurduğu lot/tarih buraya birebir yansımalı.
        lotNumber: 'LOT-TRF',
        expiryDate: dayOffset(40),
        dispatchedQty: 4,
        // `null` = henüz sayılmadı; `0` olsaydı "geldi ama kayıp" derdi (0042).
        receivedQty: null,
        // Fikstür ürünü koli kodu taşımıyor — liste boş, uydurulmaz.
        caseSizes: [],
      },
    ]);
  });

  it('KAYNAK deponun listesinde YOK — "bana ne geliyor" sorusu yön taşır', async () => {
    const { transferId } = await inTransit();

    const atSource = await listInboundTransfers(db, { warehouseId: fromWarehouseId });

    expect(atSource.some((row) => row.transferId === transferId)).toBe(false);
  });

  it('depo ekranına giden veride TUTAR yok', async () => {
    await inTransit();

    const serialized = JSON.stringify(await listInboundTransfers(db, { warehouseId: toWarehouseId }));

    for (const moneyKey of ['purchasePrice', 'offerPrice', 'unitCost', 'total']) {
      expect(serialized).not.toContain(moneyKey);
    }
  });
});

describe('kabul (D5 · "al")', () => {
  it('sayılan mal hedefte YENİ parti olarak doğar', async () => {
    const { transferId, lineId } = await inTransit(4);

    const outcome = await receiveTransfer(db, {
      transferId,
      warehouseId: toWarehouseId,
      lines: [{ lineId, receivedQty: 4 }],
    });

    expect(outcome).toMatchObject({ status: 'ok', transferId, createdBatches: 1 });
    // Parti kimliği KORUNUR, birleşmez (T4): hedefte lot'u kopyalanmış yeni bir satır var.
    const arrived = (await stocks.listByVariant(toWarehouseId, variantId)).filter((batch) => batch.lotNumber === 'LOT-TRF');
    expect(arrived).toHaveLength(1);
    expect(arrived[0]!.physicalQty).toBe(4);
  });

  it('`0` bir BEYANDIR — "geldi ama kayıp" yazılır, kabul kapanır', async () => {
    const { transferId, lineId } = await inTransit(4);

    const outcome = await receiveTransfer(db, {
      transferId,
      warehouseId: toWarehouseId,
      lines: [{ lineId, receivedQty: 0 }],
    });

    expect(outcome.status).toBe('ok');
    expect((await transfers.getById(transferId))?.status).toBe('received');
  });

  /*
    EKSİK KABUL = BEYAN + KAYIP KAYDI (kullanıcı kararı 04.09). 27.08'e kadar eksik yalnız
    `received_qty`de duruyordu: kaynaktan düşmüş, hedefte doğmamış, hiçbir defterde yok (cihazda
    ölçüldü 03.09: 7 birim kayboldu, tek hareket yok). Şimdi parti sevk edilen adetle doğar, eksik
    o partiden `write_off` ile düşer ve transfere bağlanır.
  */
  it('EKSİK KABUL: parti SEVK EDİLEN adetle doğar, eksik o partiden IMH belgesiyle düşer, hareket transfere bağlı', async () => {
    const { transferId, lineId } = await inTransit(4);
    const outcome = await receiveTransfer(db, {
      transferId,
      warehouseId: toWarehouseId,
      lines: [{ lineId, receivedQty: 3 }],
      declaration: { reason: 'damaged', note: 'mühür açıktı' },
    });

    expect(outcome).toMatchObject({
      status: 'ok',
      createdBatches: 1,
      shortfall: { qty: 1, referenceNo: expect.stringMatching(/^IMH-/), lines: [{ lineId, dispatchedQty: 4, receivedQty: 3 }] },
    });
    const arrived = (await stocks.listByVariant(toWarehouseId, variantId)).find((batch) => batch.lotNumber === 'LOT-TRF')!;
    expect(arrived.physicalQty).toBe(3);
    expect(arrived.initialQty).toBe(4);

    const movements = await new StockMovementService(db).listByTransferIds([transferId]);
    const giris = movements.find((m) => m.kind === 'transfer_in' && m.stockId === arrived.id)!;
    const dusum = movements.find((m) => m.kind === 'write_off')!;
    expect(giris.qty).toBe(4);
    expect(dusum).toMatchObject({ stockId: arrived.id, direction: 'out', qty: 1, reason: 'damaged', note: 'mühür açıktı' });
    expect(dusum.referenceNo).toBe(outcome.status === 'ok' ? outcome.shortfall?.referenceNo : null);
    // Kaynak deponun defteri değişmez: sevk anındaki düşüm olduğu gibi durur (iki depo, tek şirket).
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(8);
  });

  it('SIFIR gelen satır da parti açar — sıfır adetle; kayıp ona bağlı ve sebep varsayılan `transfer_shortfall`', async () => {
    const { transferId, lineId } = await inTransit(4);
    const outcome = await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 0 }] });

    expect(outcome).toMatchObject({ status: 'ok', createdBatches: 1, shortfall: { qty: 4 } });
    const arrived = (await stocks.listByVariant(toWarehouseId, variantId)).find((batch) => batch.lotNumber === 'LOT-TRF')!;
    expect(arrived.physicalQty).toBe(0);
    const dusum = (await new StockMovementService(db).listByTransferIds([transferId], { kind: 'write_off' }))[0]!;
    expect(dusum).toMatchObject({ stockId: arrived.id, qty: 4, reason: 'transfer_shortfall', note: null });
  });

  it('TAM kabulde hiçbir düşüm yazılmaz — `shortfall` null, beyan okunmaz', async () => {
    const { transferId, lineId } = await inTransit(4);
    const outcome = await receiveTransfer(db, {
      transferId,
      warehouseId: toWarehouseId,
      lines: [{ lineId, receivedQty: 4 }],
      declaration: { reason: 'damaged', note: 'okunmamalı' },
    });

    expect(outcome).toMatchObject({ status: 'ok', shortfall: null });
    expect(await new StockMovementService(db).listByTransferIds([transferId], { kind: 'write_off' })).toEqual([]);
  });

  it('kapanan listede eksik ADET ve belge; karşı taraf tesis, adıyla', async () => {
    const { transferId, lineId } = await inTransit(4);
    await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 1 }] });

    const row = (await listClosedTransfers(db, { warehouseId: toWarehouseId })).find((r) => r.transferId === transferId)!;
    expect(row).toMatchObject({
      direction: 'in',
      shortLineCount: 1,
      shortQty: 3,
      shortfallReferenceNo: expect.stringMatching(/^IMH-/),
      counterpartKind: 'facility',
    });
    expect(row.counterpartName).toEqual(expect.any(String));
  });

  it('yoldaki sevkiyatın YAŞI üç tonlu — ayar içinde ok, bir gün aşınca warn, sonrası late', () => {
    const sevk = '2026-09-01T09:00:00.000Z';
    expect(transitAgeOf(sevk, 1, new Date('2026-09-01T20:00:00.000Z'))).toEqual({ ageDays: 0, ageTone: 'ok', lateDays: 0 });
    expect(transitAgeOf(sevk, 1, new Date('2026-09-02T08:00:00.000Z'))).toEqual({ ageDays: 1, ageTone: 'ok', lateDays: 0 });
    expect(transitAgeOf(sevk, 1, new Date('2026-09-03T08:00:00.000Z'))).toEqual({ ageDays: 2, ageTone: 'warn', lateDays: 1 });
    expect(transitAgeOf(sevk, 1, new Date('2026-09-05T08:00:00.000Z'))).toEqual({ ageDays: 4, ageTone: 'late', lateDays: 3 });
  });

  it('gelen listede kaynak deponun ADI, yoldakilerde hedefin adı ve yaş tonu', async () => {
    const { transferId } = await inTransit(2);

    const gelen = (await listInboundTransfers(db, { warehouseId: toWarehouseId })).find((r) => r.transferId === transferId)!;
    expect(gelen.fromWarehouseName).toEqual(expect.any(String));
    expect(gelen.lines[0]).toMatchObject({ lotNumber: 'LOT-TRF', dispatchedQty: 2 });

    const yolda = (
      await listOutboundTransfers(db, { warehouseId: fromWarehouseId, transitDays: 1, now: new Date(Date.now() + 4 * 86_400_000) })
    ).find((r) => r.transferId === transferId)!;
    expect(yolda).toMatchObject({ toWarehouseName: expect.any(String), ageTone: 'late', lateDays: 3 });
  });

  it('eksik kabul GÖNDEREN deponun personeline zil düşürür — alan depo beyanı zaten yaptı', async () => {
    const staff = await new UserProfileService(db).insert({
      name: `Kehl depocusu ${stamp}`,
      roles: ['warehouse'],
      warehouseIds: [fromWarehouseId],
    });
    const { transferId, lineId } = await inTransit(4);
    try {
      await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 2 }] });

      const { data, error } = await db
        .from('notification')
        .select('payload')
        .eq('profile_id', staff.id)
        .eq('kind', 'transfer_shortfall');
      if (error) throw error;
      expect(data).toHaveLength(1);
      expect((data as Array<{ payload: Record<string, unknown> }>)[0]!.payload).toMatchObject({
        transferId,
        shortQty: 2,
        shortfallReferenceNo: expect.stringMatching(/^IMH-/),
      });
    } finally {
      // Fan-out seed yöneticilerine de yazar — dedupe anahtarı transfer damgalı, hepsi oradan bulunur.
      const { data } = await db.from('notification').select('id').eq('dedupe_key', `transfer-shortfall:${transferId}`);
      await purgeTestData(db, {
        notificationIds: ((data ?? []) as { id: string }[]).map((r) => r.id),
        profileIds: [staff.id],
      });
    }
  });

  it('SAYILMAMIŞ satır kabulü BLOKLAR — hangi satır olduğu döner', async () => {
    const { transferId, lineId } = await inTransit(4);

    const outcome = await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [] });

    expect(outcome).toEqual({ status: 'incomplete', missingLineIds: [lineId], unknownLineIds: [] });
    // Transfer hâlâ yolda: yarım kabul, hiç kabul etmemekten kötüdür.
    expect((await transfers.getById(transferId))?.status).toBe('in_transit');
  });

  it('TANINMAYAN satır da kabulü bloklar — başka transferin satırı buraya yazılmaz', async () => {
    const { transferId, lineId } = await inTransit(4);
    const ghost = '00000000-0000-0000-0000-000000000000';

    const outcome = await receiveTransfer(db, {
      transferId,
      warehouseId: toWarehouseId,
      lines: [{ lineId, receivedQty: 4 }, { lineId: ghost, receivedQty: 1 }],
    });

    expect(outcome).toEqual({ status: 'incomplete', missingLineIds: [], unknownLineIds: [ghost] });
  });

  it('BAŞKA DEPONUN kabulü buradan kapatılamaz', async () => {
    const { transferId, lineId } = await inTransit(4);

    const outcome = await receiveTransfer(db, {
      transferId,
      // Kaynak depo kendi gönderdiği malı "aldım" diyemez.
      warehouseId: fromWarehouseId,
      lines: [{ lineId, receivedQty: 4 }],
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await transfers.getById(transferId))?.status).toBe('in_transit');
  });

  it('İKİNCİ kabul BAYATTIR — durum görünür döner, yutulmaz', async () => {
    const { transferId, lineId } = await inTransit(4);
    await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 4 }] });

    const again = await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 4 }] });

    expect(again).toEqual({ status: 'stale', currentStatus: 'received' });
  });

  it('olmayan transfer `not_found` döner', async () => {
    const outcome = await receiveTransfer(db, {
      transferId: '00000000-0000-0000-0000-000000000000',
      warehouseId: toWarehouseId,
      lines: [],
    });

    expect(outcome).toEqual({ status: 'not_found' });
  });
});

describe('sevk kaydını geri al (19.6)', () => {
  it('mal KAYNAK PARTİYE geri yazılır — yeni parti doğmaz', async () => {
    const { transferId } = await inTransit(4);
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(8);

    const outcome = await cancelTransfer(db, { transferId, warehouseId: fromWarehouseId, reason: 'mal hiç çıkmadı' });

    expect(outcome).toMatchObject({ status: 'ok', transferId, restoredLines: 1 });
    expect((await stocks.getById(sourceBatch))?.physicalQty).toBe(12);
  });

  it('HEDEF depo geri alamaz — "mal hiç çıkmadı" cümlesini gönderen kurar', async () => {
    const { transferId } = await inTransit(4);

    const outcome = await cancelTransfer(db, { transferId, warehouseId: toWarehouseId });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope' });
    expect((await transfers.getById(transferId))?.status).toBe('in_transit');
  });

  it('KABUL EDİLMİŞ transfer geri alınamaz — mal hedefte doğdu', async () => {
    const { transferId, lineId } = await inTransit(4);
    await receiveTransfer(db, { transferId, warehouseId: toWarehouseId, lines: [{ lineId, receivedQty: 4 }] });

    const outcome = await cancelTransfer(db, { transferId, warehouseId: fromWarehouseId });

    expect(outcome).toEqual({ status: 'stale', currentStatus: 'received' });
  });
});
