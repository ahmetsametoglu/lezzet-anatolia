import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  CategoryService,
  OrderBoxService,
  OrderService,
  ProductService,
  ShipmentService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { providerStub } from '@lezzet/application/shipping/provider.testkit';
import { signWebhookBody } from '@lezzet/sendcloud';
import type { AppEnv } from '../http/request-log';
import { handleSendcloudWebhook } from './sendcloud';

/**
 * TAŞIYICI WEBHOOK KAPISI (07.12) — üç emniyet, üçü de ayrı soru.
 *
 * **Cevap kodları bir SÖZLEŞMEDİR** ve testin asıl konusu bu: Sendcloud başarısız çağrıyı 10 kez,
 * 5 dk → 1 saat artan gecikmeyle yeniden gönderiyor. Yanlış kod dönmek ya sağlayıcıyı boşuna
 * koşturur (ilgilendirmeyen olaya 4xx) ya da kaçan bir durum değişimini sessizleştirir
 * (işlenememiş olaya 200).
 */
const db = serviceDb();
const stamp = Date.now();
const SECRET = `test-secret-${stamp}`;
const warehouseIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];
const profileIds: string[] = [];

let warehouseId: string;
let customerId: string;
let variantId: string;
let sayac = 0;
let oncekiSecret: string | undefined;

/**
 * Sahte sağlayıcıyla mount edilmiş gerçek rota — kapının kendisi sınanıyor, taklit değil.
 * `handleSendcloudWebhook` sağlayıcıyı parametre alıyor; testin ağa çıkmamasının tek sebebi bu.
 */
function app(parcelRef: string | null, parcelCode: string | null, opts: { throws?: boolean } = {}): Hono<AppEnv> {
  const h = new Hono<AppEnv>();
  h.post('/webhooks/sendcloud', (c) =>
    handleSendcloudWebhook(
      c,
      providerStub({
        status: async () => {
          if (opts.throws) throw Object.assign(new Error('ağ düştü'), { code: 'network' });
          // Koli kimliği BİZİM kutumuzunkiyle eşleşmeli — uzlaştırmanın birincil anahtarı bu.
          return parcelRef === null ? [] : [{ parcelId: parcelRef, trackingNumber: null, code: parcelCode, message: null }];
        },
      }),
    ),
  );
  return h;
}

const govde = (parcelId: string, code = 'DELIVERED', timestamp: number = stamp): string =>
  JSON.stringify({ action: 'parcel_status_changed', timestamp, parcel: { id: parcelId, status: { code } } });

async function post(h: Hono<AppEnv>, body: string, signature?: string | null): Promise<Response> {
  return h.request('/webhooks/sendcloud', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === null ? {} : { 'sendcloud-signature': signature ?? signWebhookBody(SECRET, body) }),
    },
    body,
  });
}

