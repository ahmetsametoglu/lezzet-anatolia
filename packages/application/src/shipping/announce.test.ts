import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  OrderBoxService,
  OrderService,
  ProductService,
  ShipmentEventService,
  ShipmentService,
  ShippingBoxService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { AnnouncedShipment, ShippingQuote } from '@lezzet/sendcloud';
import { quoteOrderShipment } from './dispatch';
import { handOverBox } from './handover';
import { announceOrderShipment } from './announce';
import type { ShippingRateProvider } from './port';
import { providerStub } from './provider.testkit';

/**
 * GÖNDERİ DUYURUSU (07.12) — gerçek para harcayan tek kapı.
 *
 * Sınanan altı değişmez:
 *   1. Rota siparişine gönderi AÇILMAZ. Kural `check` olamıyor (başka tabloya bakar), o yüzden
 *      kapıda ve burada çivili — kısıtsız bırakılsaydı hiçbir yerde denetlenmezdi.
 *   2. Mühürsüz kutu duyurulmaz: açık kutunun içeriği kesinleşmemiştir, ağırlığı da öyle.
 *   3. Kutu TİPİ seçilmemişse duyurulmaz — ölçü oradan geliyor.
 *   4. Tartılmamış mal tarifeye giremez.
 *   5. İkinci duyuru REDDEDİLİR — ikinci koli gerçek paradır.
 *   6. ⚠ Sağlayıcı düşerse HİÇBİR SATIR YAZILMAZ. Referans projenin "öksüz koli" runbook'unun
 *      sebebi tersiydi (satır önce yazılıyor, çağrı düşünce yarım kayıt kalıyordu).
 */
const db = serviceDb();
const stamp = Date.now();
const warehouseIds: string[] = [];
const productIds: string[] = [];
const categoryIds: string[] = [];
const profileIds: string[] = [];

let warehouseId: string;
let customerId: string;
let variantId: string;
let olcusuzVariantId: string;
let boxTypeId: string;


/**
 * Sahte etiket yükleyicisi — **test GERÇEK ÖZEL KOVAYA YAZMAZ.**
 *
 * Yaşandı 28.08: kapı doğrudan `getR2Private()` çağırırken bu dosya sahte bir PDF'i gerçek kovaya
 * yükledi ve kimse fark etmedi (test yeşil, kovada dosya). Depoda R2'ye yazan başka test YOK —
 * yani sessizce bir kural çiğnenmişti. Yükleyici artık enjekte ediliyor.
 */
function fakeUploader(): { upload: (key: string, pdf: Buffer) => Promise<void>; keys: string[] } {
  const keys: string[] = [];
  return { keys, upload: async (key) => void keys.push(key) };
}

/** Yükleyicisi OLMAYAN kapı — "özel kova yapılandırılmamış" hâli. */
const yukleyicisiz = null;

/**
 * Sahte kimlik sayacı — **dosya düzeyinde**, sağlayıcı örneği düzeyinde DEĞİL.
 *
 * Hem `shipment.provider_shipment_id` hem `order_box.provider_parcel_ref` veritabanında
 * BENZERSİZ. İlk yazımda ikisi de sabitti ve testler birbirinin satırlarıyla çarpıştı — yani
 * **iki kısıt da fikstür tarafından yaşanarak doğrulandı.** Sayaç dosya düzeyinde çünkü her test
 * kendi sağlayıcısını kuruyor; örnek düzeyinde sayaç sıfırdan başlar ve aynı kimliği üretir.
 */
let sahteGonderiSayaci = 0;

function fakeProvider(opts: { throws?: boolean; parcels?: number } = {}): ShippingRateProvider & { calls: number } {
  const state = { calls: 0 };
  return {
    ...providerStub({ cancel: () => Promise.resolve() }),
    get calls() {
      return state.calls;
    },
    announce: async (args): Promise<AnnouncedShipment> => {
      state.calls += 1;
      if (opts.throws) throw Object.assign(new Error('sağlayıcı reddetti'), { code: 'validation' });
      const tur = (sahteGonderiSayaci += 1);
      return {
        providerShipmentId: `sc-${stamp}-${tur}`,
        carrierCode: 'chronopost',
        carrierName: 'Chronopost',
        parcels: args.parcels.map((_, i) => ({
          providerParcelRef: `p-${stamp}-${tur}-${i}`,
          trackingNumber: `TR-${stamp}-${tur}-${i}`,
          trackingUrl: `https://takip/${i}`,
          labelPdf: Buffer.from('PDF'),
        })),
        warnings: [],
      };
    },
  };
}

