import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { DEFAULT_CROP_FIELDS } from '@lezzet/types';
import { getCatalogData } from './catalog';
/* Künye açıkça geçilir çünkü kapı istek bağlamı okumaz — okusaydı bu dosya (ve mobil çağıran) hiç
   koşamazdı.

   **BU YORUM ESKİDEN ŞUNU DİYORDU:** *"Sıralama testi ZİYARETÇİ gözünden bakar: ölçtüğü şey fiyatın
   kim tarafından görüldüğü değil, sıranın kümenin tamamında doğru kurulduğu."* Cümle makul
   görünüyordu ve YANLIŞTI — sıra, fiyatın kim tarafından görüldüğüne bağlıdır, çünkü fiyatın kendisi
   öyle. O varsayım yüzünden on testin onu da `VISITOR` ile koştu ve toptan müşterinin dört ay
   boyunca yanlış sıralanması hiçbir testten geçmedi (08.54). Kayda geçiyor: burada düşen şey kod
   değil, testin kendi kapsam iddiasıydı. */
import { VISITOR, type PricingViewer } from './pricing-viewer';
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

/**
 * Fiyatlı, stoklu, satışta bir ürün — katalogda görünmesi için gereken en az şey.
 *
 * **İki kanalın fiyatı da yazılır ve SIRALARI BİLEREK ÇELİŞİR** (08.54): b2c'de Ucuz→Orta→Pahalı,
 * b2b'de Orta→Ucuz→Pahalı. Aynı oranla türetilmiş fiyatlar sıralamayı korur, yani kanal ekseni
 * kırılsa bile test yeşil kalırdı — çelişen sıra, kusuru görebilen tek fikstürdür.
 */
async function makeProduct(label: string, priceCents: number, b2bCents: number) {
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `${label} ${stamp}` },
    categoryId,
    status: 'active',
    variants: [{ label: { tr: '1 kg' } }],
  });
  productIds.push(product.id);
  await prices.insert({ variantId: variants[0]!.id, channel: 'b2c', amountCents: priceCents });
  await prices.insert({ variantId: variants[0]!.id, channel: 'b2b', amountCents: b2bCents });
  await stocks.insert({ warehouseId, variantId: variants[0]!.id, physicalQty: 10, expiryDate: dayOffset(60), purchasePriceCents: 100 });
  return { productId: product.id, variantId: variants[0]!.id };
}

/**
 * **Onaylı toptan müşteri** — künye elle kuruluyor, gerçek bir müşteri kaydı gerekmiyor: kapı
 * `PricingViewer`i ÇAĞIRANDAN alıyor (`getCatalogData` künyesi) ve fiyat okuması yalnız `channel`
 * ile `customerId`ye bakıyor. Müşteriye özel (pazarlıklı) fiyat sınanmıyor (`customerId: null`) ve
 * bu bir eksik DEĞİL: pazarlıklı fiyatın sıralamaya girmemesi **verilmiş bir karardır** (kullanıcı
 * 24.08) — gerekçesi ve yeniden açılma koşulu `design/KARARLAR.md §1a`'da, uygulaması `0032`
 * künyesinde. Buraya bir gün pazarlıklı fiyat testi yazılacaksa önce o karar açılmalı.
 */
const TOPTANCI: PricingViewer = { channel: 'b2b', b2bApproved: true, customerId: null, groupPercentOff: null };

