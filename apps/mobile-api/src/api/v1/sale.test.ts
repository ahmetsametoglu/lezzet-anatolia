import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, DeliveryZoneService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { ANONYMOUS_BUYER_ID, startCourierDay } from '@lezzet/application';
// Beklenen şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME kırılır.
import type { OnSiteSaleResponse, SaleCatalogPage, SaleVariantsResponse } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * Yerinde satış ucu — üç kapı kararı (satışın kendisi `on-site-sale.test`te): rol kümesi depo ucundan farklıdır (kurye satar
 * ama hazırlık kuyruğuna giremez), depo gövdeden değil personelin künyesinden çözülür (kapsam dışı 403) ve kapının kararı ne
 * olursa olsun cevap 200'dür. Yetersiz stok bir HTTP hatası değil cevaptır: kalan sayı gövdede gelir.
 */
const db = serviceDb();
const stamp = Date.now();

/* Yayın kısıtının şartı: aktif ürünün ad, açıklama, içindekiler ve saklama metni üç dilde dolu olmalı
   (`product_publish_requires_all_locales`); katalog yalnız aktif ürünü listelediği için şart, karşılanmazsa testler atlanır. */
const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
const yayinaHazir = {
  description: ucDil('Yerinde satış testi ürünü'),
  ingredients: ucDil('Un, su, tuz'),
  storageInstructions: ucDil('Serin yerde saklayın'),
};

let kurye: SignedInUser;
let depocu: SignedInUser;
/** Kapsamında ARAÇ olmayan kurye — "beyan yetki değil" kuralının karşı-örneği. */
let aracsizKurye: SignedInUser;
let facilityId: string;
let vehicleId: string;
/** Araç deposunun ruhsat kimliği — sefer aracı bununla seçilir, depo kimliğiyle değil. */
let vanVehicleId: string | null;
let zoneId: string;
let baskaDepoId: string;
let variantId: string;
let productId: string;
let productSlug: string;
let categoryId: string;
/* İKİNCİ ÜRÜN yalnız TESİSTE durur — "araç bir vitrin değil" kuralının ölçülebilmesi için bir
   karşı-örnek şart: araç katalogu onu GÖRMEMELİ, tesis katalogu görmeli. */
