import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockMovementService, StockService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehousePair } from '@lezzet/database/testing';
import { listWarehouseBatches, recordAdjustment, type AdjustmentLine, type WarehouseReason } from './adjustment';

/**
 * **İmha / sayım OLAY belgesi — D4** (10.5), terfi 21.11 (kaynağı `apps/web/lib/stock/adjustment.test.ts`).
 *
 * Sınanan şey: **numara olay başına mı** (satır başına değil), **yarım tutanak kalıyor mu** ve
 * depocuya restok yolunun kapalı olduğu.
 *
 * Terfiyle gelen yeni iddia: **başka deponun partisi bu kapıdan düşülemez**. Web kopyasında bu soru
 * hiç sorulmuyordu (ekranın guard'ı kapıda duruyordu); mobil depocunun elinde yalnız `stockId` var
 * ve o kimlik başka şehrin partisini gösterebilir.
 */
const db = serviceDb();
const stocks = new StockService(db);
const movements = new StockMovementService(db);

const stamp = Date.now();
let variantId: string;
/** Depo geçişi (DOMAIN §17) — testin KENDİ iki deposu; ikincisi kapsam reddinin zemini. */
let warehouseId: string;
let otherWarehouseId: string;
let productId: string;
let categoryId: string;
let batchA: string;
let batchB: string;
let foreignBatch: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Sayım kapısı ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Peynir ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

/**
 * Her test KENDİ partileriyle çalışır ve eskiler SİLİNMEZ.
 *
 * Silmek isterdik ama sırası bu dosyanın işi değil: yazılan `stock_adjustment` satırları partiye
 * `restrict` ile bağlı, yani "önce düzeltme, sonra parti" bilgisini buraya kopyalamak gerekirdi —
 * `CLAUDE.md §4b`'nin tam olarak yasakladığı şey (silme sırası TEK yerde, `purgeTestData`'da).
 * Biriken birkaç satır koşu sonunda o sıradan geçerek gidiyor; testler zaten kendi kimliklerine
 * bakıyor, küresel sayıya değil.
 */
beforeEach(async () => {
  batchA = (await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(5), purchasePriceCents: 400 })).id;
  batchB = (await stocks.insert({ warehouseId, variantId, physicalQty: 8, expiryDate: dayOffset(9), purchasePriceCents: 500 })).id;
  foreignBatch = (
    await stocks.insert({ warehouseId: otherWarehouseId, variantId, physicalQty: 7, expiryDate: dayOffset(7), purchasePriceCents: 400 })
  ).id;
});

afterAll(async () => {
  // Elle `stock` silmesi YOK: bu dosya düzeltme kaydı yazıyor ve `stock_adjustment` partiye
  // `restrict` ile bağlı — sıra tek yerde (`purgeTestData`), belge numaratörü de depo koduna çıpalı.
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

describe('olay belgesi', () => {
  it('İKİ parti tek numarayı paylaşır — kâğıt ikiye bölünmez', async () => {
    const lines: AdjustmentLine[] = [
      { stockId: batchA, qty: 3, direction: 'out' },
      { stockId: batchB, qty: 2, direction: 'out' },
    ];

    const outcome = await recordAdjustment(db, { warehouseId, lines, reason: 'expired', note: 'DLC geçti' });

    expect(outcome.status).toBe('ok');
    const reference = outcome.status === 'ok' ? outcome.result.referenceNo : '';
    // Önek DEPO KODU taşıyor (DOMAIN §17): `IMH-STR-26-0012`. Seriler depo başına ayrışır.
    expect(reference).toMatch(/^IMH-[A-Z0-9-]+-\d{2}-\d{4}$/);

    const rows = await movements.listByReference(reference);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.referenceNo))).toEqual(new Set([reference]));
  });

  it('numara SIRALI ilerler — denetmen okuyup yazabilsin', async () => {
    const line = [{ stockId: batchA, qty: 1, direction: 'out' as const }];
    const first = await recordAdjustment(db, { warehouseId, lines: line, reason: 'damaged' });
    const second = await recordAdjustment(db, { warehouseId, lines: line, reason: 'damaged' });

    const numberOf = (ref: string) => Number(ref.split('-').at(-1));
    const a = first.status === 'ok' ? numberOf(first.result.referenceNo) : 0;
    const b = second.status === 'ok' ? numberOf(second.result.referenceNo) : 0;
    expect(b).toBe(a + 1);
  });

  it('sebep belgeyi belirler: sayım farkı imha tutanağına yazılmaz', async () => {
    const sayim = await recordAdjustment(db, {
      warehouseId,
      lines: [{ stockId: batchA, qty: 2, direction: 'out' }],
      reason: 'count_diff',
      note: 'sayım',
    });

    expect(sayim.status === 'ok' ? sayim.result.referenceNo : '').toMatch(/^SAY-/);
  });

  it('olayın maliyeti dönüşte gelir — farklı partiler kendi alış fiyatıyla', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [
        { stockId: batchA, qty: 2, direction: 'out' },
        { stockId: batchB, qty: 1, direction: 'out' },
      ],
      reason: 'expired',
    });

    // 2 × 4 € + 1 × 5 € = 13 €; her parti KENDİ maliyetinden sayılır, ortalamadan değil.
    expect(outcome.status === 'ok' ? outcome.result.outCostCents : 0).toBe(1300);
  });
});

