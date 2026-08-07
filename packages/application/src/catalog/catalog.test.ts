import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { DEFAULT_CROP_FIELDS } from '@lezzet/types';
import { getCatalogData } from './catalog';
// Sıralama testi ZİYARETÇİ gözünden bakar: ölçtüğü şey fiyatın kim tarafından görüldüğü değil,
// sıranın kümenin tamamında doğru kurulduğu. Künye açıkça geçiyor çünkü kapı istek bağlamı okumaz —
// okusaydı bu dosya (ve mobil çağıran) hiç koşamazdı.
import { VISITOR } from './pricing-viewer';
import type { PlaceWarehouses } from './storefront-types';

/**
 * Katalogda fiyat sıralaması (08.10; terfi 21.6 — kaynağı `apps/web/lib/storefront/catalog-sort.test.ts`).
 *
 * **Bu dosyanın asıl işi bir ÇİFTİ çivilemek:** `product_listing` görünümü (0043), motorun
 * (`resolvePrice`) ziyaretçi dalını SQL'de yeniden ifade eder. Ödünleşme bilinçli — sıralama +
 * keyset yalnız SQL'de yapılabilir — ama ayrışırsa katalog kendi kartıyla çelişir: sıralamanın
 * kullandığı fiyat, kartta YAZAN fiyat olmalı. Testler ikisini yan yana koyar.
 */
const db = serviceDb();
const prices = new PriceService(db);
const stocks = new StockService(db);

const stamp = Date.now();
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
const productIds: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Yer BİLİNMİYOR — ziyaretçinin posta kodu vermediği hâl (depo-üstü okuma). */
const YERSIZ: PlaceWarehouses = { warehouseId: null, shippingWarehouseId: null };
/** Yer BELLİ — teklif tutarının gösterilebildiği tek hâl. */
const yerli = (): PlaceWarehouses => ({ warehouseId, shippingWarehouseId: null });

/** Fiyatlı, stoklu, satışta bir ürün — katalogda görünmesi için gereken en az şey. */
async function makeProduct(label: string, priceCents: number) {
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `${label} ${stamp}` },
    categoryId,
    status: 'active',
    variants: [{ label: { tr: '1 kg' } }],
  });
  productIds.push(product.id);
  await prices.insert({ variantId: variants[0]!.id, channel: 'b2c', amountCents: priceCents });
  await stocks.insert({ warehouseId, variantId: variants[0]!.id, physicalQty: 10, expiryDate: dayOffset(60), purchasePriceCents: 100 });
  return { productId: product.id, variantId: variants[0]!.id };
}