let ucuz: { productId: string; variantId: string };
let orta: { productId: string; variantId: string };
let pahali: { productId: string; variantId: string };

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sıralama ${stamp}` } })).id;
  // Adlar B2C sırasını anlatır; toptan sıra bilerek başkadır (Orta 600 < Ucuz 900 < Pahalı 1500).
  ucuz = await makeProduct('Ucuz', 400, 900);
  orta = await makeProduct('Orta', 1200, 600);
  pahali = await makeProduct('Pahalı', 3000, 1500);
});

beforeEach(async () => {
  // Teklifler her testte sıfırlanır: biri diğerinin sırasını taşımasın.
  for (const p of [ucuz, orta, pahali]) await db.from('stock').update({ offer_price: null }).eq('variant_id', p.variantId);
});

afterAll(async () => {
  // Parti satırları ürünün varyantlarından çözülüp `purgeTestData` içinde gider (sıra orada tutulur).
  await purgeTestData(db, { productIds, categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

/**
 * Kendi ürünlerimizin adları — katalogda seed verisi de var, damga onları ayırır.
 *
 * `viewer` PARAMETRE (08.54): dosyanın on testi de `VISITOR` ile koşuyordu ve görünüm zaten yalnız
 * ziyaretçi dalını ifade ediyordu — yani bekçi, koruduğu çiftin tek yarısını ölçüyordu ve toptan
 * müşterinin dört ay boyunca yanlış sıralanmasını yapısal olarak göremezdi.
 */
async function sortedNames(sort: 'priceAsc' | 'priceDesc', viewer: PricingViewer = VISITOR) {
  const data = await getCatalogData(db, { locale: 'tr', query: { sort, search: String(stamp) }, place: YERSIZ, viewer });
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

/**
 * **Sıralama SORANIN kanalından okunur** (08.54 — ölçülmüş kusur, 24.08).
 *
 * Görünüm `where p.channel = 'b2c'`e çakılıydı: onaylı B2B müşteri kartlarda kendi toptan fiyatını
 * görüyor, listeyi ise son müşteri fiyatlarına göre sıralanmış alıyordu. Ölçüldü (Strasbourg deposu,
 * onaylı B2B müşteri, `sort=priceAsc`): **97 üründen 68'i yanlış yerdeydi**, en büyük kayma 22 sıra;
 * aynı sayfa ziyaretçi gözüyle kusursuzdu. Veri kazası değildi — b2b/b2c oranı %48,9–%84,2 arasında
 * 58 farklı değer alıyor, yani sıra tesadüfen bile denk gelemezdi.
 */
describe('sıralama SORANIN kanalından okunur', () => {
  it('onaylı toptan müşteri KENDİ fiyat sırasını görür — perakende sırasını değil', async () => {
    // Perakende sırası: Ucuz(400) → Orta(1200) → Pahalı(3000)
    expect(await sortedNames('priceAsc')).toEqual(['Ucuz', 'Orta', 'Pahalı']);
    // Toptan sırası BAŞKA: Orta(600) → Ucuz(900) → Pahalı(1500)
    expect(await sortedNames('priceAsc', TOPTANCI)).toEqual(['Orta', 'Ucuz', 'Pahalı']);
  });

  it('azalan sıra da kanaldan okunur — tek yönlü bir düzeltme değil', async () => {
    expect(await sortedNames('priceDesc', TOPTANCI)).toEqual(['Pahalı', 'Ucuz', 'Orta']);
  });

  it('kartta YAZAN fiyat sıralamanın kullandığı fiyattır — toptan kanalda da', async () => {
    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(stamp) },
      place: YERSIZ,
      viewer: TOPTANCI,
    });
    // Bu dosyanın asıl işi bu çifti çivilemek; artık iki kanalda birden çiviliyor.
    expect(data.products.map((p) => p.priceCents)).toEqual([600, 900, 1500]);
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

/**
 * **Birincil boy = EN UCUZ boy** (düzeltme 09.08) — kartın da görünümün de aynı boyu seçtiği pinlenir.
 *
 * Kusurun şekli sessizdi: birincil boy `sort_order`'dan seçiliyordu ve o sıra fiyatı bilmiyor.
 * Ölçüldü — 32 çok boylu ürünün 24'ünde kartta yazan fiyat en ucuz boyunki değildi. Hiçbir yerde
 * hata vermiyor, yalnız müşteri pahalı fiyatı görüp geçiyordu.
 *
 * Kendi damgası var: üstteki `sortedNames` testleri `stamp`'e göre süzüyor ve buraya eklenen ürünler
 * o kümeyi (ve `total`ı) oynatırdı.
 */
describe('çok boylu üründe birincil boy EN UCUZ olandır', () => {
  const damga = stamp + 1;

  it('kart en ucuz boyun fiyatını yazar VE sıralama da onu kullanır — operatörün sırası pahalı boyu öne alsa da', async () => {
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `Cokboy ${damga}` },
      categoryId,
      status: 'active',
      // Sıra operatörün: 2 kg önce (sortOrder 0). Fiyat tersine — düzeltmeden önceki hâlde kart
      // 33,82 € yazar ve ürün sıralamada 33,82 €'ya göre yerleşirdi.
      variants: [{ label: { tr: '2 kg' } }, { label: { tr: '1 kg' } }],
    });
    productIds.push(product.id);
    await prices.insert({ variantId: variants[0]!.id, channel: 'b2c', amountCents: 3382 });
    await prices.insert({ variantId: variants[1]!.id, channel: 'b2c', amountCents: 1701 });
    await stocks.insert({ warehouseId, variantId: variants[1]!.id, physicalQty: 10, expiryDate: dayOffset(60), purchasePriceCents: 100 });

    // Kıyas ürünü: iki fiyatın ARASINDA. Kart doğru olup sıra yanlış kalsaydı bu ürün öne geçerdi —
    // yani tek başına kart iddiası, görünümün de düzeldiğini kanıtlamaz.
    const kiyas = await new ProductService(db).create({
      name: { tr: `Kiyas ${damga}` },
      categoryId,
      status: 'active',
      variants: [{ label: { tr: '1 kg' } }],
    });
    productIds.push(kiyas.product.id);
    await prices.insert({ variantId: kiyas.variants[0]!.id, channel: 'b2c', amountCents: 2000 });

    const data = await getCatalogData(db, {
      locale: 'tr',
      query: { sort: 'priceAsc', search: String(damga) },
      place: YERSIZ,
      viewer: VISITOR,
    });

    expect(data.products.map((p) => p.name.split(' ')[0])).toEqual(['Cokboy', 'Kiyas']);
    expect(data.products[0]?.priceCents).toBe(1701);
    // Boy ADI da en ucuz boyunki olmalı: fiyatı bir boydan, etiketi başka boydan yazan kart yalan söyler.
    expect(data.products[0]?.unitLabel).toBe('1 kg');
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

  /**
   * **KARAR TERSİNE DÖNDÜ** (08.46, kullanıcı kararı 19.08 · uygulandı 24.08).
   *
   * Eski hâl: *"fiyatı olmayan ürün listeden DÜŞMEZ, sonda durur"* (`sort_price = Infinity`) —
   * K2'nin "katalog süzülmez, işaretlenir" ilkesi. Kullanıcı bunun tersine karar verdi: kanalında
   * satılamayan ürün vitrinde HİÇ listelenmesin.
   *
   * Ve eski hâl B2B'de kendi sözünü de tutmuyordu (ölçüldü 24.08): kanal ekseni yokken "fiyatsız"
   * ürün B2C fiyatıyla sıralanıyor, yani toptan müşteride listenin ORTASINDA duruyordu — sonda
   * değil. İki ölçüm tam ters yerleşiyordu: b2b fiyatı silinen ürün 7/97'de (ilk ekranda, alınamaz),
   * b2c fiyatı silinen ürün 97/97'de (en sonda, oysa o müşterinin en ucuzu).
   */
  it('kanalında fiyatı olmayan ürün o kanalda HİÇ listelenmez, ötekinde durur', async () => {
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `Yalnız toptan ${stamp}` },
      categoryId,
      status: 'active',
      variants: [{ label: { tr: '1 kg' } }],
    });
    productIds.push(product.id);
    // YALNIZ toptan fiyatı var — perakendede satışa kapalı (DOMAIN §5).
    await prices.insert({ variantId: variants[0]!.id, channel: 'b2b', amountCents: 700 });
    await stocks.insert({ warehouseId, variantId: variants[0]!.id, physicalQty: 5, expiryDate: dayOffset(60), purchasePriceCents: 100 });

    try {
      const ziyaretci = await getCatalogData(db, {
        locale: 'tr',
        query: { sort: 'priceAsc', search: String(stamp) },
        place: YERSIZ,
        viewer: VISITOR,
      });
      // Ziyaretçi onu HİÇ görmez — ve sayaç da onu saymaz (liste ile başlık ayrışamaz).
      expect(ziyaretci.products.map((p) => p.name.split(' ')[0])).toEqual(['Ucuz', 'Orta', 'Pahalı']);
      expect(ziyaretci.total).toBe(3);

      const toptanci = await getCatalogData(db, {
        locale: 'tr',
        query: { sort: 'priceAsc', search: String(stamp) },
        place: YERSIZ,
        viewer: TOPTANCI,
      });
      // Toptan müşteri görür ve KENDİ sırasında görür: Orta(600) → Yalnız(700) → Ucuz(900) → Pahalı(1500)
      expect(toptanci.products.map((p) => p.name.split(' ')[0])).toEqual(['Orta', 'Yalnız', 'Ucuz', 'Pahalı']);
      expect(toptanci.total).toBe(4);
      // Listelenen her satırın fiyatı VARDIR — `sort_price` artık null olamaz.
      expect(toptanci.products.every((p) => p.priceCents != null)).toBe(true);
    } finally {
      // Ürün sonraki testlerin sayımına girmesin — hatası FIRLATILAN silme (`CLAUDE §4b`).
      // Parti SIRASIYLA gider: önce hareket defteri, sonra parti (06.14).
      await purgeVariantStock(db, [variants[0]!.id]);
      await mustDelete(db, 'price', (q) => q.eq('variant_id', variants[0]!.id));
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
