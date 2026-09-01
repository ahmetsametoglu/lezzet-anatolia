import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { ANONYMOUS_BUYER_ID } from '@lezzet/application';
// Beklenen şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME kırılır.
import type { OnSiteSaleResponse, SaleCatalogPage, SaleVariantsResponse } from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * YERİNDE SATIŞ UCU (21.119) — çivilenen üç KAPI kararı (satışın kendisi `on-site-sale.test`te).
 *
 *  1. **Rol kümesi depo ucundan FARKLI.** Kurye buradan satar ama depo yönlendiricisine giremez —
 *     `DOMAIN §17` satışı malın yanındaki personele veriyor, hazırlık kuyruğunu vermiyor.
 *  2. **Depo GÖVDEDEN gelmiyor**, personelin künyesinden çözülüyor. Kapsam dışı depo istenirse 403;
 *     yani kurye başka bir deponun malını satmayı deneyemiyor.
 *  3. **Kapının kararı ne olursa olsun 200.** Yetersiz stok bir HTTP hatası değil, bir cevaptır:
 *     kalan sayı gövdede gelir ki personel müşteriye "üçü var" diyebilsin.
 */
const db = serviceDb();
const stamp = Date.now();

/* YAYIN KISITININ ŞARTI (05.36): `status: 'active'` ürün ad · açıklama · içindekiler · saklama
   metnini ÜÇ DİLDE dolu ister (`product_publish_requires_all_locales`). Metinlerin kendisi bu
   testin konusu değil — konusu yerinde satış; ürünün yayında olması ise şart, çünkü katalog yalnız
   aktif ürünü listeliyor. Kısıt karşılanmazsa `beforeAll` düşer ve testler DÜŞMEZ, ATLANIR:
   sebebi dosyanın konusuyla ilgisiz göründüğü için en zor okunan kırılma budur. */
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
  vehicleId = (await new WarehouseService(db).insert({
    code: `VEHU${stamp % 10000}`, name: `Uç testi aracı ${stamp}`, kind: 'vehicle',
  })).id;

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

  // Kapsam BİLEREK çift: tesis + araç (seed kuryesinin gerçeği — rota seçimi tesislere bakar,
  // 19.25). Kurye satış yerini `?place=van` ile SÖYLER; söylemezse depo çözümü guard'ındır.
  kurye = await createSignedInUser({ prefix: 'sale', label: 'kurye', roles: ['courier'], warehouseIds: [facilityId, vehicleId] });
  depocu = await createSignedInUser({ prefix: 'sale', label: 'depocu', roles: ['warehouse'], warehouseIds: [facilityId] });
  aracsizKurye = await createSignedInUser({ prefix: 'sale', label: 'aracsiz', roles: ['courier'], warehouseIds: [facilityId] });
});

