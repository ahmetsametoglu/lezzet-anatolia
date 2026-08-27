import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { decideReservation } from '@lezzet/domain-core';

/**
 * **KURAL İKİ DİLDE YAZILI — ikisi hâlâ aynı şeyi mi söylüyor?** (denetim 27.08)
 *
 * "Bu maldan kaç tane ayrılabilir" kararı iki yerde birden uygulanıyor:
 *   · SQL — `reserve_stock` RPC (`0007_reserve_stock.sql`). Ayırmayı fiilen yapan, yani CANLI olan.
 *   · TypeScript — `decideReservation` (`domain-core/stock/reservation.ts`). Üretimde çağıran yok.
 *
 * Nüsha kaldırılamaz: ayırma bir yarış durumudur, satır kilidiyle veritabanında yapılmak zorunda
 * (`STACK §13`); veritabanı da bizim motorumuzu çağıramaz. Kaldırılamayan nüshanın tek savunması
 * ikisini karşılaştıran bir testtir — ve 27.08'e kadar öyle bir test YOKTU. İki taraf ayrı ayrı
 * sınanıyordu, ayrıştıklarında ikisi de yeşil kalırdı.
 *
 * ── EN KOLAY AYRIŞACAK YER: SÜRESİ DOLMUŞ REZERVASYON ───────────────────────
 * İki taraf da "süresi geçmiş ayırma sayılmaz" diyor ama cümleyi ayrı ayrı kuruyor:
 * SQL `expires_at is null or expires_at > now()`, motor `expiresAt != null && expiresAt <= now`.
 * Biri bir gün `>=` olsa ya da `null` dalını unutsa sonuç sessizce ayrışır — ve ayrılan mal ya iki
 * kez satılır ya hiç satılmaz. Fikstür bu yüzden ikisini birden taşıyor: bir SÜRESİZ, bir SÜRESİ
 * DOLMUŞ rezervasyon.
 *
 * İki tarafa da AYNI HAM GERÇEK veriliyor ve sayı elle yazılmıyor: parti adetleri ve rezervasyon
 * satırları veritabanından okunup motora aynen aktarılıyor. Yani karşılaştırılan şey iki ayrı
 * hesap, aynı girdi.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);

const stamp = Date.now();
let warehouseId: string;
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const gunOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Ayırma testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Börek ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  const profile = await new UserProfileService(db).insert({ name: `Ayırma müşterisi ${stamp}` });
  customerId = profile.id;
  createdProfiles.push(profile.id);
});

beforeEach(async () => {
  // SIRA: defter → parti → sipariş (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  // Bu dosya bugün deftere yazan bir akış koşturmuyor, ama silme yolu hepsinde AYNI olmalı: hatayı
  // yutan `delete()` bir gün sessizce yarım kalır ve o gün sebebi burada aranmaz.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  // İKİ parti: kullanılabilir hesabı varyant TOPLAMI üzerinden yapılıyor, tek parti bunu göstermez.
  await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: gunOffset(30), purchasePriceCents: 200 });
  await stocks.insert({ warehouseId, variantId, physicalQty: 5, expiryDate: gunOffset(60), purchasePriceCents: 200 });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles, warehouseIds: [warehouseId] });
});

/** Fikstür siparişi — rezervasyonun deposu siparişinkiyle eşit olmak ZORUNDA (DB kısıtı, 0031). */
async function siparisAc(): Promise<string> {
  const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c' }, [
    { variantId, qty: 1, unitPriceCents: 500, vatRate: 5.5 },
  ]);
  return order.id;
}

/** Motorun girdisi VERİTABANINDAN okunur — sayı elle yazılırsa karşılaştırma anlamını yitirir. */
async function hamGercek() {
  const partiler = await db.from('stock').select('physical_qty').eq('variant_id', variantId).eq('warehouse_id', warehouseId);
  const satirlar = await db.from('reservation').select('qty, expires_at, stock_id').eq('variant_id', variantId).eq('warehouse_id', warehouseId);
  return {
    physicalQty: (partiler.data ?? []).reduce((sum, r) => sum + (r.physical_qty as number), 0),
    reservations: (satirlar.data ?? []).map((r) => ({ qty: r.qty as number, expiresAt: r.expires_at as string | null, stockId: r.stock_id as string | null })),
  };
}

describe('kullanılabilir stok: SQL ile motor aynı sayıyı veriyor', () => {
  it('süresi dolmuş ayırma İKİ TARAFTA da sayılmaz', async () => {
    const siparis = await siparisAc();

    // Süresiz (kapıda/vadeli yolun ürettiği hâl) — sayılmalı.
    expect(await reservations.reserve({ orderId: siparis, variantId, warehouseId, qty: 3 })).toMatchObject({ ok: true });
    // Süresi DOLMUŞ — sayılmamalı. Doğrudan yazılıyor: `reserve` geçmiş bir TTL üretemez.
    await reservations.insert({
      orderId: siparis,
      variantId,
      warehouseId,
      qty: 4,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const gercek = await hamGercek();
    const now = new Date();

    // SQL'in cevabı: karşılanamayacak bir miktar isteyip `available`ı okuyoruz (yazım yapılmaz).
    const sqlCevabi = await reservations.reserve({ orderId: siparis, variantId, warehouseId, qty: 9_999 });
    // Motorun cevabı: aynı ham gerçek, ayrı hesap.
    const motorCevabi = decideReservation({ requestedQty: 9_999, physicalQty: gercek.physicalQty, reservations: gercek.reservations, now });

    expect(sqlCevabi.ok).toBe(false);
    expect(motorCevabi.ok).toBe(false);
    if (sqlCevabi.ok || motorCevabi.ok) return;

    // ASIL İDDİA — iki dilin aynı sayıyı söylemesi.
    expect(sqlCevabi.available).toBe(motorCevabi.available);
    // Ve sayının DOĞRU olması: 15 fiili − 3 süresiz = 12. Süresi dolmuş 4 sayılsaydı 8 çıkardı.
    expect(motorCevabi.available).toBe(12);
  });

  it('tam kullanılabilir kadar istemek İKİ TARAFTA da geçer', async () => {
    const siparis = await siparisAc();
    const gercek = await hamGercek();

    const motorCevabi = decideReservation({ requestedQty: 15, physicalQty: gercek.physicalQty, reservations: gercek.reservations });
    const sqlCevabi = await reservations.reserve({ orderId: siparis, variantId, warehouseId, qty: 15 });

    expect(motorCevabi.ok).toBe(true);
    expect(sqlCevabi.ok).toBe(true);
  });

  it('bir fazlası İKİ TARAFTA da reddedilir — kısmi ayırma yok', async () => {
    const siparis = await siparisAc();
    const gercek = await hamGercek();

    const motorCevabi = decideReservation({ requestedQty: 16, physicalQty: gercek.physicalQty, reservations: gercek.reservations });
    const sqlCevabi = await reservations.reserve({ orderId: siparis, variantId, warehouseId, qty: 16 });

    expect(motorCevabi).toMatchObject({ ok: false, available: 15 });
    expect(sqlCevabi).toMatchObject({ ok: false, available: 15 });
    // Yarım ayırma yazılmadı: red, "elde olanı ayır" demek değildir.
    expect(await reservations.listActiveByOrder(siparis)).toHaveLength(0);
  });
});