/** Duyurulmuş bir gönderi + tek kutu; koli kimliği webhook'un eşleşme anahtarı. */
async function gonderiKur(): Promise<{ orderId: string; shipmentId: string; parcelRef: string }> {
  const tur = (sayac += 1);
  const { order } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType: 'shipping', status: 'ready' },
    [{ variantId, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  const shipment = await new ShipmentService(db).insert({
    orderId: order.id,
    warehouseId,
    status: 'created',
    providerShipmentId: `sc-wh-${stamp}-${tur}`,
    carrierCode: 'sendcloud',
    carrierName: 'Sendcloud',
  });
  const parcelRef = `pw-${stamp}-${tur}`;
  const box = await new OrderBoxService(db).insert({ orderId: order.id, warehouseId, boxNo: 1, code: `KW-${stamp}-${tur}` });
  await db
    .from('order_box')
    .update({ sealed_at: new Date().toISOString(), shipment_id: shipment.id, provider_parcel_ref: parcelRef })
    .eq('id', box.id);
  return { orderId: order.id, shipmentId: shipment.id, parcelRef };
}

beforeAll(async () => {
  // Süreç env'i KÜRESEL: önce oku, sonra geri koy (CLAUDE §4b — küresel tekil kirletilmez).
  oncekiSecret = process.env.SENDCLOUD_WEBHOOK_SECRET;
  process.env.SENDCLOUD_WEBHOOK_SECRET = SECRET;

  const wh = await createTestWarehouse(db, { label: 'WHK' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);

  const cat = await new CategoryService(db).create({ name: { tr: `Webhook testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Webhook ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [{ label: { tr: 'tek' }, packedWeightG: 500, packedLengthMm: 100, packedWidthMm: 100, packedHeightMm: 100 }],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Webhook müşterisi ${stamp}` })).id;
  profileIds.push(customerId);
});

afterAll(async () => {
  if (oncekiSecret === undefined) delete process.env.SENDCLOUD_WEBHOOK_SECRET;
  else process.env.SENDCLOUD_WEBHOOK_SECRET = oncekiSecret;

  /*
    SÜZGEÇ ÖNEKE DEĞİL DAMGAYA bakıyor — ölçülmüş bir sızıntının düzeltmesi (29.08): önek
    `pw-<stamp>-%` idi, ama "eşleşmeyen koli" testi olayı `bizde-yok-<stamp>:<stamp>` diye
    yazıyor ve o kalıba UYMUYORDU. Satır her koşuda birikiyordu; canlı webhook'u ararken
    `webhook_event`te onu bulup gerçek sanmak an meselesiydi.

    Damga `Date.now()` ve bu koşuya ait, yani süzgeç başka şeridin satırına dokunamaz.
  */
  await db.from('webhook_event').delete().eq('provider', 'sendcloud').like('event_id', `%${stamp}%`);
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

describe('sendcloud webhook — imza', () => {
  it('imzasız istek 400, imzası tutmayan 401 — ikisi ayrı arıza', async () => {
    const k = await gonderiKur();
    expect((await post(app(k.parcelRef, 'DELIVERED'), govde(k.parcelRef), null)).status).toBe(400);
    expect((await post(app(k.parcelRef, 'DELIVERED'), govde(k.parcelRef), 'a'.repeat(64))).status).toBe(401);
  });

  it('GÖVDE HAM doğrulanır — tek boşluk bile imzayı geçersiz kılar', async () => {
    const k = await gonderiKur();
    const body = govde(k.parcelRef);
    // İmza gövdenin kendisinden, "aynı anlama gelen" başka bir yazımından değil.
    expect((await post(app(k.parcelRef, 'DELIVERED'), `${body} `, signWebhookBody(SECRET, body))).status).toBe(401);
  });
});

describe('sendcloud webhook — işleme', () => {
  it('geçerli olay işlenir ve sipariş TESLİME kadar ilerler', async () => {
    const k = await gonderiKur();
    const res = await post(app(k.parcelRef, 'DELIVERED'), govde(k.parcelRef));

    expect(res.status).toBe(200);
    expect((await new ShipmentService(db).getById(k.shipmentId))!.status).toBe('delivered');
    expect((await new OrderService(db).getById(k.orderId))!.status).toBe('delivered');
  });

  it('koli kimliği taşımayan olay 200 alır ve İŞLENMEZ — sağlayıcı 10 tur boşuna koşmasın', async () => {
    const body = JSON.stringify({ action: 'integration_connected', timestamp: stamp });
    const res = await post(app(null, null), body);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
  });

  it('EŞLEŞMEYEN koli 500 alır — duyuru yazımıyla yarışı yeniden deneme penceresi çözer', async () => {
    const res = await post(app(null, 'DELIVERED'), govde(`bizde-yok-${stamp}`));
    expect(res.status).toBe(500);

    // Damga ATILMAZ: olay işlenmemiş kalır, yeniden denendiğinde işlenecek.
    const { data } = await db.from('webhook_event').select('processed_at, error').eq('provider', 'sendcloud').eq('event_id', `bizde-yok-${stamp}:${stamp}`).single();
    expect(data?.processed_at).toBeNull();
    expect(data?.error).toMatch(/öksüz/);
  });

  it('AYNI olay ikinci kez gelirse işlenmez ama 200 alır — yoksa sağlayıcı sonsuza dek dener', async () => {
    const k = await gonderiKur();
    const body = govde(k.parcelRef, 'SORTED');

    expect((await post(app(k.parcelRef, 'SORTED'), body)).status).toBe(200);
    const ikinci = await post(app(k.parcelRef, 'SORTED'), body);
    expect(ikinci.status).toBe(200);
    expect(await ikinci.json()).toEqual({ duplicate: true });
  });

  /**
   * Stripe kapısı burada koşulsuz `duplicate` diyor; bu kulvarda ayrım GEREKLİ çünkü en olası
   * düşüş sebebi geçici (sağlayıcıya çıkan REST çağrısı o an düşer). Koşulsuz 200 dönseydik,
   * 10 turluk yeniden deneme penceresinin tamamı ilk tur bir kez düştüğü için boşa giderdi.
   */
  it('İŞLENEMEMİŞ olayın tekrarı YENİDEN DENENİR — damgasız kayıt "işlendi" sayılmaz', async () => {
    const k = await gonderiKur();
    const body = govde(k.parcelRef, 'SORTED');

    // İlk tur: sağlayıcıya ulaşılamıyor → 500, damga yok.
    expect((await post(app(k.parcelRef, 'SORTED', { throws: true }), body)).status).toBe(500);
    expect((await new ShipmentService(db).getById(k.shipmentId))!.status).toBe('created');

    // İkinci tur AYNI olay: `duplicate` denip geçilmez, gerçekten işlenir.
    const ikinci = await post(app(k.parcelRef, 'SORTED'), body);
    expect(ikinci.status).toBe(200);
    expect(await ikinci.json()).not.toEqual({ duplicate: true });
    expect((await new ShipmentService(db).getById(k.shipmentId))!.status).toBe('in_transit');
  });
});
