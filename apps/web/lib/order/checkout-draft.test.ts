import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  BundleService,
  CartService,
  CategoryService,
  ConversationService,
  DeliveryZoneService,
  DiscountCodeService,
  DiscountService,
  DiscountUseService,
  OrderService,
  PriceService,
  ProductService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, settingsSnapshot, purgeVariantStock, mustDelete, type SettingsSnapshot, testPostalCode } from '@lezzet/database/testing';
import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import { createCheckoutDraft } from './checkout-draft';

/**
 * Sepet → taslak sipariş — sınanan şey istemciden gelen seçimlerin yeniden doğrulanması ve paketin doğru parçalanması.
 * İkisi de ekran doğru davrandıkça görünmez; konsoldan gönderilen bir gün ya da yanlış paylaştırılmış paket siparişi bozar.
 */
const db = serviceDb();
const stamp = Date.now();
/**
 * Test rota kodu — önek 99, çünkü FR referansında 99 ile başlayan kod yok.
 * Gerçek bir kod olsaydı kapının "şehir bu kodun yerleşimlerinden biri mi" sorusu sabit "Strasbourg"la çelişir
 * ve test rastgele düşerdi.
 */
const rotaKodu = testPostalCode();

let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let coldProductId: string;
let variantId: string;
let coldVariantId: string;
let bundleId: string;
let customerId: string;
let addressId: string;
let zoneId: string;
let authUserId: string;
/** Asgari sepet eşiğinin geri koyma tutamağı — gerekçesi `beforeAll`da. */
let minBasket: SettingsSnapshot;
const createdProfiles: string[] = [];

/**
 * Satılacak ürün yayına hazır kurulur: aday ürün sepete giremez ve testler konularıyla ilgisiz bir sebeple düşerdi.
 * Üç dilli metinler ve alerjen beyanı yayın kısıtlarının şartı (`product_publish_requires_*`).
 */
const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
const yayinaHazir = {
  // Satıştaki boyun net miktarı zorunlu (tetikleyici, `0005`): "yayına hazır" gövde onu da taşır.
  variants: [{ netQuantity: 500, netUnit: 'g' as const }],
  description: ucDil('Checkout testinin ürünü'),
  ingredients: ucDil('Un, su, tuz'),
  storageInstructions: ucDil('Serin yerde saklayın'),
  allergens: [],
  status: 'active' as const,
};

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Checkout testi ${stamp}` } });
  categoryId = category.id;

  const kargolanir = await new ProductService(db).create({
    name: ucDil(`Baklava ${stamp}`),
    categoryId,
    vatRate: 5.5,
    ...yayinaHazir,
    variants: [{ label: { tr: '1 kg' }, netQuantity: 1000, netUnit: 'g' as const, sku: `CHK-B-${stamp}` }],
  });
  productId = kargolanir.product.id;
  variantId = kargolanir.variants[0]!.id;

  // Soğuk zincir: rota DIŞI adreste kargoya verilemez → sipariş açılamaz.
  const soguk = await new ProductService(db).create({
    name: ucDil(`Künefe ${stamp}`),
    categoryId,
    vatRate: 5.5,
    shippable: false,
    ...yayinaHazir,
    variants: [{ label: { tr: '2 kişilik' }, netQuantity: 800, netUnit: 'g' as const, sku: `CHK-K-${stamp}` }],
  });
  coldProductId = soguk.product.id;
  coldVariantId = soguk.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2000 });
  await prices.setPrice({ variantId: coldVariantId, channel: 'b2c', amountCents: 1000 });

  // Stok ŞART: sepet okuması stoksuz satırı "tükendi" işaretler ve kapı onu daha teslimat adımına
  // varmadan reddeder — teslimat/ödeme doğrulamaları o zaman hiç sınanmazdı.
  const stocks = new StockService(db);
  const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await stocks.insert({ warehouseId, variantId, physicalQty: 50, expiryDate: gun(120), purchasePriceCents: 800 });
  await stocks.insert({ warehouseId, variantId: coldVariantId, physicalQty: 50, expiryDate: gun(30), purchasePriceCents: 400 });

  // Paket: iki kalem, payları BİLEREK katalog fiyatının altında — indirim tam da o farktır.
  const bundle = await new BundleService(db).create({
    name: { tr: `Test paketi ${stamp}` },
    totalPrice: 27,
    items: [
      { variantId, qty: 1, allocatedUnitPrice: 18 },
      { variantId: coldVariantId, qty: 1, allocatedUnitPrice: 9 },
    ],
  });
  bundleId = bundle.bundle.id;

  // Gerçek bir auth kullanıcısı: kapı müşteriyi oturumdan çözer, uydurma kimlikle o yol sınanmazdı.
  // Profil burada açılmaz; auth kullanıcısı doğunca tetikleyici `user_profiles` satırını kurar, ikinci insert tekilliğe takılır.
  const authUser = await db.auth.admin.createUser({ email: `checkout${stamp}@ornek.fr`, email_confirm: true });
  authUserId = authUser.data.user!.id;
  const profile = await new UserProfileService(db).findByAuthUserId(authUserId);
  if (!profile) throw new Error('auth→profil tetikleyicisi profil açmadı');
  customerId = profile.id;
  createdProfiles.push(profile.id);

  const zoneSvc = new DeliveryZoneService(db);
  zoneId = (await zoneSvc.insert({ name: `Test bölgesi ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zoneSvc.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
  // Alıcı ve telefon zorunlu — sipariş kopyasına da bu ikisi girer.
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId, recipient: 'Ayşe Yılmaz', phone: '+33612345678',
      line1: '1 rue du Test', postalCode: rotaKodu, city: 'Strasbourg',
    })
  ).id;

  /**
   * Asgari sepet bu dosyanın konusu değil: eşik dosya boyunca sıfırlanır ve `afterAll`da geri konur (`settingsSnapshot`, CLAUDE §4b).
   * Tutarları büyütmek yanlış olurdu, iddiaların bir kısmı sayıya çivili; küresel satırı tutmak `fileParallelism: false` ile
   * güvenli ve kuralın kendisi `checkout-options.test.ts`te sınanır.
   */
  minBasket = settingsSnapshot(db);
  await minBasket.override('min_basket_cents', 0);
  SettingsService.invalidate();
});