/** Kutu kodu GLOBAL benzersiz — `boxNo` her siparişte 1'den başlar, sayaç ayrı tutulur. */
let kodSayaci = 0;

/**
 * Mühürlü kutu kurar — hâl DOĞRUDAN yazılıyor, mühür RPC'siyle değil, ve bu bilinçli:
 * `seal_order_box` tam bir stok zinciri istiyor (parti, rezervasyon, picks) ve o zincirin kendi
 * testi 23.6'da. Burada sınanan DUYURU; kutunun nasıl mühürlendiği bu testin konusu değil.
 */
async function kutuKur(orderId: string, opts: { boxNo: number; tipli?: boolean; itemId: string; qty: number }): Promise<string> {
  kodSayaci += 1;
  const box = await new OrderBoxService(db).insert({
    orderId,
    warehouseId,
    boxNo: opts.boxNo,
    code: `KT-${stamp}-${kodSayaci}`,
  });
  await db.from('order_box').update({ sealed_at: new Date().toISOString(), shipping_box_id: opts.tipli === false ? null : boxTypeId }).eq('id', box.id);
  await db.from('order_box_item').insert({ box_id: box.id, order_item_id: opts.itemId, qty: opts.qty });
  return box.id;
}

async function siparisKur(
  deliveryType: 'shipping' | 'route',
  useVariant = variantId,
  /* Adres kopyası siparişin kendisinde durur ve gönderi ORAYA gider — kapı onu buradan okuyor.
     `null` geçmek "adres kopyası hiç yazılmamış" hâlini kurar (`no_recipient` testi). */
  addressSnapshot: Record<string, unknown> | null = { country: 'FR', postalCode: '75001', city: 'Paris', recipient: 'Alıcı', line1: '1 rue de Rivoli', phone: '+33100000000' },
): Promise<{ orderId: string; itemId: string }> {
  const { order, items } = await new OrderService(db).create(
    { customerId, warehouseId, channel: 'b2c', deliveryType, status: 'confirmed', addressSnapshot },
    [{ variantId: useVariant, qty: 2, unitPriceCents: 1500, vatRate: 5.5 }],
  );
  return { orderId: order.id, itemId: items[0]!.id };
}

