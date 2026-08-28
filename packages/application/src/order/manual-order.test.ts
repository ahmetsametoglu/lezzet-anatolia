import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderSource } from '@lezzet/types';
import {
  AddressService,
  CategoryService,
  DeliveryZoneService,
  OrderService,
  PriceService,
  ProductService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, settingsSnapshot, purgeVariantStock, mustDelete, type SettingsSnapshot, testPostalCode } from '@lezzet/database/testing';
import { createCheckoutDraft } from './checkout-draft';
import { placeOrder } from './place-order';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * **Elle sipariş girişi — personel yolu** (09.8).
 *
 * Sınanan şey "sipariş yazıldı mı" değil: personel yolu müşteri yoluyla AYNI orkestrasyonu
 * kullanıyor (ikinci bir sipariş kuralı yazılmadı) ve aralarındaki fark yalnız dört noktada.
 * Bu dosya o dört farkın **gerçekten var olduğunu** ve **fazlasının olmadığını** tutuyor.
 *
 * En kritik iddia ikincisi: pazarlıklı fiyat siparişin TOPLAMINA yansımalı. Fiyat kalem yazımında
 * üstüne yazılsaydı kalemler ucuzlar, başlık toplamı liste fiyatından kalırdı — sipariş kendi
 * toplamıyla çelişir ve ödeme durumu motoru müşteriyi sonsuza kadar borçlu görürdü. Hiçbir yerde
 * hata çıkmaz; yalnız müşteri "kısmi ödendi" olarak kalır.
 */
const db = serviceDb();
const stamp = Date.now();
/** Önek 99: FR referansında 99 ile başlayan kod yok — gerçek bir kodla çakışıp şehir kontrolüne takılmasın. */
const rotaKodu = testPostalCode();

let categoryId: string;
let warehouseId: string;
let productId: string;
let fiyatsizProductId: string;
let variantId: string;
/** Kanal fiyatı OLMAYAN varyant — "satışa kapalı" hâlinin ta kendisi. */
let fiyatsizVariantId: string;
let customerId: string;
let personelId: string;
let addressId: string;
let zoneId: string;
let minBasket: SettingsSnapshot;
const createdProfiles: string[] = [];

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Bölgenin yaklaşan ilk teslimat günü. Tarih ELLE YAZILMAZ: sabit bir gün, geçtiği gün testi
 * kodunda hiçbir şey değişmeden çürütür. Rota siparişinde gün doğrulanır (`date_unavailable`),
 * yani boş bırakmak da olmaz — bölge birden çok güne açıksa kapı seçim bekler.
 */
