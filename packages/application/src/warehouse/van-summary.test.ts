import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { readFacilityVanSummary } from './van-summary';
import { takeToVan } from '../courier/van-stock';

/**
 * **TESİSİN ARAÇLARINDA NE VAR** (kullanıcı isteği 02.09) — panelin şeridi ve depo kartının satırı.
 *
 * Sınanan üç şey, üçü de bu kapının KENDİ kararları:
 *   1. **Araç EVİNDEN bulunur** (`home_warehouse_id`) — kapı bunu türetmiyor. Türetseydi (son
 *      transfer · kurye kapsamı · günün seferi) hepsi "genelde doğru" olurdu; yanlış olduğu gün
 *      panel BAŞKA tesisin malını "bende" diye sayardı ve ekranda hiçbir şey kırılmazdı.
 *   2. **Kutu ile serbest ürün AYRI sayılır** — biri emanet (satılmış, yolda), öteki satılabilir
 *      stok. Tek sayıda toplansalardı "elimde 45 var" gibi okunurdu; oysa bir kısmı başkasının malı.
 *   3. **Ev bir TESİS olmak zorunda** — kural veritabanında (`warehouse_home_is_facility`); aracın
 *      evi araç olsaydı zincir kapanır, "bu mal hangi tesisin" sorusunun cevabı olmazdı.
 *
 * DB'ye vurur (entegrasyon): kapı üç okumanın kesişimi ve sınanan şey tam da o kesişim — taklit
 * edilmiş bir depo, taklit edilmiş bir cevap verirdi.
 *
 * **Kendi ürününü kurar, katalogdan varyant ÖDÜNÇ ALMAZ:** ödünç alınan varyantın partileri
 * temizlikte silinirdi ve o partiler beslemenin — yani bütün paketin okuduğu satırlar (`CLAUDE §4b`:
 * *"testler küresel tekil satırı kirletmez"*).
 */
const db = serviceDb();
const stocks = new StockService(db);
const stamp = Date.now();

let tesisId = '';
let komsuTesisId = '';
let aracId = '';
let yabanciAracId = '';
let categoryId = '';
let productId = '';
let variantId = '';

beforeAll(async () => {
  const [tesis, komsu] = await Promise.all([
    createTestWarehouse(db, { label: 'VSUM' }),
    createTestWarehouse(db, { label: 'VOTH' }),
  ]);
  tesisId = tesis.id;
  komsuTesisId = komsu.id;

  // İki araç, İKİ AYRI EVDE — testin can damarı bu: tek araçlı bir kurulumda "evinden bulur"
  // iddiası sınanamaz, çünkü hangi yoldan bulunursa bulunsun aynı araç çıkar.
  const [arac, yabanci] = await Promise.all([
    createTestWarehouse(db, { label: 'VV1', kind: 'vehicle', homeWarehouseId: tesis.id }),
    createTestWarehouse(db, { label: 'VV2', kind: 'vehicle', homeWarehouseId: komsu.id }),
  ]);
  aracId = arac.id;
  yabanciAracId = yabanci.id;

  const category = await new CategoryService(db).create({ name: { tr: `Araç özeti ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Şöbiyet ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

afterAll(async () => {
  await purgeVariantStock(db, [variantId]);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [aracId, yabanciAracId, tesisId, komsuTesisId],
  });
});

describe('readFacilityVanSummary — "aracımda ek olarak ne var"', () => {
  it('aracı EVİNDEN bulur — komşu tesisin aracı bu panelde GÖRÜNMEZ', async () => {
    const ozet = await readFacilityVanSummary(db, { facilityId: tesisId });
    const bulunan = ozet.vans.map((v) => v.warehouseId);

    expect(bulunan).toEqual([aracId]);
    // Asıl iddia: bağ türetilseydi (ör. "son transferi kim yaptı") yabancı araç da sızabilirdi.
    expect(bulunan).not.toContain(yabanciAracId);
  });

  it('araçta mal yokken sayı SIFIR — ve bu bir cevap, ölçülememiş değil', async () => {
    const ozet = await readFacilityVanSummary(db, { facilityId: tesisId });
    expect(ozet.vans[0]?.unitCount).toBe(0);
    expect(ozet.boxCount).toBe(0);
  });

  it('araca konan serbest mal ADET ve ÜRÜN sayısı olarak okunur', async () => {
    // Sahne kapının KENDİ yolundan kuruluyor (`takeToVan` = depo→araç transferi). Elle `stock`
    // satırı yazsaydık yalnız okumayı sınardık, sistemi değil.
    await stocks.insert({
      warehouseId: tesisId,
      variantId,
      physicalQty: 9,
      expiryDate: '2030-01-01',
      purchasePriceCents: 200,
    });
    const tasima = await takeToVan(db, { warehouseId: tesisId, vehicleWarehouseId: aracId, variantId, qty: 4 });
    expect(tasima).toMatchObject({ status: 'ok' });

    const ozet = await readFacilityVanSummary(db, { facilityId: tesisId });
    const bizim = ozet.vans.find((v) => v.warehouseId === aracId);
    expect(bizim?.unitCount).toBe(4);
    expect(bizim?.variantCount).toBe(1);

    // Ve komşunun paneli bundan HİÇ etkilenmez — malın tesisi evden okunuyor.
    expect((await readFacilityVanSummary(db, { facilityId: komsuTesisId })).vans[0]?.unitCount).toBe(0);
  });

  it('aracın evi TESİS olmak zorunda — araç araca ev olamaz (kural veride)', async () => {
    await expect(new WarehouseService(db).update({ id: aracId, homeWarehouseId: yabanciAracId })).rejects.toThrow();
  });

  it('aracı olmayan tesiste liste BOŞ — uydurma bir araç bağlanmaz', async () => {
    const ozet = await readFacilityVanSummary(db, { facilityId: komsuTesisId });
    expect(ozet.vans.map((v) => v.warehouseId)).toEqual([yabanciAracId]);
    expect(ozet.vans[0]?.unitCount).toBe(0);
  });
});