describe('bölünmezlik', () => {
  it('bir satır tutmazsa HİÇBİRİ yazılmaz — yarım tutanak kalmaz', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [
        { stockId: batchA, qty: 3, direction: 'out' },
        { stockId: batchB, qty: 99, direction: 'out' }, // ikincisi partiyi aşıyor
      ],
      reason: 'expired',
    });

    expect(outcome.status).toBe('failed');
    // Mesaj GERÇEK RPC cümlesidir, sabit yedek metin değil (21.11c): sözleşmenin vaadi "operatöre
    // AYNEN gösterilir" ve depocu hangi partide kaç adet olduğunu ancak böyle okur.
    expect(outcome.status === 'failed' ? outcome.message : '').toMatch(/partide 8 adet var, 99 adet düşülemez/);
    // İlk satır da yazılmadı: stok el değmemiş.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(10);
    expect(await movements.listByStock(batchA)).toHaveLength(0);
  });

  it('satırsız çağrı yazım YAPMAZ', async () => {
    expect(await recordAdjustment(db, { warehouseId, lines: [], reason: 'expired' })).toEqual({ status: 'empty' });
  });

  it('stoğa geri ekleme sebep notu ister — istisna sebepsiz yazılmaz', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [{ stockId: batchA, qty: 2, direction: 'in' }],
      reason: 'count_diff',
    });

    expect(outcome.status).toBe('failed');
    // Kuralı VERİTABANI zorluyor ve cümlesini de o kuruyor; ekran onu aynen gösterir (21.11c).
    expect(outcome.status === 'failed' ? outcome.message : '').toMatch(/stoğa geri ekleme sebep notu ister/);
    expect((await stocks.getById(batchA))?.physicalQty).toBe(10);
  });

  it('sayım FAZLASI notla yazılır ve stoğu artırır', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [{ stockId: batchA, qty: 2, direction: 'in' }],
      reason: 'count_diff',
      note: 'sayımda 2 adet fazla çıktı',
    });

    expect(outcome.status).toBe('ok');
    expect((await stocks.getById(batchA))?.physicalQty).toBe(12);
    // **Giriş kendi kaleminde** (06.14): eskiden tek `costTotalCents` vardı ve bu satır onu eksiye
    // düşürüyordu — "olayın maliyeti −8 €" gibi okunmayan bir sonuç. Artık çıkış ve giriş ayrı
    // dönüyor; ikisini çıkarmak isteyen çağıran bunu bilerek yapar.
    expect(outcome.status === 'ok' ? outcome.result.inCostCents : 0).toBe(800);
    expect(outcome.status === 'ok' ? outcome.result.outCostCents : -1).toBe(0);
  });
});

describe('depocuya restok seçeneği sunulmaz', () => {
  it('`return_restock` bu kapıdan GEÇMEZ — kural tipte duruyor', () => {
    // @ts-expect-error — depo kapısı iade restokunu kabul etmez (DOMAIN §4: yönetim istisnası).
    const forbidden: WarehouseReason = 'return_restock';
    expect(forbidden).toBe('return_restock');
  });
});

describe('depo kimliği (21.11 — CLAUDE.md §1)', () => {
  it('BAŞKA DEPONUN partisi düşülemez — hiçbir satır yazılmaz, hangi parti olduğu döner', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [
        { stockId: batchA, qty: 1, direction: 'out' },
        { stockId: foreignBatch, qty: 1, direction: 'out' },
      ],
      reason: 'expired',
    });

    expect(outcome).toEqual({ status: 'forbidden', reason: 'out_of_scope', stockIds: [foreignBatch] });
    // Kendi partisi de EL DEĞMEDEN kaldı: ret bütün olaya iner, satırı ayıklamaz.
    expect((await stocks.getById(batchA))?.physicalQty).toBe(10);
    expect((await stocks.getById(foreignBatch))?.physicalQty).toBe(7);
  });

  it('aynı parti KENDİ deposundan düşülebilir — süzgeç körlük değil, kapsam', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId: otherWarehouseId,
      lines: [{ stockId: foreignBatch, qty: 2, direction: 'out' }],
      reason: 'damaged',
    });

    expect(outcome.status).toBe('ok');
    expect((await stocks.getById(foreignBatch))?.physicalQty).toBe(5);
  });

  it('olmayan parti `not_found` döner — "başka deponun" ile aynı şey DEĞİL', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000';

    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [{ stockId: ghost, qty: 1, direction: 'out' }],
      reason: 'lost',
    });

    expect(outcome).toEqual({ status: 'not_found', stockIds: [ghost] });
  });
});