async function ilkUygunGun(): Promise<string> {
  const inputs = await readDeliveryInputs(db);
  const { availableDates } = await resolveDelivery(db, { postalCode: rotaKodu, country: 'FR', inputs });
  return availableDates[0]!;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Elle giriş testi ${stamp}` } })).id;

  const urun = await new ProductService(db).create({
    name: { tr: `Baklava ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `MAN-B-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;

  const fiyatsiz = await new ProductService(db).create({
    name: { tr: `Şöbiyet ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '500 g' }, sku: `MAN-S-${stamp}` }],
  });
  fiyatsizProductId = fiyatsiz.product.id;
  fiyatsizVariantId = fiyatsiz.variants[0]!.id;

  // Yalnız birincisine fiyat yazılıyor: ikincisi bilerek fiyatsız kalıyor.
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 2000 });

  const stocks = new StockService(db);
  await stocks.insert({ warehouseId, variantId, physicalQty: 50, expiryDate: gun(120), purchasePriceCents: 800 });
  await stocks.insert({
    warehouseId,
    variantId: fiyatsizVariantId,
    physicalQty: 50,
    expiryDate: gun(120),
    purchasePriceCents: 400,
  });

  const profiles = new UserProfileService(db);
  // Müşteri ve personel: ikisi de auth kullanıcısı OLMADAN açılıyor (`auth_user_id` nullable) —
  // telefonla gelen siparişin müşterisi zaten hesabı olmayabilir, bu yolun kendi gerçeği.
  const musteri = await profiles.insert({ name: `Elle Müşteri ${stamp}`, phone: `+3360000${String(stamp).slice(-4)}` });
  customerId = musteri.id;
  createdProfiles.push(musteri.id);
  const personel = await profiles.insert({ name: `Operatör ${stamp}`, roles: ['admin'] });
  personelId = personel.id;
  createdProfiles.push(personel.id);

  const zoneSvc = new DeliveryZoneService(db);
  zoneId = (await zoneSvc.insert({ name: `Elle bölge ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zoneSvc.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Ayşe Yılmaz',
      phone: '+33612345678',
      line1: '1 rue du Test',
      postalCode: rotaKodu,
      city: 'Strasbourg',
    })
  ).id;

  // Asgari sepet BU DOSYANIN KONUSU — biri onu aşmayı, öteki aşmamayı sınıyor. Küresel satır
  // değiştiriliyor, o yüzden okunup `afterAll`da geri konuyor (CLAUDE §4b).
  minBasket = settingsSnapshot(db);
  await minBasket.override('min_basket_cents', 4000);
  SettingsService.invalidate();
});

beforeEach(async () => {
  // Parti BURADA SİLİNMEZ (`beforeAll`da bir kez kuruluyor, testler paylaşıyor). Silme `mustDelete`
  // ile: `delete()` hatayı yutar ve siparişi tutan bir defter satırı doğduğu gün teardown sessizce
  // yarım kalırdı (06.14 · künye `packages/application/src/courier/day.test.ts`te).
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
});

afterAll(async () => {
  await minBasket.restore();
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeVariantStock(db, [variantId, fiyatsizVariantId]);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId, fiyatsizProductId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

/** Tek kalemlik personel siparişi — testlerin ortak iskeleti. */
async function elleSiparis(
  opts: {
    qty?: number;
    overrides?: ReadonlyMap<string, number>;
    isGiftOrder?: boolean;
    variant?: string;
    staff?: boolean;
    /** Sohbet köprüsünün geçirdiği kaynak (15.4) — verilmezse personel yolu `manual` kalır. */
    orderSource?: OrderSource;
  } = {},
) {
  return createCheckoutDraft(db, {
    locale: 'tr',
    customerId,
    entries: [{ kind: 'variant', variantId: opts.variant ?? variantId, qty: opts.qty ?? 3, stockId: null }],
    addressId,
    deliveryDate: await ilkUygunGun(),
    paymentMethod: 'cash',
    staff:
      opts.staff === false
        ? undefined
        : {
            actorId: personelId,
            priceOverrides: opts.overrides,
            isGiftOrder: opts.isGiftOrder,
            orderSource: opts.orderSource,
          },
  });
}

/** Bu testin varyantına ayrılmış toplam adet — rezervasyonun gerçekten yazıldığının ölçüsü. */
async function rezerveAdet(): Promise<number> {
  const { data } = await db.from('reservation').select('qty').eq('variant_id', variantId);
  return (data ?? []).reduce((a, r) => a + r.qty, 0);
}

async function kalemleriOku(orderId: string) {
  const { data } = await db
    .from('order_item')
    .select('unit_price,list_unit_price,price_set_by')
    .eq('order_id', orderId);
  return data ?? [];
}

describe('elle sipariş — personel yolu (09.8)', () => {
  it('kaynağı `manual` yazar; müşteri yolu `web` kalır', async () => {
    const personelSip = await elleSiparis();
    expect(personelSip.status).toBe('ok');
    const a = await new OrderService(db).getById((personelSip as { orderId: string }).orderId);
    expect(a!.orderSource).toBe('manual');

    // Aynı sepet, personel künyesi OLMADAN: 3 × 20 € = 60 € eşiği geçiyor, yani müşteri yolu da açılır.
    const musteriSip = await elleSiparis({ staff: false });
    expect(musteriSip.status).toBe('ok');
    const b = await new OrderService(db).getById((musteriSip as { orderId: string }).orderId);
    expect(b!.orderSource).toBe('web');
  });

  it('SOHBET köprüsü kendi kaynağını geçirir (15.4) — köprüsüz personel yolu `manual` kalır', async () => {
    // Kanal (`channel`) ile kaynak (`orderSource`) AYRI eksenler: ikisi de b2c bir siparişte,
    // biri "hangi fiyat listesi", öteki "hangi yüzeyden geldi" sorusunu cevaplar. Sohbetten açılan
    // sipariş masada yazılır ama WhatsApp'tan gelmiştir ve raporda öyle görünmelidir.
    const sohbetten = await elleSiparis({ orderSource: 'whatsapp' });
    expect(sohbetten.status).toBe('ok');
    const order = await new OrderService(db).getById((sohbetten as { orderId: string }).orderId);
    expect(order!.orderSource).toBe('whatsapp');
    // Kanal DEĞİŞMEZ: kaynak kanalı belirlemez, müşterinin kendisi belirler.
    expect(order!.channel).toBe('b2c');
  });

  it('hediye işaretini yalnız personel yolu yazar', async () => {
    const ikram = await elleSiparis({ isGiftOrder: true });
    const order = await new OrderService(db).getById((ikram as { orderId: string }).orderId);
    expect(order!.isGiftOrder).toBe(true);

    const normal = await elleSiparis();
    const order2 = await new OrderService(db).getById((normal as { orderId: string }).orderId);
    expect(order2!.isGiftOrder).toBe(false);
  });

  /**
   * **Bu dosyanın en pahalı iddiası.** Pazarlık sepet okumasına giriyor, yani başlık toplamı da
   * kalem fiyatları da AYNI sayıdan türüyor. Kalem yazımında üstüne yazılsaydı buradaki toplam
   * 6000 kalır, kalemler 4500 olur ve ödeme motoru siparişi sonsuza kadar "kısmi" görürdü.
   */
  it('pazarlıklı fiyat siparişin TOPLAMINA yansır ve başlık kalemleriyle tutarlı kalır', async () => {
    const orders = new OrderService(db);

    /* Toplam SABİT SAYIYA çivilenmiyor: yereldeki otomatik kampanyalar tutarı oynatır (ölçüldü —
       6000 yerine 5520 döndü, %8'lik seed kampanyası) ve testin ölçtüğü şey o değil. Sınanan
       değişmez, siparişin KENDİ İÇİNDE tutarlı olması: başlık toplamı = Σ(kalem × adet) − indirim
       + kargo. Pazarlık kalem yazımında uygulansaydı tam bu eşitlik bozulurdu — kalemler ucuzlar,
       başlık liste fiyatından kalırdı; hiçbir yerde hata çıkmaz, yalnız ödeme motoru müşteriyi
       sonsuza kadar borçlu görürdü. */
    const tutarli = async (orderId: string) => {
      const order = await orders.getById(orderId);
      const kalemler = await kalemleriOku(orderId);
      const { data: adetler } = await db.from('order_item').select('unit_price,qty').eq('order_id', orderId);
      const kalemToplam = (adetler ?? []).reduce((a, k) => a + Math.round(Number(k.unit_price) * 100) * k.qty, 0);
      expect(order!.totalCents).toBe(kalemToplam - order!.discountAmountCents + order!.shippingFeeCents);
      return { order: order!, kalemler };
    };

    const listeyle = await tutarli(((await elleSiparis()) as { orderId: string }).orderId);
    const pazarlikli = await tutarli(
      ((await elleSiparis({ overrides: new Map([[variantId, 1500]]) })) as { orderId: string }).orderId,
    );

    // Kalem fiyatı gerçekten pazarlıklı olan, ve toplam ONU izliyor.
    expect(Number(listeyle.kalemler[0]!.unit_price)).toBe(20);
    expect(Number(pazarlikli.kalemler[0]!.unit_price)).toBe(15);
    expect(pazarlikli.order.totalCents).toBeLessThan(listeyle.order.totalCents);
  });

  it('pazarlık izini kaleme yazar — liste fiyatı ve KİM birlikte', async () => {
    const sonuc = await elleSiparis({ overrides: new Map([[variantId, 1500]]) });
    const kalemler = await kalemleriOku((sonuc as { orderId: string }).orderId);
    expect(kalemler).toHaveLength(1);
    expect(Number(kalemler[0]!.unit_price)).toBe(15);
    expect(Number(kalemler[0]!.list_unit_price)).toBe(20);
    expect(kalemler[0]!.price_set_by).toBe(personelId);
  });

  /**
   * İz yalnız GERÇEKTEN pazarlık edilmiş kalemde durur. Her kaleme liste fiyatını kopyalasaydık
   * normal siparişlerin tamamı "taviz verildi" kaydı taşırdı ve `Σ(liste − satış)` raporu sıfır
   * yerine anlamsız bir gürültü üretirdi.
   */
  it('pazarlık yoksa iz BOŞ kalır — sahte taviz kaydı doğmaz', async () => {
    const listeyle = await kalemleriOku((((await elleSiparis()) as { orderId: string })).orderId);
    expect(listeyle[0]!.list_unit_price).toBeNull();
    expect(listeyle[0]!.price_set_by).toBeNull();

    // Liste fiyatının AYNISI elle yazılırsa da iz doğmaz: pazarlık yapılmamıştır.
    const ayniSayi = await kalemleriOku(
      ((await elleSiparis({ overrides: new Map([[variantId, 2000]]) })) as { orderId: string }).orderId,
    );
    expect(ayniSayi[0]!.list_unit_price).toBeNull();
    expect(ayniSayi[0]!.price_set_by).toBeNull();
  });

  it('asgari sepeti personel yolunda SORMAZ, müşteri yolunda sorar', async () => {
    // 1 × 20 € = 20 €, eşik 40 € — müşteri yolu kapanır.
    const musteri = await elleSiparis({ qty: 1, staff: false });
    expect(musteri.status).toBe('min_basket');

    const personel = await elleSiparis({ qty: 1 });
    expect(personel.status).toBe('ok');
  });

  /**
   * Elle fiyat yazmak SATIŞA KAPALI bir ürünü diriltmez: `blocked` ölçütü liste fiyatının
   * varlığıdır. Aksi hâlde kanal fiyatı kaldırılarak satıştan çekilmiş bir ürün, operatörün
   * eline bir sayı yazmasıyla sessizce yeniden satılabilirdi.
   */
  /**
   * **ZİNCİRİN TAMAMI** — taslak değil, `placeOrder`. Ekranın çağırdığı kapı budur ve taslaktan
   * sonrası da sınanmalı: stok AYRILIR ve sipariş `confirmed`e geçer.
   *
   * Kartla ödeme sağlayıcısı geçilmiyor (`createPaymentSession: null`) çünkü masada kart
   * çekilmiyor; nakit/vadeli dalında sipariş bu çağrıda kesinleşir ve beklenen bir ödeme yoktur.
   */
  it('placeOrder personel künyesiyle siparişi KESİNLEŞTİRİR ve stoğu ayırır', async () => {
    const oncekiRezerv = await rezerveAdet();

    const outcome = await placeOrder(db, {
      locale: 'tr',
      customerId,
      entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
      addressId,
      deliveryDate: await ilkUygunGun(),
      paymentMethod: 'cash',
      staff: { actorId: personelId, priceOverrides: new Map([[variantId, 1700]]) },
      createPaymentSession: null,
    });

    expect(outcome.status).toBe('placed');
    const order = await new OrderService(db).getById((outcome as { orderId: string }).orderId);
    expect(order!.status).toBe('confirmed');
    expect(order!.orderSource).toBe('manual');
    // Referans ilk KALICI durumda doğar — taslak sayı almaz.
    expect(order!.referenceNo).not.toBeNull();

    const kalemler = await kalemleriOku(order!.id);
    expect(Number(kalemler[0]!.unit_price)).toBe(17);
    expect(kalemler[0]!.price_set_by).toBe(personelId);

    expect(await rezerveAdet()).toBe(oncekiRezerv + 2);
  });

  /**
   * **YARIM İZ VERİTABANINDA REDDEDİLİR** (`order_item_negotiation_complete`).
   *
   * Üstteki testler izi UYGULAMA yolundan sınıyor; bu onun altındaki kapıyı sınıyor. Ayrımı
   * önemli: uygulama bir gün yanlış yazsa da (ya da ikinci bir yol açılsa — onarım betiği,
   * doğrudan SQL) yarım bir iz yazılamamalı. Tek başına bir liste fiyatı "birileri indirdi" der
   * ama kimin indirdiğini söylemez: kayıt soruyu açar, cevabı vermez.
   */
  it('yarım pazarlık izi VERİTABANINCA reddedilir — uygulamadan bağımsız', async () => {
    const sonuc = await elleSiparis();
    const orderId = (sonuc as { orderId: string }).orderId;
    const { data: varyantli } = await db.from('order_item').select('variant_id,vat_rate').eq('order_id', orderId).single();

    const yarim = (patch: Record<string, unknown>) =>
      db.from('order_item').insert({
        order_id: orderId,
        variant_id: varyantli!.variant_id,
        qty: 1,
        unit_price: 11,
        vat_rate: varyantli!.vat_rate,
        ...patch,
      });

    // Liste var, yazan yok.
    expect((await yarim({ list_unit_price: 12.5 })).error?.code).toBe('23514');
    // Yazan var, liste yok.
    expect((await yarim({ price_set_by: personelId })).error?.code).toBe('23514');
    // İkisi birden → kabul (kısıt izi yasaklamıyor, YARIMINI yasaklıyor).
    expect((await yarim({ list_unit_price: 12.5, price_set_by: personelId })).error).toBeNull();
  });

  it('kanal fiyatı olmayan ürünü elle fiyatla satamaz', async () => {
    const sonuc = await elleSiparis({
      variant: fiyatsizVariantId,
      overrides: new Map([[fiyatsizVariantId, 1500]]),
    });
    expect(sonuc.status).toBe('blocked_lines');
  });
});