let ucuz: { productId: string; variantId: string };
let orta: { productId: string; variantId: string };
let pahali: { productId: string; variantId: string };

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sıralama ${stamp}` } })).id;
  ucuz = await makeProduct('Ucuz', 400);
  orta = await makeProduct('Orta', 1200);
  pahali = await makeProduct('Pahalı', 3000);
});

beforeEach(async () => {
  // Teklifler her testte sıfırlanır: biri diğerinin sırasını taşımasın.
  for (const p of [ucuz, orta, pahali]) await db.from('stock').update({ offer_price: null }).eq('variant_id', p.variantId);
});

afterAll(async () => {
  // Parti satırları ürünün varyantlarından çözülüp `purgeTestData` içinde gider (sıra orada tutulur).
  await purgeTestData(db, { productIds, categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

/** Kendi ürünlerimizin adları — katalogda seed verisi de var, damga onları ayırır. */
async function sortedNames(sort: 'priceAsc' | 'priceDesc') {
  const data = await getCatalogData(db, { locale: 'tr', query: { sort, search: String(stamp) }, place: YERSIZ, viewer: VISITOR });
  return data.products.map((p) => p.name.split(' ')[0]);
}

describe('fiyat sıralaması', () => {
  it('artan fiyat gerçekten artan', async () => {
    expect(await sortedNames('priceAsc')).toEqual(['Ucuz', 'Orta', 'Pahalı']);
  });

  it('azalan fiyat gerçekten azalan', async () => {
    expect(await sortedNames('priceDesc')).toEqual(['Pahalı', 'Orta', 'Ucuz']);
  });

  it('sıralama SAYFA İÇİNDE değil, kümenin tamamında', async () => {
    const first = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: YERSIZ,
      viewer: VISITOR,
    });

    // İlk sayfanın ilk ürünü kümenin EN UCUZU olmalı; sayfa çekildikten sonra sıralansaydı bu
    // yalnız o sayfa içinde doğru olurdu.
    expect(first.products[0]?.priceCents).toBe(400);
    expect(first.total).toBe(3);
  });
});

describe('sıralama ile KART aynı fiyatı kullanır', () => {
  it('YER BELLİYKEN teklif kazanır ve ürün yeni yerine taşınır', async () => {
    // 30 €'luk ürüne 3 €'luk teklif: kartta 3 € yazacak, sıralamada da 3 € sayılmalı.
    await db.from('stock').update({ offer_price: 3 }).eq('variant_id', pahali.variantId);

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: yerli(),
      viewer: VISITOR,
    });

    expect(data.products.map((p) => p.name.split(' ')[0])).toEqual(['Pahalı', 'Ucuz', 'Orta']);
    // Kartın gösterdiği fiyat da teklif fiyatıdır — ikisi ayrışmıyor.
    expect(data.products[0]?.priceCents).toBe(300);
  });

  it('YER BİLİNMİYORKEN teklif tutarı sıralamaya girmez — söz verilmeyen fiyat sıralamaz', async () => {
    // Karar (01.08, kullanıcı): teklif bir PARTİYE bağlıdır, parti bir depodadır. Ziyaretçinin
    // posta kodu o depoya düşmeyebilir; indirimli fiyatı gösterip checkout'ta yükseltmek verilmiş
    // bir sözü bozmak olurdu. Yer bilinmezken liste fiyatı sıralar.
    await db.from('stock').update({ offer_price: 3 }).eq('variant_id', pahali.variantId);

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: YERSIZ,
      viewer: VISITOR,
    });

    expect(data.products.map((p) => p.name.split(' ')[0])).toEqual(['Ucuz', 'Orta', 'Pahalı']);
    // Kartta da liste fiyatı yazar: 30 €.
    expect(data.products.at(-1)?.priceCents).toBe(3000);
  });

  it('teklif liste fiyatından YÜKSEKSE sıra değişmez — motorla aynı kural', async () => {
    // Motor: "düşük olan kazanır"; yüksek teklif kaybeder ve kartta liste fiyatı yazar.
    await db.from('stock').update({ offer_price: 50 }).eq('variant_id', ucuz.variantId);

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: yerli(),
      viewer: VISITOR,
    });

    expect(data.products.map((p) => p.name.split(' ')[0])).toEqual(['Ucuz', 'Orta', 'Pahalı']);
    expect(data.products[0]?.priceCents).toBe(400);
  });

  it('teklif EŞİTSE teklif kazanmaz — sıra ve kart yine liste fiyatından', async () => {
    // Eşitlikte teklifin kazanması, aynı parayı ödeyen müşteriye tavan ve çıpalı rezervasyon
    // getirirdi (motorun gerekçesi). Görünüm de `<` kullanır, `<=` değil.
    await db.from('stock').update({ offer_price: 12 }).eq('variant_id', orta.variantId);

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: yerli(),
      viewer: VISITOR,
    });

    expect(data.products[1]?.name).toContain('Orta');
    expect(data.products[1]?.priceCents).toBe(1_200);
  });

  it('tükenmiş teklif partisi sıralamayı ETKİLEMEZ — vitrinde de görünmez', async () => {
    await db.from('stock').update({ offer_price: 1, physical_qty: 0 }).eq('variant_id', pahali.variantId);

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: yerli(),
      viewer: VISITOR,
    });

    // Parti boş: teklif ne kartta ne sırada. Ürün liste fiyatıyla sonda kalır.
    expect(data.products.map((p) => p.name.split(' ')[0])).toEqual(['Ucuz', 'Orta', 'Pahalı']);

    // Partiyi geri doldur: sonraki testler bu ürünü stoklu bekliyor.
    await db.from('stock').update({ physical_qty: 10 }).eq('variant_id', pahali.variantId);
  });
});

describe('süzgeçler sıralamayla birlikte çalışır', () => {
  it('kategori/arama süzgeci fiyat sıralamasında da geçerli — tek süzgeç makinesi', async () => {
    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceDesc', search: `Orta ${stamp}` },
      place: YERSIZ,
      viewer: VISITOR,
    });

    expect(data.products).toHaveLength(1);
    expect(data.products[0]?.name).toContain('Orta');
    // Sayaç listeyle AYNI süzgeci kullanır: "1 sonuç" yazıp 3 satır göstermez.
    expect(data.total).toBe(1);
  });

  it('fiyatı olmayan ürün listeden DÜŞMEZ, sonda durur', async () => {
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `Fiyatsız ${stamp}` },
      categoryId,
      status: 'active',
      variants: [{ label: { tr: '1 kg' } }],
    });
    productIds.push(product.id);
    await stocks.insert({ warehouseId, variantId: variants[0]!.id, physicalQty: 5, expiryDate: dayOffset(60), purchasePriceCents: 100 });

    try {
      const data = await getCatalogData(db, {
        locale: 'tr',
        query: { sort: 'priceAsc', search: String(stamp) },
        place: YERSIZ,
        viewer: VISITOR,
      });

      // Satışa kapalı olması ekranın söyleyeceği bir şeydir, saklayacağı değil.
      expect(data.products.at(-1)?.name).toContain('Fiyatsız');
      expect(data.products.at(-1)?.priceCents).toBeNull();
    } finally {
      // Fiyatsız ürün sonraki testlerin sayımına girmesin — hatası FIRLATILAN silme (`CLAUDE §4b`).
      await mustDelete(db, 'stock', (q) => q.eq('variant_id', variants[0]!.id));
    }
  });
});

describe('yedek kategoriler ÇAĞIRANIN kararıdır', () => {
  it('katalogda kategori varken yedek hiç kullanılmaz', async () => {
    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { search: String(stamp) },
      place: YERSIZ,
      viewer: VISITOR,
      // Gerçek kategoriler dolu olduğu sürece bu satır cevaba HİÇ giremez. Yedek bir "boş katalog"
      // kabuğudur; dolu katalogda görünmesi, olmayan bir kategoriyi varmış gibi göstermek olurdu.
      fallbackCategories: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          slug: `yedek-${stamp}`,
          name: { tr: 'Yedek' },
          imageKey: null,
          imageAlt: null,
          imageUpdatedAt: null,
          // Kırpma varsayılanı elle yazılmaz, tek kaynaktan gelir (`CLAUDE §1`).
          ...DEFAULT_CROP_FIELDS,
        },
      ],
    });

    expect(data.categories.some((c) => c.slug === `yedek-${stamp}`)).toBe(false);
    expect(data.categories.some((c) => c.id === categoryId)).toBe(true);
  });
});