beforeEach(async () => {
  /*
    SİLME GÜRÜLTÜLÜ OLMAK ZORUNDA (27.08 · 06.14). Bu iki satır `db.from(...).delete()` idi ve o
    çağrı hatayı FIRLATMAZ, sonuç nesnesinde döndürür. Defter gelmeden önce çalışıyorlardı; artık
    her yerinde satış partiye bir `stock_movement` çıpalıyor ve o satır partiyi de siparişi de
    `restrict` ile tutuyor — yani ikisi de silinemiyor ve kimse bakmadığı için teardown sessizce
    yarım kalıyordu.

    Belirtisi düşen teardown DEĞİL, ÇİFT SAYIMDI: kalan adet `4` yerine `17` ölçüldü — her test bir
    öncekinin malını da sayıyordu. Sıra zorunlu: parti önce (purge bütün hareketleri toplar), sipariş
    sonra.
  */
  await purgeVariantStock(db, [variantId, sadeceTesisVariantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', ANONYMOUS_BUYER_ID));
  await new StockService(db).insert({ warehouseId: vehicleId, variantId, physicalQty: 4, expiryDate: dayOffset(20), purchasePriceCents: 200 });
  await new StockService(db).insert({ warehouseId: facilityId, variantId, physicalQty: 9, expiryDate: dayOffset(20), purchasePriceCents: 200 });
  // Karşı-örnek: bu ürün ARAÇTA HİÇ YOK. Araç katalogu onu listelemeyecek, tesis katalogu listeleyecek.
  await new StockService(db).insert({ warehouseId: facilityId, variantId: sadeceTesisVariantId, physicalQty: 5, expiryDate: dayOffset(20), purchasePriceCents: 100 });
});

afterAll(async () => {
  // Aynı gerekçe (`beforeEach` künyesi): parti önce, sipariş sonra — ve ikisi de GÜRÜLTÜLÜ.
  await purgeVariantStock(db, [variantId, sadeceTesisVariantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', ANONYMOUS_BUYER_ID));
  await purgeTestData(db, {
    productIds: [productId, sadeceTesisProductId], categoryIds: [categoryId],
    profileIds: [kurye.profileId, depocu.profileId, aracsizKurye.profileId],
    warehouseIds: [facilityId, vehicleId, baskaDepoId],
  });
});

const post = (user: SignedInUser, body: unknown, query = '') =>
  app.request(`/api/v1/sale/on-site${query}`, {
    method: 'POST',
    headers: { ...bearer(user.token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /sale/on-site', () => {
  it('KURYE satabiliyor — ve sipariş ARACIN deposuna, anonim alıcıya yazılıyor', async () => {
    /* `?place=van` AÇIK BEYANDIR (01.09): eskiden sinyal "parametre yokluğu"ydu ve istemci depo
       seçimini yazmaya başlayınca kural sessizce öldü. Beyan yetki değil: aracı sunucu kapsamdan
       çözüyor, istemci hangi aracı istediğini SEÇEMİYOR. */
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
    const { data: rows } = await db.from('order').select('id').eq('customer_id', ANONYMOUS_BUYER_ID);
    expect(rows?.length ?? 0).toBe(0);
  });

  it('YETERSİZ STOK bir HTTP hatası değil, bir CEVAPtır — 200 + kalan sayı', async () => {
    const res = await post(kurye, { lines: [{ variantId, qty: 9 }], paymentMethod: 'cash' }, '?place=van');
    const data = await envelopeData<OnSiteSaleResponse>(res);

    expect(res.status).toBe(200);
    expect(data).toMatchObject({ status: 'insufficient_here', lines: [{ available: 4 }] });
  });

  it('KATALOG ucu kuryeye de açık ve DEPOYU künyeden çözüyor', async () => {
    /*
      Bu dosyanın konusu KAPI kararlarıdır; katalogun depoya süzülmesi `getCatalogData`nın kendi
      sözleşmesidir ve orada sınanır (`place.warehouseId`). Burada çivilenen iki şey var: ucun rol
      kümesi (kurye de okur — satacağı şeyi görmek zorunda) ve deponun GÖVDEDEN değil künyeden
      gelmesi.

      Ayrı bir "araç stoğu" okuması YAZILMADI: katalog okumasının ta kendisi, yalnız `place`
      değişiyor. İkinci bir okuma, vitrinle satış ekranının aynı ürün için farklı "tükendi"
      demesine açık kapı bırakırdı.
    */
    const res = await app.request('/api/v1/sale/catalog?locale=tr&place=van', { headers: bearer(kurye.token) });
    const data = await envelopeData<SaleCatalogPage>(res);

    expect(res.status).toBe(200);
    expect(Array.isArray(data.products)).toBe(true);
    // 21.119'un kapanan boşluğu: her kart kalan adet YUVASINI taşır (sayının doğruluğu boy
    // çekmecesi testinde ölçülür — liste, sayfalama/kesit süzgeçleri yüzünden fikstürü içermeyebilir).
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
      21.119'un kapanan boşluğu: personel "kaç tane var" sorusunu satmayı DENEMEDEN okuyabilmeli.
      Aynı uç, aynı ürün — kurye ARACIN sayısını (4), depocu TESİSİN sayısını (9) görür; sayı
      sepet doğrulamasının okuduğu görünümden gelir, ikinci bir stok gerçeği yoktur.
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
      `place=van` demeyen istek eskisi gibi guard'a gider. Depo kapısında duran kurye
      `?warehouseId=` ile tesisi söylerse kapsam kontrolü aynen koşar ve satış o tesisin stoğundan
      yazılır — araç bir KİLİT değil, kuryenin BEYAN ettiği yerdir (`DOMAIN §17`).
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
      ── 01.09'DA ÖLÇÜLEN ARIZANIN TESTİ ──────────────────────────────────────
      Kurye kendi ekranında ANA DEPONUN kataloğunu görüyordu: araçta dört kalem varken listede
      tesisin 154 partisi vardı ("kalan 23" birebir Strasbourg'un stoğuydu). İki sebep üst üste
      binmişti: (1) istemci cihazdaki depo seçimini satış isteğine de yazıyordu, (2) vitrin kuralı
      "katalog süzülmez, işaretlenir" araca da uygulanıyordu.

      İkisi de kapandı ve ikisi de burada çivili: yer BEYANLA geliyor, araç ise bir vitrin değil —
      kurye elinde ne varsa onu satar. Sipariş için yüklenen kutu da listede olmaz, o mal hâlâ
      tesisin stoğudur (`DOMAIN §17`).
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
    const { data: rows } = await db.from('order').select('id').eq('customer_id', ANONYMOUS_BUYER_ID);
    expect(rows?.length ?? 0).toBe(0);
  });

  it('olmayan ürün 404 — çekmece uydurma bir liste açmaz', async () => {
    const res = await app.request(`/api/v1/sale/catalog/olmayan-urun-${stamp}/variants?locale=tr&place=van`, {
      headers: bearer(kurye.token),
    });
    expect(res.status).toBe(404);
  });
});