let sadeceTesisVariantId: string;
let sadeceTesisProductId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  facilityId = (await createTestWarehouse(db)).id;
  baskaDepoId = (await createTestWarehouse(db)).id;
  // Araç deposu aracını söylemek zorunda (`warehouse_vehicle_identity`); yardımcı damgalı aracı açar ve teardown'da depoyla toplar.
  const van = await createTestWarehouse(db, { label: 'VEHU', kind: 'vehicle' });
  vehicleId = van.id;
  vanVehicleId = van.vehicleId;

  const category = await new CategoryService(db).create({ name: { tr: `Uç yerinde satış ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: ucDil(`Simit ${stamp}`),
    categoryId: category.id,
    ...yayinaHazir,
  });
  categoryId = category.id;
  productId = product.id;
  productSlug = product.slug;
  variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: 500 });
  // Katalog YALNIZ aktif ürünü listeler (`status: 'active'` süzgeci); aday ürün doğrudan bağlantıyla
  // bile açılmıyor (DOMAIN §13). Fikstür bu yüzden ürünü yayına alıyor.
  await new ProductService(db).update({ id: productId, status: 'active' });

  const sadeceTesis = await new ProductService(db).create({
    name: ucDil(`Poğaça ${stamp}`),
    categoryId: category.id,
    ...yayinaHazir,
  });
  sadeceTesisProductId = sadeceTesis.product.id;
  sadeceTesisVariantId = sadeceTesis.variants[0]!.id;
  await new PriceService(db).insert({ variantId: sadeceTesisVariantId, channel: 'b2c', amountCents: 300 });
  await new ProductService(db).update({ id: sadeceTesisProductId, status: 'active' });

  // Kapsam bilerek çift (tesis + araç), çünkü rota seçimi tesislere bakar.
  // Kurye satış yerini `?place=van` ile söyler; söylemezse depo çözümü guard'ındır.
  kurye = await createSignedInUser({ prefix: 'sale', label: 'kurye', roles: ['courier'], warehouseIds: [facilityId, vehicleId] });
  depocu = await createSignedInUser({ prefix: 'sale', label: 'depocu', roles: ['warehouse'], warehouseIds: [facilityId] });
  aracsizKurye = await createSignedInUser({ prefix: 'sale', label: 'aracsiz', roles: ['courier'], warehouseIds: [facilityId] });

  /* Kapıda satış malı kuryenin seferinin aracından düşer, bu yüzden fikstürün seferi var; `aracsizKurye` bilerek sefersiz,
     `no_vehicle` dalını o sınar. */
  zoneId = (await new DeliveryZoneService(db).insert({
    name: `Kapı satışı rotası ${stamp}`, warehouseId: facilityId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
  const start = await startCourierDay(db, { courierId: kurye.profileId, zoneId, vehicleId: vanVehicleId, depart: false });
  if (start.status !== 'ok') throw new Error(`sefer kurulamadı: ${start.status}`);
});

beforeEach(async () => {
  /*
    Silme gürültülü olmalı: satış partiye `stock_movement` çıpalar ve o satır partiyi de siparişi de `restrict` ile tutar;
    sessiz silme teardown'ı yarım bırakıp sonraki testte çift sayım doğurur. Sıra parti önce, sipariş sonra; silme bu dosyanın
    depolarıyla sınırlı, çünkü anonim alıcı küresel tekil bir satır ve süzgeçsiz silme başka satışlara uzanır (CLAUDE §4b).
  */
  await purgeVariantStock(db, [variantId, sadeceTesisVariantId]);
  await mustDelete(db, 'order', (q) =>
    q.eq('customer_id', ANONYMOUS_BUYER_ID).in('warehouse_id', [facilityId, vehicleId, baskaDepoId]),
  );
  await new StockService(db).insert({ warehouseId: vehicleId, variantId, physicalQty: 4, expiryDate: dayOffset(20), purchasePriceCents: 200 });
  await new StockService(db).insert({ warehouseId: facilityId, variantId, physicalQty: 9, expiryDate: dayOffset(20), purchasePriceCents: 200 });
  // Karşı-örnek: bu ürün ARAÇTA HİÇ YOK. Araç katalogu onu listelemeyecek, tesis katalogu listeleyecek.
  await new StockService(db).insert({ warehouseId: facilityId, variantId: sadeceTesisVariantId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 100 });
});

afterAll(async () => {
  // Aynı gerekçe (`beforeEach` künyesi): parti önce, sipariş sonra; silme bu dosyanın depolarıyla sınırlı.
  await purgeVariantStock(db, [variantId, sadeceTesisVariantId]);
  await mustDelete(db, 'order', (q) =>
    q.eq('customer_id', ANONYMOUS_BUYER_ID).in('warehouse_id', [facilityId, vehicleId, baskaDepoId]),
  );
  await purgeTestData(db, {
    productIds: [productId, sadeceTesisProductId], categoryIds: [categoryId],
    profileIds: [kurye.profileId, depocu.profileId, aracsizKurye.profileId],
    warehouseIds: [facilityId, vehicleId, baskaDepoId],
  });
});

/**
 * Bu dosyanın yazdığı anonim sipariş sayısı — anonim alıcı küresel tekil bir satır olduğu için sayaç fikstürün üç deposuyla
 * süzülür, yoksa başka dosyanın ya da cihazın satışları `0` beklentisini bozar (CLAUDE §4b). Süzgeç silmeninkiyle aynı olmalı.
 */
const anonimSiparisSayisi = async (): Promise<number> => {
  const { data } = await db
    .from('order')
    .select('id')
    .eq('customer_id', ANONYMOUS_BUYER_ID)
    .in('warehouse_id', [facilityId, vehicleId, baskaDepoId]);
  return data?.length ?? 0;
};

const post = (user: SignedInUser, body: unknown, query = '') =>
  app.request(`/api/v1/sale/on-site${query}`, {
    method: 'POST',
    headers: { ...bearer(user.token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /sale/on-site', () => {
  it('KURYE satabiliyor — ve sipariş ARACIN deposuna, anonim alıcıya yazılıyor', async () => {
    /* `?place=van` açık beyandır, yetki değil: aracı sunucu kapsamdan çözer, istemci hangi aracı istediğini seçemez. */
    const res = await post(kurye, { lines: [{ variantId, qty: 2 }], paymentMethod: 'cash' }, '?place=van');
    const data = await envelopeData<OnSiteSaleResponse>(res);

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    if (data.status !== 'ok') return;
    expect(data.totalCents).toBe(1000);

    const { data: row } = await db.from('order').select('warehouse_id, customer_id, delivery_type, order_source')
      .eq('id', data.orderId).single();
    expect(row).toMatchObject({
      warehouse_id: vehicleId, customer_id: ANONYMOUS_BUYER_ID, delivery_type: 'pickup', order_source: 'door',
    });
  });

  it('DEPOCU da satabiliyor — aynı kapı, farklı depo', async () => {
    const data = await envelopeData<OnSiteSaleResponse>(await post(depocu, { lines: [{ variantId, qty: 1 }], paymentMethod: 'card' }));
    expect(data.status).toBe('ok');
  });

  it('KAPSAM DIŞI depo istenirse 403 — kurye başka deponun malını satmayı DENEYEMEZ', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 1 }], paymentMethod: 'cash' }, `?warehouseId=${baskaDepoId}`);

    expect(res.status).toBe(403);
    // Ve hiçbir şey yazılmadı: reddedilen istek sipariş bırakmaz.
    expect(await anonimSiparisSayisi()).toBe(0);
  });

  it('YETERSİZ STOK bir HTTP hatası değil, bir CEVAPtır — 200 + kalan sayı', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 9 }], paymentMethod: 'cash' }, '?place=van');
    const data = await envelopeData<OnSiteSaleResponse>(res);

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'insufficient_here', lines: [{ available: 4 }] });
  });

  it('KATALOG ucu kuryeye de açık ve DEPOYU künyeden çözüyor', async () => {
    /*
      Katalogun depoya süzülmesi `getCatalogData`nın sözleşmesi ve orada sınanır; burada ucun rol kümesi (kurye de okur) ve
      deponun künyeden gelmesi çivilenir. Ayrı "araç stoğu" okuması yok: vitrin ve satış ekranı aynı ürüne farklı "tükendi" derdi.
    */
    const res = await app.request('/api/v1/sale/catalog?locale=tr&place=van', { headers: bearer(kurye.token) });
    const data = await envelopeData<SaleCatalogPage>(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(data.products)).toBe(true);
    // Her kart kalan adet yuvasını taşır; sayının doğruluğu boy çekmecesi testinde ölçülür, çünkü liste fikstürü içermeyebilir.
    expect(data.products.every((p) => 'availableHere' in p)).toBe(true);

    // Kapsam dışı depo BURADA da reddediliyor — okuma da yazma da aynı kapıdan geçiyor.
    const disarida = await app.request(`/api/v1/sale/catalog?locale=tr&warehouseId=${baskaDepoId}`, {
      headers: bearer(kurye.token),
    });
    expect(disarida.status).toBe(403);
  });

  it('kalemsiz gövde ŞEMADA elenir — kapıya hiç ulaşmaz', async () => {
    expect((await post(kurye, { lines: [], paymentMethod: 'cash' })).status).toBe(400);
  });

  it('BOY ÇEKMECESİ kalan adedi HERKESİN KENDİ deposundan söylüyor', async () => {
    /*
      Personel "kaç tane var" sorusunu satmayı denemeden okuyabilmeli: kurye aracın sayısını (4), depocu tesisin sayısını (9) görür.
      Sayı sepet doğrulamasının okuduğu görünümden gelir, ikinci bir stok gerçeği yok.
    */
    const varyantlar = async (user: SignedInUser) => {
      const res = await app.request(`/api/v1/sale/catalog/${productSlug}/variants?locale=tr${user === kurye ? '&place=van' : ''}`, {
        headers: bearer(user.token),
      });
      expect(res.status).toBe(200);
      return envelopeData<SaleVariantsResponse>(res);
    };

    const kuryeGozu = await varyantlar(kurye);
    expect(kuryeGozu.productId).toBe(productId);
    expect(kuryeGozu.variants.find((v) => v.id === variantId)?.availableHere).toBe(4);

    const depocuGozu = await varyantlar(depocu);
    expect(depocuGozu.variants.find((v) => v.id === variantId)?.availableHere).toBe(9);
  });

  it('KURYE parametre verirse kapsamındaki TESİSTEN de satabilir — araç önceliği yalnız belirsizlikte', async () => {
    /*
      `place=van` demeyen istek guard'a gider: depo kapısında duran kurye `?warehouseId=` ile tesisi söylerse satış o tesisin
      stoğundan yazılır. Araç bir kilit değil, kuryenin beyan ettiği yerdir (DOMAIN §17).
    */
    const res = await post(kurye, { lines: [{ variantId, qty: 1 }], paymentMethod: 'cash' }, `?warehouseId=${facilityId}`);
    const data = await envelopeData<OnSiteSaleResponse>(res);
    expect(data.status).toBe('ok');
    if (data.status !== 'ok') return;

    const { data: row } = await db.from('order').select('warehouse_id').eq('id', data.orderId).single();
    expect(row?.warehouse_id).toBe(facilityId);
  });

  it('SON SATIŞLAR satan kişiyi söylüyor — iz ayrı kolondan değil, geçiş kaydından', async () => {
    const yazilan = await envelopeData<OnSiteSaleResponse>(await post(kurye, { lines: [{ variantId, qty: 1 }], paymentMethod: 'card' }, '?place=van'));
    expect(yazilan.status).toBe('ok');
    if (yazilan.status !== 'ok') return;

    /* Kurye "az önce ne sattım" diye sorarken de yerini söyler: cevabı ARACININ satışları olmalı,
       seçtiği rota deposunun değil. */
    const res = await app.request('/api/v1/sale/recent?place=van', { headers: bearer(kurye.token) });
    expect(res.status).toBe(200);
    const { sales } = await envelopeData<{ sales: Array<{ orderId: string; sellerName: string | null; lineCount: number; paymentMethod: string | null; totalCents: number }> }>(res);

    const kayit = sales.find((s) => s.orderId === yazilan.orderId);
    expect(kayit).toBeDefined();
    expect(kayit?.lineCount).toBe(1);
    expect(kayit?.paymentMethod).toBe('card');
    expect(kayit?.totalCents).toBe(500);
    // Satan kişi = completed geçişinin aktörü; fikstür kuryesinin profil adı.
    expect(kayit?.sellerName).toBeTruthy();

    // Depocu AYNI ucu okuyunca kendi deposunun satışlarını görür — kuryenin araç satışı listede olmaz.
    const depocuGozu = await envelopeData<{ sales: Array<{ orderId: string }> }>(
      await app.request('/api/v1/sale/recent', { headers: bearer(depocu.token) }),
    );
    expect(depocuGozu.sales.some((s) => s.orderId === yazilan.orderId)).toBe(false);
  });

  it('ARAÇ KATALOĞU ARACIN İÇERİĞİDİR — tesiste olup araçta olmayan mal listede YOK', async () => {
    /*
      Kurye kendi ekranında aracının malını görür, tesisin kataloğunu değil: yer beyanla gelir ve araç bir vitrin değildir.
      Sipariş için yüklenen kutu da listede olmaz, o mal hâlâ tesisin stoğudur (DOMAIN §17).
    */
    const araclaBakis = await envelopeData<SaleCatalogPage>(
      await app.request('/api/v1/sale/catalog?locale=tr&place=van', { headers: bearer(kurye.token) }),
    );
    const araclaKimlikler = araclaBakis.products.map((p) => p.id);
    expect(araclaKimlikler).toContain(productId);
    expect(araclaKimlikler).not.toContain(sadeceTesisProductId);
    expect(araclaBakis.products.find((p) => p.id === productId)?.availableHere).toBe(4);

    /* TESİS KAPISINDA KURAL TERSİNE DÖNÜYOR ve öyle kalmalı: depocu katalogu tarayıp "burada yok"
       cevabını da alabilmeli — vitrinin kuralı orada geçerli. Aynı ürün, iki yerde iki liste. */
    const kapidaBakis = await envelopeData<SaleCatalogPage>(
      // Süzgeç ŞART: tesis katalogu sayfalı ve seed ürünleriyle dolu — fikstür ilk sayfaya düşmez.
      await app.request(`/api/v1/sale/catalog?locale=tr&q=${stamp}`, { headers: bearer(depocu.token) }),
    );
    expect(kapidaBakis.products.map((p) => p.id)).toContain(sadeceTesisProductId);
  });

  it('BEYAN YETKİ DEĞİL — depocu "aracımdan" diyemez, aracı olmayan kurye de', async () => {
    /*
      Beyan bir soru, cevabı kapsam veriyor. Bu ayrım olmasaydı `?place=van` bir yetki dizesi olurdu:
      istemcinin yazdığı bir kelime, sunucunun çözdüğü depoyu belirlerdi.
    */
    const depocununDenemesi = await post(depocu, { lines: [{ variantId, qty: 1 }], paymentMethod: 'cash' }, '?place=van');
    expect(depocununDenemesi.status).toBe(403);

    const aracsizDeneme = await post(aracsizKurye, { lines: [{ variantId, qty: 1 }], paymentMethod: 'cash' }, '?place=van');
    /* Cevap guard'ın "hangi depo" 400'ü DEĞİL, kendi adıyla bir reddir: kurye depo seçmedi,
       aracından satmak istedi ve aracı yok. Ekran bunu kendi cümlesiyle söyleyebilsin. */
    expect(aracsizDeneme.status).toBe(400);
    expect(((await aracsizDeneme.json()) as { error: string }).error).toBe('no_vehicle');

    // Ve hiçbiri sipariş bırakmadı: reddedilen istek yazmaz.
    expect(await anonimSiparisSayisi()).toBe(0);
  });

  it('olmayan ürün 404 — çekmece uydurma bir liste açmaz', async () => {
    const res = await app.request(`/api/v1/sale/catalog/olmayan-urun-${stamp}/variants?locale=tr&place=van`, {
      headers: bearer(kurye.token),
    });
    expect(res.status).toBe(404);
  });
});