beforeEach(async () => {
  // Parti burada silinmez (`beforeAll`da bir kez kurulur); silme `mustDelete` ile.
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
});

afterAll(async () => {
  // Ayar ÖNCE geri konur: sonraki dosya bu satırı okuyacak ve onu bekleten hiçbir şey yok.
  await minBasket.restore();
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await purgeVariantStock(db, [variantId, coldVariantId]);
  await db.from('bundle').delete().eq('id', bundleId);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId, coldProductId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    authUserIds: [authUserId],
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

/**
 * O bölgenin yaklaşan ilk günü — elle yazılan tarih günü geçince testi çürütürdü.
 * Kod parametrik, çünkü tutarlılık testleri bölgenin kodunu geçici olarak değiştirir ve sabit kodla sorulan gün boş dönerdi.
 */
async function ilkUygunGun(postalCode: string = rotaKodu): Promise<string> {
  const { resolveDelivery } = await import('./delivery');
  return (await resolveDelivery({ postalCode })).availableDates[0]!;
}

const base = async () => ({
  locale: 'tr' as const,
  customerId,
  addressId,
  deliveryDate: await ilkUygunGun(),
  paymentMethod: 'card' as const,
});

describe('sepet → taslak sipariş', () => {
  it('varyant satırı bağlayıcı fiyatıyla yazılır', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const { items } = (await new OrderService(db).getWithItems(outcome.orderId))!;
    expect(items).toHaveLength(1);
    // Fiyat İSTEMCİDEN gelmedi — sunucunun kendi çözümü.
    expect(items[0]!.unitPriceCents).toBe(2000);
    expect(items[0]!.qty).toBe(2);
    expect(items[0]!.bundleId).toBeNull();
  });

  it('rota siparişi teslimat ve paketleme maliyetini sipariş anındaki ayardan yazar', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const settings = new SettingsService(db);
    const order = await new OrderService(db).getById(outcome.orderId);
    expect(order?.deliveryType).toBe('route');
    expect(order?.deliveryCostCents).toBe(await settings.getNumber('route_delivery_unit_cost_cents', 250));
    expect(order?.packagingCostCents).toBe(await settings.getNumber('packaging_unit_cost_cents', 120));
  });

  it('SOHBETİN dokunduğu sepetin siparişi sohbetin KANALINI taşır; izsiz sepet `web` (15.23)', async () => {
    // Sepet Messenger'da kurulup ödeme sitede yapılırsa sipariş `web` yazmaz; kaynak sepetteki izden (`source_conversation_id`) okunur.
    const conversations = new ConversationService(db);
    const carts = new CartService(db);
    const sohbet = await conversations.open({ source: 'messenger', externalRef: `psid-checkout-${stamp}` });
    try {
      await carts.stampChat({ customerId }, sohbet.id);
      const izli = await createCheckoutDraft({ ...(await base()), entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }] });
      expect(izli.status).toBe('ok');
      if (izli.status !== 'ok') return;
      expect((await new OrderService(db).getById(izli.orderId))?.orderSource).toBe('messenger');

      // İz gidince (sepet boşaldı) sonraki sipariş temiz başlar.
      await carts.clear(customerId);
      const izsiz = await createCheckoutDraft({ ...(await base()), entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }] });
      expect(izsiz.status).toBe('ok');
      if (izsiz.status !== 'ok') return;
      expect((await new OrderService(db).getById(izsiz.orderId))?.orderSource).toBe('web');
    } finally {
      await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
      await purgeTestData(db, { conversationIds: [sohbet.id] });
    }
  });

  it('PAKET varyant kalemlerine parçalanır; birim fiyat paketin PAYIDIR', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'bundle', bundleId, qty: 2 }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const { items } = (await new OrderService(db).getWithItems(outcome.orderId))!;

    expect(items).toHaveLength(2);
    // Nereden geldiği kaybolmaz: iade ve rapor paketi yeniden kurabilmeli.
    expect(items.every((i) => i.bundleId === bundleId)).toBe(true);
    // Paketin adedi kalemin adedini ÇARPAR.
    expect(items.map((i) => i.qty).sort()).toEqual([2, 2]);
    // Katalog fiyatı (20 + 10 = 30) DEĞİL, paylaştırılmış fiyat (18 + 9 = 27).
    expect(items.reduce((sum, i) => sum + i.unitPriceCents, 0)).toBe(2700);
  });

  /**
   * İndirimin kalem payı yazılmazsa sipariş kendi parasıyla çelişir: kalemler indirimsiz toplamı taşır ve ödeme motoru farkı
   * ödenmemiş bakiye sanar. İndirim kategori kapsamlı kurulur, çünkü sepet kapsamlı aktif kampanya paylaşılan veritabanında
   * başka bir koşunun siparişine de inerdi (CLAUDE §4b).
   */
  it('indirimin kalem PAYI yazılır — sipariş kendi toplamıyla çelişmez', async () => {
    const kampanya = await new DiscountService(db).insert({
      name: `Pay testi ${stamp}`,
      publicLabel: { tr: `Pay testi ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      const { order, items } = (await new OrderService(db).getWithItems(outcome.orderId))!;

      // 2 × 20 € = 40 €'nun %10'u.
      expect(order.discountAmountCents).toBe(400);
      // Payların toplamı başlıktaki indirime EŞİT — motorun `distributeDiscount` garantisi.
      expect(items.reduce((sum, i) => sum + i.lineDiscountAmountCents, 0)).toBe(order.discountAmountCents);

      // Asıl ölçülen: tamamı tahsil edilmiş sipariş `paid` olmalı, kapıda tahsilat kalmamalı.
      const derived = derivePaymentStatusForOrder(order, items, { collectedCents: order.orderedTotalCents, refundedCents: 0 });
      expect(derived).toMatchObject({ status: 'paid', amountToCollectCents: 0 });
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * Reddedilen kupon + yerine inen kampanya — sipariş kaydı da indirimi göstermeli; tahsilat doğru olsa bile "indirim verilmedi"
   * yazılırsa marj ve kampanya raporu yanlış okunur. Kampanya testin kendi kategorisine kurulur (CLAUDE §4b).
   */
  it('kupon reddedilip yerine kampanya inince KAYIT da indirimi gösterir', async () => {
    const kampanya = await new DiscountService(db).insert({
      name: `Ret testi ${stamp}`,
      publicLabel: { tr: `Ret testi ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        couponCode: `YOK-${stamp}`, // hiç var olmayan kod → status: 'rejected'
        entries: [{ kind: 'variant', variantId, qty: 2, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;
      const { order } = (await new OrderService(db).getWithItems(outcome.orderId))!;

      // 2 × 20 €'nun %10'u.
      expect(order.discountAmountCents).toBe(400);
      // Tahsilat ile kayıttaki indirim aynı sayıdan türer — sözleşmenin kendisi.
      expect(order.orderedTotalCents).toBe(3600);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * Kupon kotası gerçekten tükeniyor mu — uçtan uca: zincirin her halkası (tanım, `isApplicable`, `usageCounts`) tek başına
   * doğruyken kaydı yazan taraf eksik kalabilir ve bunu yalnız gerçek checkout görür.
   */
  it('indirim inen sipariş kupon KOTASINI tüketir — kayıt siparişten türer', async () => {
    const discounts = new DiscountService(db);
    const kampanya = await discounts.insert({
      name: `Kota testi ${stamp}`,
      // Etiket veride zorunlu — bu testin konusu değil, bir ad yeter.
      publicLabel: { tr: `Kota testi ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      // Kupon kullanılmadan önce sayaç sıfır.
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total ?? 0).toBe(0);

      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;

      const usage = (await discounts.usageCounts([kampanya.id])).get(kampanya.id);
      expect(usage?.total).toBe(1);
      // Müşteri başına sınır bu kırılımdan çıkar — `per_customer_limit` onsuz hiç engellemez.
      expect(usage?.byCustomer.get(customerId)).toBe(1);
      // Otomatik kampanyanın kapısı yok: kod kırılımı boş kalmalı, uydurma bir kapı sayılmamalı.
      expect(usage?.byCode.size).toBe(0);

      // İPTAL kotayı GERİ VERİR: vazgeçilen siparişte müşteri indirimden yararlanmadı. Kayıt
      // silinmez, sayarken dışlanır — "kim ne zaman denedi" geçmişte kalır.
      await new OrderService(db).update({ id: outcome.orderId, status: 'cancelled' });
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total ?? 0).toBe(0);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  /**
   * Kupon yolunda hangi kapıdan girildiği de yazılır; kota kuralındır, üç dilli kuponun üç kodu tek kotadan harcar (`byCode` kırılımdır).
   * Yazan taraf bu ayrımı bozarsa ekran "hangi dil karşılık buldu" sorusuna sessizce yanlış cevap verir.
   */
  it('kuponla açılan siparişte hangi KAPIDAN girildiği de yazılır', async () => {
    const discounts = new DiscountService(db);
    const kupon = await discounts.insert({
      name: `Kapı testi ${stamp}`,
      // Etiket veride zorunlu — bu testin konusu değil, bir ad yeter.
      publicLabel: { tr: `Kapı testi ${stamp}` },
      trigger: 'coupon',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const kodlar = await new DiscountCodeService(db).replaceCodes(kupon.id, [
        { discountId: kupon.id, code: `KAPI${stamp}`, locale: 'tr' },
        { discountId: kupon.id, code: `PORTE${stamp}`, locale: 'fr' },
      ]);
      const trKod = kodlar.find((k) => k.locale === 'tr')!;

      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
        couponCode: `kapi${stamp}`, // harf ayrımsız: müşteri küçük harfle yazar
      });
      if (outcome.status !== 'ok') throw new Error(`taslak açılmadı: ${outcome.status}`);

      const usage = (await discounts.usageCounts([kupon.id])).get(kupon.id);
      expect(usage?.total).toBe(1);
      // Kota KURALIN, kırılım kodun: giren kapı TR, FR kapısı hiç sayılmamalı.
      expect(usage?.byCode.get(trKod.id)).toBe(1);
      expect(usage?.byCode.size).toBe(1);
    } finally {
      await db.from('discount').delete().eq('id', kupon.id);
    }
  });

  it('aynı sipariş kotayı iki kez tüketemez — kayıt idempotent', async () => {
    const discounts = new DiscountService(db);
    const kampanya = await discounts.insert({
      name: `Idempotency testi ${stamp}`,
      // Etiket veride zorunlu — bu testin konusu değil, bir ad yeter.
      publicLabel: { tr: `Idempotency testi ${stamp}` },
      trigger: 'automatic',
      type: 'percent',
      percent: 10,
      scope: 'category',
      categoryId,
    });
    try {
      const outcome = await createCheckoutDraft({
        ...(await base()),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });
      if (outcome.status !== 'ok') throw new Error(`taslak açılmadı: ${outcome.status}`);

      // İkinci kayıt denemesi — yeniden denenen checkout / iki kez gelen webhook. Hata DEĞİL,
      // `false`: garanti tekil indekste, uygulamada bir kontrolde değil.
      const uses = new DiscountUseService(db);
      const ilk = await uses.record({ discountId: kampanya.id, orderId: outcome.orderId, customerId, amountCents: 200 });
      expect(ilk).toBe(false);
      expect((await discounts.usageCounts([kampanya.id])).get(kampanya.id)?.total).toBe(1);
    } finally {
      await db.from('discount').delete().eq('id', kampanya.id);
    }
  });

  it('istemcinin gönderdiği gün uygun günlerden biri değilse sipariş açılmaz', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      deliveryDate: '2030-01-01', // hiçbir bölgeye düşmeyen bir gün
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('date_unavailable');
    expect(await siparisSayisi()).toBe(0);
  });

  it('başkasının adresine sipariş açılamaz', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      addressId: crypto.randomUUID(),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('address_not_found');
    expect(await siparisSayisi()).toBe(0);
  });

  it('rota DIŞI adreste soğuk zincir kalemi varsa sipariş açılmaz', async () => {
    const disaridaki = await new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Ayşe Yılmaz',
      phone: '+33612345678',
      line1: '17 avenue Jean Jaurès',
      postalCode: '69007', // hiçbir bölgeye düşmez → kargo
      city: 'Lyon',
    });

    const outcome = await createCheckoutDraft({
      ...(await base()),
      addressId: disaridaki.id,
      deliveryDate: null, // kargoda gün yok
      entries: [{ kind: 'variant', variantId: coldVariantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('cold_chain_unshippable');
    expect(await siparisSayisi()).toBe(0);
  });

  it('boş sepetle sipariş açılmaz', async () => {
    const outcome = await createCheckoutDraft({ ...(await base()), entries: [] });
    expect(outcome.status).toBe('empty_cart');
    expect(await siparisSayisi()).toBe(0);
  });

  /**
   * İstenen adet depodakinden fazlaysa taslak açılmaz ve mümkün olan adet söylenir; yoksa iş onaydan sonra rezervasyonda patlardı.
   * Ret `blocked_lines`ten ayrı: orası "alınamıyor", burası "azı alınabiliyor" der ve sayı sepetin düzeltme düğmesiyle aynı olmalı.
   */
  it('istenen adet depodakinden fazlaysa sipariş AÇILMAZ ve mümkün olan adet söylenir', async () => {
    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 60, stockId: null }],
    });
    expect(outcome.status).toBe('insufficient_here');
    if (outcome.status !== 'insufficient_here') return;
    expect(outcome.lines).toHaveLength(1);
    expect(outcome.lines[0]!.available).toBe(50);
    expect(await siparisSayisi()).toBe(0);
  });

  /**
   * Adres kendiyle tutarlı mı — rota yolunu yalnız posta kodu belirlediği için şehir kodla karşılaştırılır (67000 + Lingolsheim,
   * oysa Lingolsheim 67380). Referans `51300` başka testin kullanmadığı gerçek bir FR kodu, çünkü bağ tablosunun anahtarı küreseldir;
   * bölgenin kodu geçici olarak değiştirilip geri konur.
   */
  describe('adres kendiyle tutarlı mı', () => {
    const referansKodu = '51300';

    beforeEach(async () => {
      await new DeliveryZoneService(db).replacePostalCodes(zoneId, [{ country: 'FR', postalCode: referansKodu }]);
    });

    afterEach(async () => {
      await new DeliveryZoneService(db).replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
    });

    it('koda AİT OLMAYAN şehirle rota siparişi açılmaz', async () => {
      const tutarsiz = await new AddressService(db).addForCustomer({
        customerId,
        recipient: 'Ayşe Yılmaz',
        phone: '+33612345678',
        line1: '192C rue du Maréchal Foch',
        postalCode: referansKodu,
        city: 'LINGOLSHEIM',
      });

      const outcome = await createCheckoutDraft({
        ...(await base()),
        addressId: tutarsiz.id,
        deliveryDate: null,
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });

      expect(outcome.status).toBe('address_city_mismatch');
      // Ekran "şu olmalı" diyebilmeli: sipariş sessizce kargoya çevrilmiyor, sebebi söyleniyor.
      if (outcome.status !== 'address_city_mismatch') throw new Error('beklenen address_city_mismatch');
      expect(outcome.places).toContain('Vitry-le-François');
      expect(await siparisSayisi()).toBe(0);
    });

    it('koda AİT şehirle açılır — çok yerleşimli kodda yanlış alarm ötmez', async () => {
      // 51300'ün 46 köyünden biri; kodu tek şehre indirgemek doğru adresi de "kodun şehri değil" diye uyarırdı.
      const tutarli = await new AddressService(db).addForCustomer({
        customerId,
        recipient: 'Ayşe Yılmaz',
        phone: '+33612345678',
        line1: '3 rue de l\'Église',
        postalCode: referansKodu,
        city: 'Marolles',
      });

      const outcome = await createCheckoutDraft({
        ...(await base()),
        addressId: tutarli.id,
        // Gün BU bloğun kodundan sorulur: bölgenin kodu geçici olarak `51300`.
        deliveryDate: await ilkUygunGun(referansKodu),
        entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
      });

      expect(outcome.status).toBe('ok');
    });
  });
});

/**
 * Bağlayıcı fiyat sabitlenirken zam onay ister (DOMAIN §5) — taslak önceki fiyatla karşılaştırmazsa checkout açıkken teklif
 * partisi tükendiğinde sipariş tam fiyattan sessizce açılır. Önceki fiyat sunucu sepetindekidir; testler onu doğrudan yazar.
 */
describe('bağlayıcı fiyat sabitlenirken ZAM onay ister', () => {
  /** Sunucu sepetine kalemi VERİLEN fiyatla yazar — "müşterinin gördüğü fiyat" budur. */
  async function sepeteYaz(unitPriceEuro: number) {
    await new CartService(db).replace(customerId, [{ variantId, bundleId: null, qty: 1, unitPrice: unitPriceEuro, stockId: null }]);
  }

  afterEach(async () => {
    await new CartService(db).clear(customerId);
  });

  it('fiyat ARTTIYSA taslak AÇILMAZ — eski ve yeni tutar birlikte döner', async () => {
    // Müşteri kalemi 15 €'ya görmüştü; bugünkü bağlayıcı fiyat 20 €.
    await sepeteYaz(15);
    const once = await siparisSayisi();

    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('price_changed');
    if (outcome.status !== 'price_changed') return;
    expect(outcome.lines).toHaveLength(1);
    expect(outcome.lines[0]).toMatchObject({ fromCents: 1500, toCents: 2000 });
    // Adı da taşır: "bir kalemin fiyatı arttı" cümlesi müşteriye ne yapacağını söylemez.
    expect(outcome.lines[0]!.name).toBeTruthy();
    // Reddedilen denemeden ortada taslak KALMAZ.
    expect(await siparisSayisi()).toBe(once);
  });

  /**
   * İkinci deneme geçmeli: taslak reddederken saklanan fiyatı güncellemeseydi müşteri her onayda aynı reddi alırdı.
   * Kural sepettekiyle aynı — bir kez bildir, sonra sakla.
   */
  it('İKİNCİ deneme geçer — bildirilen fiyat saklandı, döngü yok', async () => {
    await sepeteYaz(15);

    const ilk = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });
    expect(ilk.status).toBe('price_changed');

    const ikinci = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(ikinci.status).toBe('ok');
    if (ikinci.status !== 'ok') return;
    // Sipariş YENİ fiyattan yazılır — onaylanan tutar buydu.
    const { items } = (await new OrderService(db).getWithItems(ikinci.orderId))!;
    expect(items[0]!.unitPriceCents).toBe(2000);
  });

  it('fiyat DÜŞTÜYSE hiç sorulmaz — indirim için müşteri durdurulmaz', async () => {
    // Müşteri 25 €'ya görmüştü; bugün 20 €. Sürpriz değil, hediye.
    await sepeteYaz(25);

    const outcome = await createCheckoutDraft({
      ...(await base()),
      entries: [{ kind: 'variant', variantId, qty: 1, stockId: null }],
    });

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const { items } = (await new OrderService(db).getWithItems(outcome.orderId))!;
    expect(items[0]!.unitPriceCents).toBe(2000);
  });
});

/** Reddedilen her denemeden sonra ORTADA SİPARİŞ KALMAMALI — yarım taslak da bir taslaktır. */
async function siparisSayisi(): Promise<number> {
  const { count } = await db.from('order').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  return count ?? 0;
}