/*
  RAF LİSTESİ VE SONUÇ SAYILARI (02.09) — D4'ün baştan yazılmasıyla açılan iki yol.

  Listenin sınandığı şey ekranın ona GÜVENEBİLMESİ: yalnız kendi deposu, yalnız stoğu duranlar ve
  bağlam kartının iki sayısı. Sonuç sayılarının sınandığı şey ise ÖLÇÜLMÜŞ olmaları — ekran kendi
  çıkarmasını yapsaydı aynı partiye o sırada dokunan bir yazım sessizce yok sayılırdı.
*/
describe('raf listesi', () => {
  it('yalnız KENDİ deposunun partileri gelir — kapsam dışı satır listede yok', async () => {
    const { batches } = await listWarehouseBatches(db, { warehouseId });

    const ids = batches.map((row) => row.stockId);
    expect(ids).toContain(batchA);
    expect(ids).toContain(batchB);
    expect(ids).not.toContain(foreignBatch);
  });

  it('bağlam kartının İKİ sayısını taşır: partide kayıtlı ve ürünün depodaki toplamı', async () => {
    const { batches } = await listWarehouseBatches(db, { warehouseId });

    const row = batches.find((batch) => batch.stockId === batchA);
    expect(row?.physicalQty).toBe(10);
    /* Toplam LİSTENİN KENDİSİNDEN doğrulanıyor, sabit bir sayıdan değil: bu dosyanın partileri
       koşu boyunca birikiyor (`beforeEach` künyesi) ve sabit bir toplam ikinci testte yalan
       olurdu. Sınanan iddia zaten "aynı ürünün bu depodaki partilerinin toplamı" — ve YABANCI
       depo bu toplama girmiyor (üstteki test). */
    const listedTotal = batches
      .filter((batch) => batch.variantId === row?.variantId)
      .reduce((sum, batch) => sum + batch.physicalQty, 0);
    expect(row?.variantWarehouseQty).toBe(listedTotal);
    expect(row?.dateType).toBe('DDM');
  });

  it('stoğu BİTMİŞ parti listelenmez — düşürülemeyecek bir satır seçtirilmez', async () => {
    await stocks.setPhysicalQty(batchB, 0);

    const { batches } = await listWarehouseBatches(db, { warehouseId });

    expect(batches.map((row) => row.stockId)).not.toContain(batchB);
  });

  it('LOTSUZ parti de listelenir — etiketi olmayan parti, sayımın en çok gerektiği partidir', async () => {
    /* Ölçülmüş arıza (02.09): ilk tur lotu olmayan partiyi listeden DÜŞÜRÜYORDU (sözleşme lotu
       zorunlu tutuyordu) ve mal kabulde lot boş bırakmak meşru. Yani okunacak etiketi olmayan
       parti hem okutulamıyor hem listelenemiyordu: depocunun hiçbir yolu kalmıyordu. */
    const lotless = await stocks.insert({ warehouseId, variantId, physicalQty: 3, expiryDate: dayOffset(11), purchasePriceCents: 300 });

    const { batches } = await listWarehouseBatches(db, { warehouseId });

    const row = batches.find((batch) => batch.stockId === lotless.id);
    expect(row?.lotNumber).toBeNull();
    expect(row?.physicalQty).toBe(3);
  });

  it('arama ürün adında da lot numarasında da eşleşir', async () => {
    const byName = await listWarehouseBatches(db, { warehouseId, query: `Peynir ${stamp}` });
    expect(byName.batches.length).toBeGreaterThan(0);

    const nonsense = await listWarehouseBatches(db, { warehouseId, query: `yok-${stamp}` });
    expect(nonsense.batches).toHaveLength(0);
  });

  it('tavana dayanan liste bunu SÖYLER — sessiz kırpma yok', async () => {
    const { batches, truncated } = await listWarehouseBatches(db, { warehouseId, limit: 1 });

    expect(batches).toHaveLength(1);
    expect(truncated).toBe(true);
  });
});

describe('yazımdan sonraki sayılar', () => {
  it('TEK partili yazımda iki sayı da ÖLÇÜLEREK döner', async () => {
    const before = await listWarehouseBatches(db, { warehouseId });
    const totalBefore = before.batches.find((batch) => batch.stockId === batchA)?.variantWarehouseQty ?? 0;

    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [{ stockId: batchA, qty: 3, direction: 'out' }],
      reason: 'damaged',
    });

    expect(outcome.status).toBe('ok');
    // Parti 10 → 7; ürünün depodaki toplamı da tam 3 azalmış olmalı. İkisi de kayıttan OKUNDU.
    expect(outcome.status === 'ok' ? outcome.after : null).toEqual({
      batchQty: 7,
      variantWarehouseQty: totalBefore - 3,
    });
  });

  it('ÇOK partili olayda `null` — "hangi partinin yeni hâli" sorusunun tek cevabı yok', async () => {
    const outcome = await recordAdjustment(db, {
      warehouseId,
      lines: [
        { stockId: batchA, qty: 1, direction: 'out' },
        { stockId: batchB, qty: 1, direction: 'out' },
      ],
      reason: 'lost',
    });

    expect(outcome.status === 'ok' ? outcome.after : undefined).toBeNull();
  });
});
