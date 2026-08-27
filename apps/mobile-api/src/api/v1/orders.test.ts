import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, FeedbackRequestService, OrderService, ProductService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * MÜŞTERİNİN SİPARİŞLERİ — `/api/v1/me/orders`, iki uç.
 *
 * ── ÇİVİLENEN ASIL KARAR: SAHİPLİK JETONDAN ─────────────────────────────────
 * Liste ve detay, kimliği **jetondan** çözüp sorguyu ona daraltıyor. Bu kural gevşerse müşteri,
 * referans numarasını tahmin ettiği HERKESİN siparişini okuyabilir — adres, telefon, kalemler.
 * Referans numarası gizli bir değer değil; gizliliği sağlayan tek şey bu daraltma.
 *
 * Gevşemesi de sessiz olur: sorgudan `customerId` düşerse liste yine dolu döner, detay yine
 * çalışır, hiçbir yer hata vermez. Yalnız artık başkasınınkini de verir.
 *
 * ── SAHİPLİK ÇİFT KAT KORUNUYOR (ölçüldü 25.08, sabotajla) ──────────────────
 * Detay yolunda iki bağımsız süzgeç var: `OrderService.findByReference` sorguyu kimliğe daraltıyor
 * VE `getCustomerOrderDetail` dönen satırı ayrıca doğruluyor (`order.customerId !== input.customerId`).
 * Tek katı kaldırmak bu testi DÜŞÜRMEDİ — öteki tuttu; ikisi birden kalkınca düştü.
 * Yani buradaki iddia bir katmanı değil, **korumanın kendisini** ölçüyor: yarını kaldıran bir
 * "sadeleştirme" fark edilmeden geçebilir, ikisini birden kaldıran geçemez.
 *
 * ── İKİNCİ KARAR: OLMAYAN SİPARİŞ 404, BOŞ CEVAP DEĞİL ──────────────────────
 * `order_not_found` adlı bir rettir; boş bir gövde dönmek ekranı "sipariş var ama içi yok" diye
 * çizmeye bırakırdı.
 */
const db = serviceDb();
const stamp = Date.now();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let benimToken: string;
let otekiToken: string;
let otekiReferansi: string;
let otekiOrderId: string;
let otekiProfileId: string;

const req = (path: string, token: string) => app.request(`/api/v1/me/orders${path}${path.includes('?') ? '&' : '?'}locale=tr`, { headers: bearer(token) });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'SIP' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Sipariş ucu ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Sipariş böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;

  const benim = await createSignedInUser({ prefix: 'orders-api', label: 'benim' });
  const oteki = await createSignedInUser({ prefix: 'orders-api', label: 'oteki' });
  benimToken = benim.token;
  otekiToken = oteki.token;
  authUserIds.push(benim.authUserId, oteki.authUserId);
  profileIds.push(benim.profileId, oteki.profileId);

  // ÖTEKİ müşterinin siparişi — sahiplik iddiasının ancak gerçekten var olan ama görünmemesi
  // gereken bir kayıtla sınanabilmesi için (kurye testinin "yabancı depo" deseni).
  /* REFERANS SONRADAN YAZILIR — `create` onu almıyor (üretimde sipariş akışı atıyor) ve kolon
     nullable. Fikstürde AÇIKÇA yazılması şart: ucun kendi künyesi *"referanssız sipariş listeden
     düşürülür"* diyor, yani referanssız bir kayıtla ne liste ne detay sınanabilirdi — testler
     "sipariş yok" diye, yanlış sebeple düşerdi (ölçüldü 25.08). */
  const referans = `LZT-${stamp}`;
  const { order } = await new OrderService(db).create(
    { warehouseId, customerId: oteki.profileId, channel: 'b2c', deliveryType: 'shipping', totalCents: 2000 },
    [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
  );
  await db.from('order').update({ reference_no: referans, status: 'confirmed' }).eq('id', order.id);
  otekiReferansi = referans;
  otekiOrderId = order.id;
  otekiProfileId = oteki.profileId;
});

afterAll(async () => {
  for (const id of profileIds) await db.from('order').delete().eq('customer_id', id);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    warehouseIds: [warehouseId],
  });
});

describe('GET /api/v1/me/orders — liste', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/orders?locale=tr')).status).toBe(401);
  });

  it('BAŞKASININ siparişi listede GÖRÜNMEZ', async () => {
    const page = await envelopeData<{ orders: { reference: string }[] }>(await req('', benimToken));

    expect(page.orders.map((o) => o.reference)).not.toContain(otekiReferansi);
  });

  it('sahibi kendi siparişini GÖRÜR — iddia boşluğa geçmesin', async () => {
    // Yukarıdaki "görünmez" iddiası, liste HER ZAMAN boş olsaydı da geçerdi (sahte yeşil).
    // Sahibinin listesinde kaydın gerçekten bulunması, o iddiayı anlamlı kılıyor.
    const page = await envelopeData<{ orders: { reference: string }[] }>(await req('', otekiToken));

    expect(page.orders.map((o) => o.reference)).toContain(otekiReferansi);
  });

  it('TANINMAYAN dil 400 — cevap dile bağlı, tahmin edilmez', async () => {
    const res = await app.request('/api/v1/me/orders?locale=zz', { headers: bearer(benimToken) });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_locale');
  });
});

