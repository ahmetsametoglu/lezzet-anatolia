import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehousePair } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';
import { ShippingBoxService } from './shipping-box.service';
import { UserProfileService } from './user-profile.service';

/**
 * KARGO KUTUSU KATALOĞU (07.12 · `0052_shipping_box.sql`).
 *
 * Sınanan dört değişmez:
 *   1. **Şablon ile deponun kutusu ayrı kümeler** — okuma kapıları onları karıştırmaz. Karışsaydı
 *      liste, tıklanınca reddedilen satırlar gösterirdi.
 *   2. **Benimseme KOPYALAMADIR, bağlama değil** — depo kopyayı düzeltebilir ve şablon değişse
 *      kopya değişmez. Fiziksel kutu, birinin şablonu düzeltmesiyle küçülmez.
 *   3. **Şablon SİPARİŞ KUTUSUNA seçilemez** — kural veride (bileşik FK), ekranda değil.
 *   4. **Başka deponun kutusu seçilemez** — aynı kısıtın ikinci yarısı. Süzgeci unutulan bir ekran
 *      tek depolu veride DOĞRU cevap verir ve sistem sessizce yanlış kutuyla gönderi hazırlar.
 */
const db = serviceDb();
const boxes = new ShippingBoxService(db);

const stamp = Date.now();
const warehouseIds: string[] = [];
let depoA: string;
let depoB: string;
/**
 * GERÇEK sipariş — ve bu bir ayrıntı değil, testin GEÇERLİLİK ŞARTI.
 *
 * İlk yazımda `order_id` uydurmaydı ve iki test "yazım reddedildi" diye geçiyordu. Ölçünce
 * reddedenin BAŞKA kısıt olduğu çıktı (`order_box_order_id_fkey`, sipariş kimliği yok): kargo
 * kutusu kısıtı hiç silinse testler yine yeşil kalırdı. Sipariş gerçek olunca geriye tek
 * suçlu kalıyor ve iddia adıyla çivileniyor (`order_box_shipping_box_fk`).
 */
