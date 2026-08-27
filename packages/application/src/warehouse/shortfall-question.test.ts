import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderService,
  ProductService,
  ReservationService,
  StockService,
  TicketService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehousePair, mustDelete, purgeVariantStock } from '@lezzet/database/testing';
import { advanceOrder } from '../order/advance.testkit';
import { listPreparationQueue } from './preparation';
import { shortfallQuestion } from './shortfall-question';

/**
 * **"Müşteriye sorulsun" — eksik kalemin sorusu** (10.3).
 *
 * Buradaki iddiaların hepsi aynı sınıftan: hiçbiri ekranı kırmaz, hepsi ya iki kez sorulmuş bir
 * soru ya kaybolmuş bir iş üretir. Çift talep koruması düşerse müşteri aynı soruyu iki kez alır ve
 * operasyon hangisinin cevaplandığını bilemez; kapsam kontrolü düşerse bir depocu başka şehrin
 * siparişi hakkında müşteriye soru sordurur; kuyruk izi düşerse sorulmuş soru ekranda görünmez ve
 * kalem ya unutulur ya yeniden sorulur.
 *
 * **Rol duvarı da testli:** kapı depocuya müşteri adı/e-posta/tutar DÖNDÜRMEMELİ (`DOMAIN §2`).
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const reservations = new ReservationService(db);
const tickets = new TicketService(db);

const stamp = Date.now();
let customerId: string;
/** Soruyu açan depocu — `ticket_message_author` kısıtının gerektirdiği yazar (fikstür künyesi). */
let staffId: string;
let warehouseId: string;
let otherWarehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
const createdProfiles: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const { primary, secondary } = await createTestWarehousePair(db);
  warehouseId = primary.id;
  otherWarehouseId = secondary.id;

  const category = await new CategoryService(db).create({ name: { tr: `Eksik sorusu ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Cevizli Baklava ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '750 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;

  const profiles = new UserProfileService(db);
  const profile = await profiles.insert({
    name: 'Sabine Krüger',
    email: `eksik-sorusu-${stamp}@example.test`,
  });
  customerId = profile.id;
  createdProfiles.push(profile.id);

  /*
    SORUYU AÇAN PERSONEL — fikstürün parçası, çünkü veri onu ZORUNLU tutuyor:
    `ticket_message_author` kısıtı `sender = 'admin'` olan mesajda `author_id` istiyor (ilk koşuda
    beş test bu kısıtla düştü). Kısıt haklı ve üretim yolu zaten uyuyor (`askCustomerAction`
    depocunun profilini geçiriyor); eksik olan fikstürdü — yani kısıt burada bir engel değil,
    testin gerçeğe yaklaşması.
  */
  const staff = await profiles.insert({
    name: 'Deniz Arslan',
    email: `eksik-sorusu-personel-${stamp}@example.test`,
  });
  staffId = staff.id;
  createdProfiles.push(staff.id);
});

beforeEach(async () => {
  // Talep siparişe `cascade` bağlı DEĞİL (kalem kimliği dizide duruyor); sipariş silinmeden ÖNCE
  // gitmeli, yoksa bir sonraki testin "açık talep var mı" sorusu geçen turun satırını görürdü.
  await mustDelete(db, 'ticket', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  // Parti SIRASIYLA gider: önce hareket defteri, sonra parti (06.14).
  await purgeVariantStock(db, [variantId]);
});

afterAll(async () => {
  await mustDelete(db, 'ticket', (q) => q.eq('customer_id', customerId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId, otherWarehouseId],
  });
});

/**
 * Eksik kalmış bir kalem: 6 istendi, stokta yalnız 2 var ve 2'si toplandı.
 *
 * `fulfilledQty` doğrudan yazılıyor — `record_preparation` yolundan geçmek bu testin sorusu değil
 * (o `preparation.test.ts`in işi) ve eksiğin nasıl doğduğu kapıyı ilgilendirmiyor: kapı yalnız
 * "istenen − toplanan" farkına bakıyor.
 */
async function shortOrder(opts: { inWarehouse?: string; ordered?: number; picked?: number } = {}) {
  const warehouse = opts.inWarehouse ?? warehouseId;
  const ordered = opts.ordered ?? 6;
  const picked = opts.picked ?? 2;
  await stocks.insert({ warehouseId: warehouse, variantId, physicalQty: 20, expiryDate: dayOffset(60), purchasePriceCents: 400 });

  const { order, items } = await orders.create(
    { warehouseId: warehouse, customerId, channel: 'b2c', deliveryType: 'route', totalCents: ordered * 1000 },
    [{ variantId, qty: ordered, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  await reservations.reserve({ orderId: order.id, warehouseId: warehouse, variantId, qty: ordered });
  await advanceOrder(db, order.id, ['confirmed']);
  const itemId = items[0]!.id;
  if (picked > 0) await db.from('order_item').update({ fulfilled_qty: picked }).eq('id', itemId);
  return { orderId: order.id, itemId };
}

describe('eksik kalemin sorusu (10.3)', () => {
  it('EKSİK varsa soru hazırlanır — adet farktan, ad üründen', async () => {
    const { orderId, itemId } = await shortOrder();

    const result = await shortfallQuestion(db, { orderItemId: itemId, warehouseId });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.orderId).toBe(orderId);
    expect(result.orderItemId).toBe(itemId);
    // 6 istendi, 2 toplandı → 4 eksik. Sayı ÇAĞIRANDAN gelmiyor: ekranın bayat hâli kayda geçmesin.
    expect(result.missingQty).toBe(4);
    // Gövde müşteriye hitap ediyor ve ürünü adıyla anıyor — adsız bir soru cevaplanamaz.
    expect(result.body).toContain('Cevizli Baklava');
    expect(result.body).toContain('4 paket');
    expect(result.subject).toContain('Cevizli Baklava');
  });

  it('EKSİK YOKSA soru hazırlanmaz — olmayan bir sorun müşteriye bildirilmez', async () => {
    const { itemId } = await shortOrder({ ordered: 3, picked: 3 });

    expect((await shortfallQuestion(db, { orderItemId: itemId, warehouseId })).status).toBe('no_shortfall');
  });

  it('BAŞKA deponun siparişi: kapı hiçbir şey döndürmez', async () => {
    const { itemId } = await shortOrder({ inWarehouse: otherWarehouseId });

    // Kuyruk zaten süzülü olduğu için normal akışta buraya düşülmez; kontrol bayat bir sekmenin
    // ya da bağlam değişiminin karşılığı (`confirmPreparation` ile aynı kapsam kararı).
    expect((await shortfallQuestion(db, { orderItemId: itemId, warehouseId })).status).toBe('out_of_scope');
  });

  it('OLMAYAN kalem: `not_found` — uydurma kimlik sessizce geçmez', async () => {
    const yok = '00000000-0000-4000-8000-000000000000';
    expect((await shortfallQuestion(db, { orderItemId: yok, warehouseId })).status).toBe('not_found');
  });

  it('PARA ve MÜŞTERİ BİLGİSİ dönmez — depocu yolu (DOMAIN §2)', async () => {
    const { itemId } = await shortOrder();

    const result = await shortfallQuestion(db, { orderItemId: itemId, warehouseId });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    // `customerId` DÖNÜYOR ve dönmeli — talebi açacak kapının girdisi; ama o bir kimlik, bilgi
    // değil. Ad, e-posta, telefon ve tutar hiçbir alanda olmamalı.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Sabine');
    expect(serialized).not.toContain('@example.test');
    expect(Object.keys(result).join(',')).not.toMatch(/price|amount|total|cost|tutar|fiyat/i);
  });
});

describe('çift talep koruması', () => {
  /** Talebi kapıya benzer biçimde açar — testin sorusu talep AÇMAK değil, ikincisini ENGELLEMEK. */
  const ask = (orderId: string, itemId: string) =>
    tickets.createWithMessage({
      customerId,
      source: 'admin',
      type: 'question',
      body: 'Eksik kaldı, kalanı gönderelim mi?',
      orderId,
      orderItemIds: [itemId],
      sender: 'admin',
      authorId: staffId,
    });

  it('AÇIK soru varken ikincisi hazırlanmaz', async () => {
    const { orderId, itemId } = await shortOrder();
    const ticket = await ask(orderId, itemId);

    const result = await shortfallQuestion(db, { orderItemId: itemId, warehouseId });

    expect(result.status).toBe('already_asked');
    // Hangi talep olduğunu söylüyor: operatör "zaten soruldu" cümlesinin arkasını görebilmeli.
    if (result.status === 'already_asked') expect(result.ticketId).toBe(ticket.id);
  });

  it('ÇÖZÜLMÜŞ soru engel DEĞİL — aynı kalem yeniden eksik kalırsa yeniden sorulur', async () => {
    const { orderId, itemId } = await shortOrder();
    const ticket = await ask(orderId, itemId);
    // `setStatus`, ham `update` değil: `resolved` damgası duruma bağlı ve DB kısıtı bunu zorluyor
    // (`ticket_resolved_stamp`). İkisini elle yazmak, servisin tek yerde tuttuğu kuralı ikinci kez
    // yazmak olurdu — ve o ikinci nüsha bir gün ötekinden ayrışırdı.
    await tickets.setStatus(ticket.id, 'resolved');

    expect((await shortfallQuestion(db, { orderItemId: itemId, warehouseId })).status).toBe('ok');
  });

  it('BAŞKA kalemin sorusu bu kalemi engellemez', async () => {
    const { orderId, itemId } = await shortOrder();
    // Aynı siparişte başka bir kalem kimliğiyle açılmış talep — `contains` yalnız KENDİ kimliğini
    // aramalı; `order_id` eşitliğine düşen bir sorgu bu kalemi de kilitlerdi.
    await ask(orderId, '00000000-0000-4000-8000-0000000000ff');

    expect((await shortfallQuestion(db, { orderItemId: itemId, warehouseId })).status).toBe('ok');
  });
});

describe('kuyruk izi', () => {
  it('sorulmuş kalem kuyrukta CEVAP BEKLİYOR görünür, ötekiler görünmez', async () => {
    const { orderId, itemId } = await shortOrder();

    const before = (await listPreparationQueue(db, { warehouseId })).find((row) => row.orderId === orderId);
    expect(before?.lines[0]?.awaitingAnswer).toBe(false);

    await tickets.createWithMessage({
      customerId,
      source: 'admin',
      type: 'question',
      body: 'Eksik kaldı, kalanı gönderelim mi?',
      orderId,
      orderItemIds: [itemId],
      sender: 'admin',
      authorId: staffId,
    });

    const after = (await listPreparationQueue(db, { warehouseId })).find((row) => row.orderId === orderId);
    // İz olmasaydı depocu soruyu sorduktan sonra ekranda hiçbir fark görmezdi.
    expect(after?.lines[0]?.awaitingAnswer).toBe(true);
  });

  it('ÇÖZÜLEN soru izi kaldırır — kuyruk kapanmış işi bekletmez', async () => {
    const { orderId, itemId } = await shortOrder();
    const ticket = await tickets.createWithMessage({
      customerId,
      source: 'admin',
      type: 'question',
      body: 'Eksik kaldı, kalanı gönderelim mi?',
      orderId,
      orderItemIds: [itemId],
      sender: 'admin',
      authorId: staffId,
    });

    // `setStatus`, ham `update` değil: `resolved` damgası duruma bağlı ve DB kısıtı bunu zorluyor
    // (`ticket_resolved_stamp`). İkisini elle yazmak, servisin tek yerde tuttuğu kuralı ikinci kez
    // yazmak olurdu — ve o ikinci nüsha bir gün ötekinden ayrışırdı.
    await tickets.setStatus(ticket.id, 'resolved');

    const row = (await listPreparationQueue(db, { warehouseId })).find((order) => order.orderId === orderId);
    expect(row?.lines[0]?.awaitingAnswer).toBe(false);
  });
});