describe('GET /api/v1/me/orders/:reference — detay', () => {
  it('BAŞKASININ referansı 404 — referans numarası gizli bir değer değildir', async () => {
    /* Bu dosyanın asıl iddiası. Referans numarası mailde, faturada, kargo etiketinde dolaşıyor;
       gizliliği sağlayan tek şey sorgunun kimliğe daraltılması. Daraltma düşerse burası 200
       döner ve o an başkasının adresi, telefonu ve kalemleri okunabilir hâle gelir. */
    const res = await app.request(`/api/v1/me/orders/${otekiReferansi}?locale=tr`, { headers: bearer(benimToken) });

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('order_not_found');
  });

  it('SAHİBİ kendi siparişinin detayını okur', async () => {
    const detail = await envelopeData<{ reference: string }>(
      await app.request(`/api/v1/me/orders/${otekiReferansi}?locale=tr`, { headers: bearer(otekiToken) }),
    );

    expect(detail.reference).toBe(otekiReferansi);
  });

  it('OLMAYAN referans 404 `order_not_found` — boş gövde DEĞİL', async () => {
    // Boş bir gövde dönmek ekranı "sipariş var ama içi yok" diye çizmeye bırakırdı.
    const res = await app.request(`/api/v1/me/orders/YOK-${stamp}?locale=tr`, { headers: bearer(benimToken) });

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBe('order_not_found');
  });

  it('Bearer olmadan 401', async () => {
    expect((await app.request(`/api/v1/me/orders/${otekiReferansi}?locale=tr`)).status).toBe(401);
  });
});

describe('yorum teşviki — sipariş detayındaki AÇIK davet (27.08)', () => {
  /*
    Bloğun ekranda çizilip çizilmeyeceğini bu alan belirliyor ve bildirim artık bu sayfaya
    götürüyor: alan yanlış dolarsa müşteri "değerlendirin" yazan bir kutuya basıp hiçbir yere
    gitmez ya da hiç yazamayacağı bir ödül vaat edilir. İddialar bu yüzden ÜÇ hâli de sayıyor.
  */
  const requests = () => new FeedbackRequestService(db);
  const detayOku = async () =>
    envelopeData<{ feedback: { token: string; points: number } | null }>(
      await app.request(`/api/v1/me/orders/${otekiReferansi}?locale=tr`, { headers: bearer(otekiToken) }),
    );

  it('davet YOKKEN alan null — teşvik bloğu doğmaz', async () => {
    expect((await detayOku()).feedback).toBeNull();
  });

  it('AÇIK davet varken token ve AYARDAN gelen puan gelir', async () => {
    const request = await requests().insert({
      orderId: otekiOrderId,
      customerId: otekiProfileId,
      token: `fb-open-${stamp}`,
      channel: 'email',
    });

    const detail = await detayOku();
    expect(detail.feedback?.token).toBe(`fb-open-${stamp}`);
    // Sayı ayardan türer; ekran onu cümleye koyuyor. Sıfır/eksi bir vaat sözleşmede zaten geçmez.
    expect(detail.feedback?.points).toBeGreaterThan(0);

    await db.from('feedback_request').delete().eq('id', request.id);
  });

  it('TAMAMLANMIŞ davet null döner — yazılmış yoruma ikinci kez davet edilmez', async () => {
    const request = await requests().insert({
      orderId: otekiOrderId,
      customerId: otekiProfileId,
      token: `fb-done-${stamp}`,
      channel: 'email',
    });
    await requests().markCompleted(request.id, 5);

    expect((await detayOku()).feedback).toBeNull();

    await db.from('feedback_request').delete().eq('id', request.id);
  });

  it('SÜRESİ DOLMUŞ davet null döner — akış onu zaten açmaz, teşvik de vaat etmez', async () => {
    const request = await requests().insert({
      orderId: otekiOrderId,
      customerId: otekiProfileId,
      token: `fb-expired-${stamp}`,
      channel: 'email',
    });
    await db.from('feedback_request').update({ expires_at: '2020-01-01T00:00:00Z' }).eq('id', request.id);

    expect((await detayOku()).feedback).toBeNull();

    await db.from('feedback_request').delete().eq('id', request.id);
  });
});