let orderId: string;
let customerId: string;
let productId: string;
let categoryId: string;

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  depoA = primary.id;
  depoB = secondary.id;
  warehouseIds.push(primary.id, secondary.id);

  categoryId = (await new CategoryService(db).create({ name: { tr: `Kargo kutusu testi ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kutu testi ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  customerId = (await new UserProfileService(db).insert({ name: `Kutu testi müşterisi ${stamp}` })).id;
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId: depoA, channel: 'b2c', deliveryType: 'shipping', status: 'confirmed' },
    [{ variantId: variants[0]!.id, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  orderId = order.id;
});

afterAll(async () => {
  // Kısıt çalışmazsa satır DOĞAR — bu temizlik o hâlin kirliliğini de alır (savunmacı).
  await db.from('order_box').delete().eq('order_id', orderId);
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [customerId], warehouseIds });
});

describe('ShippingBoxService — şablon ↔ deponun kutusu', () => {
  it('sistem şablonları listeleniyor ve HİÇBİRİ bir depoya ait değil', async () => {
    const templates = await boxes.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.warehouseId === null)).toBe(true);
  });

  it('yeni deponun listesi BOŞ başlar — şablonlar kendiliğinden sızmaz', async () => {
    // Sızsaydı operatör "listemde beş kutu var" sanır, seçtiği an reddedilirdi.
    expect(await boxes.listForWarehouse(depoA)).toEqual([]);
  });

  it('benimseme KOPYALAR: kopya deponun malıdır, şablon yerinde kalır', async () => {
    const [template] = await boxes.listTemplates();
    const kopya = await boxes.adopt(depoA, template!.id);

    expect(kopya.warehouseId).toBe(depoA);
    expect(kopya.id).not.toBe(template!.id);
    expect(kopya).toMatchObject({
      name: template!.name,
      lengthMm: template!.lengthMm,
      tareG: template!.tareG,
    });
    // Şablon dokunulmadan duruyor — başka depolar onu benimsemeye devam edebilir.
    expect((await boxes.getById(template!.id))?.warehouseId).toBeNull();
  });

  it('depo kopyayı DÜZELTEBİLİR ve şablon etkilenmez — fiziksel kutu deponun gerçeğidir', async () => {
    const [template] = await boxes.listTemplates();
    const kopya = await boxes.adopt(depoB, template!.id);
    await boxes.update({ id: kopya.id, lengthMm: template!.lengthMm + 40 });

    expect((await boxes.getById(kopya.id))?.lengthMm).toBe(template!.lengthMm + 40);
    expect((await boxes.getById(template!.id))?.lengthMm).toBe(template!.lengthMm);
  });

  it('aynı şablon iki kez benimsenemez — ad depo içinde benzersiz', async () => {
    const [template] = await boxes.listTemplates();
    await expect(boxes.adopt(depoA, template!.id)).rejects.toThrow();
  });

  it('deponun kendi kutusu benimsenemez — o bir şablon değil', async () => {
    const kendi = await boxes.insert({ warehouseId: depoA, name: `Kendi kutu ${stamp}`, lengthMm: 100, widthMm: 100, heightMm: 100 });
    await expect(boxes.adopt(depoB, kendi.id)).rejects.toThrow(/şablon değil/);
  });

  it('kapatılan kutu listede KALIR — "neden yok" sorusunun cevabı orada', async () => {
    const kutu = await boxes.insert({ warehouseId: depoA, name: `Kapanan ${stamp}`, lengthMm: 200, widthMm: 100, heightMm: 100 });
    await boxes.setActive(kutu.id, false);

    expect((await boxes.listForWarehouse(depoA)).map((b) => b.id)).toContain(kutu.id);
    // Ama SEÇİCİ onu göstermez: kapalı kutuya gönderi hazırlatmak, olmayan kutuyu kullanmaktır.
    expect((await boxes.listForWarehouse(depoA, { onlyActive: true })).map((b) => b.id)).not.toContain(kutu.id);
  });

  it('dara SIFIR olabilir (poşet/zarf) ama ölçü olamaz — ikisi ayrı kural', async () => {
    const posetler = await boxes.insert({
      warehouseId: depoB,
      name: `Zarf ${stamp}`,
      lengthMm: 320,
      widthMm: 230,
      heightMm: 5,
      tareG: 0,
    });
    expect(posetler.tareG).toBe(0);

    await expect(
      boxes.insert({ warehouseId: depoB, name: `Sıfır ölçü ${stamp}`, lengthMm: 0, widthMm: 100, heightMm: 100 }),
    ).rejects.toThrow();
  });
});

describe('Sipariş kutusu ↔ kargo kutusu bağı — kural VERİDE', () => {
  it('KENDİ deposunun kutusu seçilebilir — kısıt doğru olanı geçiriyor (kontrol grubu)', async () => {
    const kutu = await boxes.insert({ warehouseId: depoA, name: `Geçerli ${stamp}`, lengthMm: 300, widthMm: 200, heightMm: 150 });
    const { error } = await db
      .from('order_box')
      .insert({ order_id: orderId, warehouse_id: depoA, box_no: 1, code: `KT-OK-${stamp}`, shipping_box_id: kutu.id });
    // Bu satır olmadan aşağıdaki iki ret testi "her şeyi reddediyor" hâliyle de geçerdi.
    expect(error).toBeNull();
  });

  it('ŞABLON sipariş kutusuna seçilemez — warehouse_id null hiçbir depoyla eşleşmez', async () => {
    const [template] = await boxes.listTemplates();
    const { error } = await db
      .from('order_box')
      .insert({ order_id: orderId, warehouse_id: depoA, box_no: 2, code: `KT-T-${stamp}`, shipping_box_id: template!.id });
    expect(error?.message).toMatch(/order_box_shipping_box_fk/);
  });

  it('BAŞKA DEPONUN kutusu seçilemez — süzgeci unutan ekran tek depolu veride doğru görünürdü', async () => {
    const bKutusu = await boxes.insert({
      warehouseId: depoB,
      name: `B deposunun kutusu ${stamp}`,
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
    });
    const { error } = await db
      .from('order_box')
      .insert({ order_id: orderId, warehouse_id: depoA, box_no: 3, code: `KT-X-${stamp}`, shipping_box_id: bKutusu.id });
    expect(error?.message).toMatch(/order_box_shipping_box_fk/);
  });
});