beforeAll(async () => {
  const wh = await createTestWarehouse(db, { label: 'DUY' });
  warehouseId = wh.id;
  warehouseIds.push(wh.id);
  await new WarehouseService(db).update({ id: wh.id, address: { line1: 'Depo sok. 3', postalCode: '67000', city: 'Strasbourg' } });

  const cat = await new CategoryService(db).create({ name: { tr: `Duyuru testi ${stamp}` } });
  categoryIds.push(cat.id);
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Duyuru ürünü ${stamp}` },
    categoryId: cat.id,
    variants: [
      { label: { tr: 'ölçülü' }, packedWeightG: 600, packedLengthMm: 140, packedWidthMm: 90, packedHeightMm: 60 },
      { label: { tr: 'tartılmamış' } },
    ],
  });
  productIds.push(product.id);
  variantId = variants[0]!.id;
  olcusuzVariantId = variants[1]!.id;

  customerId = (await new UserProfileService(db).insert({ name: `Duyuru müşterisi ${stamp}` })).id;
  profileIds.push(customerId);

  boxTypeId = (
    await new ShippingBoxService(db).insert({
      warehouseId,
      name: `Duyuru kutusu ${stamp}`,
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      tareG: 130,
      maxContentG: 10_000,
    })
  ).id;
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await purgeTestData(db, { productIds, categoryIds, profileIds, warehouseIds });
});

/* Alıcı adresi artık GİRDİDE DEĞİL: kapı onu siparişin kendi kopyasından okuyor (29.08 —
   `dispatch.ts` künyesi). Çağıran yalnız "hangi sipariş, hangi servis" diyor. */
const girdi = (orderId: string) => ({
  orderId,
  warehouseId,
  shippingOptionCode: 'sendcloud:letter',
});

describe('announceOrderShipment — ön koşullar (sağlayıcıya eksik girdiyle gidilmez)', () => {
  it('ROTA siparişine gönderi açılmaz — kural `check` olamıyor, kapıda duruyor', async () => {
    const { orderId, itemId } = await siparisKur('route');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toMatchObject({ status: 'not_shipping' });
    expect(p.calls).toBe(0);
  });

  it('MÜHÜRSÜZ sipariş duyurulmaz — açık kutunun ağırlığı kesinleşmemiştir', async () => {
    const { orderId } = await siparisKur('shipping');
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toMatchObject({ status: 'no_sealed_box' });
    expect(p.calls).toBe(0);
  });

  it('kutu TİPİ seçilmemişse duyurulmaz ve HANGİ kutu olduğu söylenir', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2, tipli: false });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toMatchObject({ status: 'box_type_missing', boxNos: [1] });
    expect(p.calls).toBe(0);
  });

  it('TARTILMAMIŞ mal tarifeye giremez', async () => {
    const { orderId, itemId } = await siparisKur('shipping', olcusuzVariantId);
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toMatchObject({ status: 'unmeasured', variantIds: [olcusuzVariantId] });
    expect(p.calls).toBe(0);
  });

  it('BAŞKA deponun operatörü duyuramaz — depo bir boyut değil değişmez', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    const yabanci = await announceOrderShipment(db, p, { ...girdi(orderId), warehouseId: crypto.randomUUID() }, fakeUploader().upload);
    expect(yabanci).toMatchObject({ status: 'not_found' });
    expect(p.calls).toBe(0);
  });
});

describe('announceOrderShipment — duyuru', () => {
  it('gönderi açılır, HER KUTU kendi takip numarasını alır, defter ilk satırını yazar', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    const box1 = await kutuKur(orderId, { boxNo: 1, itemId, qty: 1 });
    const box2 = await kutuKur(orderId, { boxNo: 2, itemId, qty: 1 });

    const sonuc = await announceOrderShipment(db, fakeProvider(), { ...girdi(orderId), quotedCents: 1190 }, fakeUploader().upload);
    expect(sonuc.status).toBe('ok');

    const boxes = await new OrderBoxService(db).listByOrder(orderId);
    const takip = new Map(boxes.map((b) => [b.id, b.trackingNumber]));
    // Numaralar SIRAYLA kutulara dağıtılır: 1. kutu 1. koli, 2. kutu 2. koli.
    expect(takip.get(box1)).toMatch(/-0$/);
    expect(takip.get(box2)).toMatch(/-1$/);
    expect(takip.get(box1)).not.toBe(takip.get(box2));
    // İKİ KİMLİK UZAYI: gönderi kimliği shipment'ta, koli kimliği kutuda.
    expect(boxes.every((b) => b.providerParcelRef !== null)).toBe(true);

    const [shipment] = await new ShipmentService(db).listByOrder(orderId);
    expect(shipment).toMatchObject({ carrierCode: 'chronopost', quotedCents: 1190 });
    expect(shipment!.providerShipmentId).toMatch(/^sc-/);

    const events = await new ShipmentEventService(db).listByShipment(shipment!.id);
    expect(events.map((e) => e.providerCode)).toEqual(['ANNOUNCED']);
  });

  it('bildirilen ağırlık İÇERİK + DARA — kutunun kendisi de taşınıyor', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });

    let gonderilen: number | null = null;
    const p: ShippingRateProvider = providerStub({
      announce: async (args) => {
        gonderilen = args.parcels[0]!.weightG;
        const tur = (sahteGonderiSayaci += 1);
        return {
          providerShipmentId: `sc-agirlik-${stamp}-${tur}`,
          carrierCode: 'c',
          carrierName: 'C',
          parcels: [{ providerParcelRef: `p-agirlik-${stamp}-${tur}`, trackingNumber: `TR-agirlik-${stamp}-${tur}`, trackingUrl: null, labelPdf: null }],
          warnings: [],
        };
      },
    });
    await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload);
    // 2 × 600 g içerik + 130 g dara
    expect(gonderilen).toBe(1330);
  });

  it('etiket saklanır ve anahtarı KUTUYA yazılır', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    const boxId = await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const yukleyici = fakeUploader();

    const sonuc = await announceOrderShipment(db, fakeProvider(), girdi(orderId), yukleyici.upload);
    expect(sonuc.status).toBe('ok');
    // Anahtar KUTUYA çıpalı — bir kutunun bir etiketi vardır, yeniden alınırsa üstüne yazılır.
    expect(yukleyici.keys).toEqual([`shipping-labels/${boxId}.pdf`]);
    const [box] = (await new OrderBoxService(db).listByOrder(orderId)).filter((b) => b.id === boxId);
    expect(box?.labelKey).toBe(`shipping-labels/${boxId}.pdf`);
  });

  it('ETİKET saklanamazsa duyuru GERİ ÇEKİLMEZ — ödenmiş etiket kayıt dışı bırakılmaz', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });

    // Özel kova yapılandırılmamış hâli. Doğru davranış: gönderi YAZILIR, `labelKey` boş kalır
    // ve hangi kutu olduğu SÖYLENİR (23.7 çizgisi: basım hatası kutu kapanışını geri çekmez).
    const sonuc = await announceOrderShipment(db, fakeProvider(), girdi(orderId), yukleyicisiz);
    expect(sonuc.status).toBe('ok');
    expect(sonuc.status === 'ok' && sonuc.labelFailures).toEqual([1]);
    expect(await new ShipmentService(db).listByOrder(orderId)).toHaveLength(1);

    // Ve eksiklik DEFTERE yazılıyor — sessizce kaybolmuyor.
    const [shipment] = await new ShipmentService(db).listByOrder(orderId);
    const [event] = await new ShipmentEventService(db).listByShipment(shipment!.id);
    expect(event?.message).toMatch(/etiket saklanamadı/);
  });

  it('İKİNCİ duyuru reddedilir — ikinci koli gerçek paradır', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();
    const yukleyici = fakeUploader();
    const ilk = await announceOrderShipment(db, p, girdi(orderId), yukleyici.upload);
    expect(ilk.status).toBe('ok');

    const ikinci = await announceOrderShipment(db, p, girdi(orderId), yukleyici.upload);
    expect(ikinci).toMatchObject({ status: 'already_announced' });
    // Sağlayıcıya İKİNCİ kez gidilmedi.
    expect(p.calls).toBe(1);
  });

  it('⚠ sağlayıcı düşerse HİÇBİR SATIR YAZILMAZ — öksüz koli üretmeyiz', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    const boxId = await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });

    const sonuc = await announceOrderShipment(db, fakeProvider({ throws: true }), girdi(orderId), fakeUploader().upload);
    expect(sonuc).toMatchObject({ status: 'provider_error', code: 'validation' });

    expect(await new ShipmentService(db).listByOrder(orderId)).toHaveLength(0);
    const [box] = (await new OrderBoxService(db).listByOrder(orderId)).filter((b) => b.id === boxId);
    expect(box?.trackingNumber).toBeNull();
    expect(box?.shipmentId).toBeNull();
  });
});

/*
  ALICI ADRESİ SİPARİŞTEN OKUNUYOR (29.08) — çağıran adres göndermiyor.

  Ölçülen iddia: adres kopyası olmayan bir sipariş sağlayıcıya HİÇ gitmiyor. Eskiden adres girdide
  geliyordu; o hâlde depocunun telefonu müşteri adresini kuran taraf olurdu ve yanlış yazılmış bir
  posta kodu hem yanlış tarife hem yanlış teslimat demekti.
*/
describe('alıcı adresi (29.08)', () => {
  it('adres kopyası YOKSA duyurulmaz ve sağlayıcıya çıkılmaz', async () => {
    const { orderId, itemId } = await siparisKur('shipping', variantId, null);
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();

    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toEqual({ status: 'no_recipient' });
    expect(p.calls).toBe(0);
  });

  it('POSTA KODU boşsa da duyurulmaz — ülke tek başına tarife hesaplatmaz', async () => {
    const { orderId, itemId } = await siparisKur('shipping', variantId, { country: 'FR', city: 'Paris' });
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const p = fakeProvider();

    expect(await announceOrderShipment(db, p, girdi(orderId), fakeUploader().upload)).toEqual({ status: 'no_recipient' });
    expect(p.calls).toBe(0);
  });
});

/*
  DEPOCUNUN SERVİS LİSTESİ (`quoteOrderShipment`, 29.08) — üç iddia.

  Liste GERÇEK kolilere göre soruluyor: sağlayıcıya giden koli sayısı, duyuruda gidecek olanla aynı
  olmak zorunda. Ayrı hesaplansaydı "listede gördüğüm seçenek satın alırken reddedildi" hâli doğardı
  ve o hâl PARA harcandıktan sonra görünürdü.
*/
describe('sevk seçenekleri (quoteOrderShipment · 29.08)', () => {
  function teklifVeren(options: Array<Partial<ShippingQuote> & { code: string }>): ShippingRateProvider & { parcels: number } {
    const state = { parcels: 0 };
    return {
      ...providerStub({ cancel: () => Promise.resolve() }),
      get parcels() {
        return state.parcels;
      },
      quote: async (args) => {
        state.parcels = args.parcels.length;
        return options.map((o) => ({
          carrierCode: 'x', carrierName: 'X', name: o.code, currency: 'EUR', priceCents: 1000,
          leadTimeHours: null, lastMile: 'home_delivery', signature: false, tracked: true,
          ecoDelivery: false, multicollo: true, ...o,
        })) as ShippingQuote[];
      },
    };
  }

  it('ön koşullar duyuruyla AYNI kapıdan geçiyor — tipsiz kutuda sağlayıcıya çıkılmaz', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2, tipli: false });
    const p = teklifVeren([{ code: 'a' }]);

    expect(await quoteOrderShipment(db, p, { orderId, warehouseId })).toMatchObject({ status: 'box_type_missing', boxNos: [1] });
    expect(p.parcels).toBe(0);
  });

  it('koliler MÜHÜRLÜ KUTULARDAN kuruluyor ve fiyatsız/sıfır seçenekler eleniyor', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 1 });
    await kutuKur(orderId, { boxNo: 2, itemId, qty: 1 });
    const p = teklifVeren([
      // Sağlayıcının her sorguya döndürdüğü ücretsiz "mektup" kanalı — GERÇEK bir kargo hizmeti
      // değil ve ucuzdan sıralı listede daima başa geçer. Elenmezse depocuya 15 kg'lık koliyi
      // mektupla göndermeyi önerirdik (müşteri yüzeyinde ölçülen arızanın aynısı).
      { code: 'sendcloud:letter', priceCents: 0 },
      { code: 'pahali', priceCents: 2500 },
      { code: 'ucuz', priceCents: 900 },
      { code: 'fiyatsiz', priceCents: null },
    ]);

    const sonuc = await quoteOrderShipment(db, p, { orderId, warehouseId });
    expect(p.parcels).toBe(2);
    expect(sonuc).toMatchObject({ status: 'ok', parcelCount: 2 });
    if (sonuc.status !== 'ok') throw new Error('teklif bekleniyordu');
    expect(sonuc.options.map((o) => o.code)).toEqual(['ucuz', 'pahali']);
  });

  /**
   * **ÜCRETSİZ KARGO EVE GİDER** (kullanıcı kararı 29.08) — ve kural BURADA bağlayıcı.
   *
   * Ölçüldü: müşterinin checkout'ta seçtiği servis kodu hiçbir yere yazılmıyor, taşıyıcıyı sevk
   * anında depo seçiyor. Kuralı yalnız checkout'a koysaydık onu SÖYLEMİŞ ama UYGULAMAMIŞ olurduk:
   * depo yine teslim noktası satın alabilirdi ve müşteri ücretsiz kargo bekleyip kolisini
   * noktada bulurdu.
   */
  it('ÜCRETSİZ kargoda yalnız ADRESE TESLİM seçenekleri kalır — parayı biz ödüyoruz', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    await db.from('order').update({ shipping_fee: 0 }).eq('id', orderId);
    const p = teklifVeren([
      { code: 'ucuz-nokta', priceCents: 500, lastMile: 'service_point' },
      { code: 'bilinmeyen', priceCents: 600, lastMile: null },
      { code: 'eve', priceCents: 1500, lastMile: 'home_delivery' },
    ]);

    const sonuc = await quoteOrderShipment(db, p, { orderId, warehouseId });
    if (sonuc.status !== 'ok') throw new Error('teklif bekleniyordu');
    // En ucuz iki seçenek elendi ve bu doğru: biri teslimat noktası, ötekinin son adımı BİLİNMİYOR
    // — "bilmiyorum" ile "eve gidiyor" aynı şey değil (CLAUDE §1).
    expect(sonuc.options.map((o) => o.code)).toEqual(['eve']);
    // Daraltma EKRANDA da söylenir: bayrak olmadan depocu listeyi eksik sanardı.
    expect(sonuc.homeOnly).toBe(true);
  });

  it('müşteri ÖDÜYORSA teslimat noktası da listede kalır — seçim onun', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    await db.from('order').update({ shipping_fee: 4.99 }).eq('id', orderId);
    const p = teklifVeren([
      { code: 'nokta', priceCents: 500, lastMile: 'service_point' },
      { code: 'eve', priceCents: 1500, lastMile: 'home_delivery' },
    ]);

    const sonuc = await quoteOrderShipment(db, p, { orderId, warehouseId });
    if (sonuc.status !== 'ok') throw new Error('teklif bekleniyordu');
    expect(sonuc.options.map((o) => o.code)).toEqual(['nokta', 'eve']);
    expect(sonuc.homeOnly).toBe(false);
  });

  it('ÇOK KOLİDE multicollo desteklemeyen seçenek listeden düşer', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 1 });
    await kutuKur(orderId, { boxNo: 2, itemId, qty: 1 });
    const p = teklifVeren([
      { code: 'tek-koli', priceCents: 500, multicollo: false },
      { code: 'cok-koli', priceCents: 1500, multicollo: true },
    ]);

    const sonuc = await quoteOrderShipment(db, p, { orderId, warehouseId });
    if (sonuc.status !== 'ok') throw new Error('teklif bekleniyordu');
    // En UCUZ olan elendi ve bu doğru: satın alma anında sağlayıcı onu reddeder ve sipariş
    // sevk edilemez hâlde kalırdı.
    expect(sonuc.options.map((o) => o.code)).toEqual(['cok-koli']);
  });
});

/*
  DEVİR OKUTMASI (`handOverBox`, 29.08) — kutu fiziksel olarak taşıyıcıya verildi.

  Ölçülen dört iddia: iki kimlik uzayı da kabul ediliyor · sayım GÖNDERİYİ sayıyor · SON kutu
  gönderiyi ve siparişi taşıyor · ikinci okutma sayacı kıpırdatmıyor.
*/
describe('devir okutması (29.08)', () => {
  const shipments = new ShipmentService(db);

  /** Duyurulmuş bir gönderi kurar ve kutularını döndürür — devirin ön koşulu budur. */
  async function duyurulmusGonderi(kutuSayisi: number) {
    const { orderId, itemId } = await siparisKur('shipping');
    for (let n = 1; n <= kutuSayisi; n++) await kutuKur(orderId, { boxNo: n, itemId, qty: 1 });
    const sonuc = await announceOrderShipment(db, fakeProvider(), girdi(orderId), fakeUploader().upload);
    if (sonuc.status !== 'ok') throw new Error(`duyuru bekleniyordu: ${sonuc.status}`);
    const kutular = await new OrderBoxService(db).listByOrder(orderId);
    return { orderId, sonuc, kutular: [...kutular].sort((a, b) => a.boxNo - b.boxNo) };
  }

  it('TAŞIYICININ numarası da BİZİM kodumuz da kutuya çözülür', async () => {
    const { kutular } = await duyurulmusGonderi(2);

    const takiple = await handOverBox(db, { code: kutular[0]!.trackingNumber!, warehouseId, actorId: customerId });
    expect(takiple).toMatchObject({ status: 'ok', boxNo: 1, handedBoxes: 1, boxCount: 2, shipmentHandedOver: false });

    // Etiketi basılamamış ya da elle taşıyıcı girilmiş gönderide kutunun üstünde taşıyıcı barkodu
    // olmayabilir; depocunun elinde hazırlık kâğıdındaki kod kalır. İkisi de BİZİM kayıtlarımız.
    const kodla = await handOverBox(db, { code: kutular[1]!.code, warehouseId, actorId: customerId });
    expect(kodla).toMatchObject({ status: 'ok', boxNo: 2, handedBoxes: 2, shipmentHandedOver: true });
  });

  it('SON kutu gönderiyi `handed_over` yapar ve siparişi YOLA çıkarır', async () => {
    const { orderId, sonuc, kutular } = await duyurulmusGonderi(2);
    if (sonuc.status !== 'ok') throw new Error('duyuru bekleniyordu');

    await handOverBox(db, { code: kutular[0]!.code, warehouseId, actorId: customerId });
    // İlk kutudan SONRA hiçbir şey kıpırdamamalı: yarım devredilmiş gönderi yola çıkmış sayılmaz.
    // (Fikstür siparişi `confirmed` kuruyor — kutular doğrudan yazıldığı için mühür RPC'si hiç
    // koşmadı ve sipariş `ready`ye geçmedi. Kapı üç hazırlık durumundan da yola çıkarıyor.)
    expect((await shipments.getById(sonuc.shipmentId))!.status).toBe('created');
    expect((await new OrderService(db).getById(orderId))!.status).toBe('confirmed');

    await handOverBox(db, { code: kutular[1]!.code, warehouseId, actorId: customerId });
    expect((await shipments.getById(sonuc.shipmentId))!.status).toBe('handed_over');
    expect((await new OrderService(db).getById(orderId))!.status).toBe('out_for_delivery');
  });

  it('İKİNCİ okutma sayacı KIPIRDATMAZ — "zaten verildi"', async () => {
    const { kutular } = await duyurulmusGonderi(2);
    await handOverBox(db, { code: kutular[0]!.code, warehouseId, actorId: customerId });

    const ikinci = await handOverBox(db, { code: kutular[0]!.code, warehouseId, actorId: customerId });
    expect(ikinci).toEqual({ status: 'already_handed', boxNo: 1, handedBoxes: 1, boxCount: 2 });
  });

  it('DUYURULMAMIŞ kutu devredilemez ve BAŞKA deponun kutusu reddedilir', async () => {
    const { orderId, itemId } = await siparisKur('shipping');
    await kutuKur(orderId, { boxNo: 1, itemId, qty: 2 });
    const kutu = (await new OrderBoxService(db).listByOrder(orderId))[0]!;

    // Satın alınmamış etiketle kutu taşıyıcıya verilemez — verilse takip numarası hiç doğmazdı.
    expect(await handOverBox(db, { code: kutu.code, warehouseId, actorId: customerId })).toEqual({
      status: 'not_announced',
      boxNo: 1,
    });

    // Kapsam dışı depo: kutu var ama bu depocunun değil. Referans söyleniyor ki depocu onu
    // rampada DOĞRU yığına geri koysun — sessiz bir ret kutuyu yanlış araca bindirirdi.
    const yabanci = await createTestWarehouse(db, { label: 'DVR' });
    warehouseIds.push(yabanci.id);
    const { kutular } = await duyurulmusGonderi(1);
    expect(await handOverBox(db, { code: kutular[0]!.code, warehouseId: yabanci.id, actorId: customerId })).toMatchObject({
      status: 'out_of_scope',
    });
  });
});
