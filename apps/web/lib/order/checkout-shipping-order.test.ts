import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AddressService,
  CategoryService,
  DeliveryZoneService,
  OrderService,
  PriceService,
  ProductService,
  ProductVariantService,
  SettingsService,
  ShippingBoxService,
  StockService,
  UserProfileService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { readCheckoutSnapshot, type ShippingRateProvider } from '@lezzet/application';
import { shippingPriceWithVat } from '@lezzet/domain-core';

type ShippingQuote = Awaited<ReturnType<ShippingRateProvider['quote']>>[number];
type ServicePoint = NonNullable<Awaited<ReturnType<ShippingRateProvider['servicePoint']>>>;
import { createTestWarehouse, purgeTestData, purgeVariantStock, mustDelete, testPostalCode } from '@lezzet/database/testing';
import { createCheckoutDraft } from './checkout-draft';

/**
 * Kargo siparişi taslağı: rota içi adresten açılan kargo siparişi rota deposundan değil, malın durduğu kargo deposundan çıkar.
 * Kurulum `DE` üzerinde, çünkü ülke başına tek aktif kargo deposu kuralı FR'de seed'in deposuyla çakışırdı.
 */
const db = serviceDb();
const stamp = Date.now();
/**
 * Damgalı kod `43` önekli, çünkü DE referansında 43 ile başlayan kod yok: damga gerçek bir koda denk gelip "Kehl" şehir kontrolünü
 * bozamaz. Test aynı zamanda kendi bölge tablomuzun dış referanstan üstün olduğunu sınar.
 */
const rotaKodu = testPostalCode();

let categoryId: string;
let productId: string;
let variantId: string;
/** Rota deposunda duran ikinci ürün: iki gruplu sepetin kapı kalemi. */
let localProductId: string;
let localVariantId: string;
let customerId: string;
let authUserId: string;
let addressId: string;
/**
 * KDV testlerinin şirket müşterisi ayrı bir profil: var olanın tipini değiştirmek öteki testlerin ödeme seçeneklerini oynatırdı.
 */
let b2bCustomerId: string;
let b2bAuthUserId: string;
let b2bAddressId: string;
let zoneId: string;
let routeWarehouseId: string;
let shippingWarehouseId: string;
const createdProfiles: string[] = [];

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Kargo siparişi ${stamp}` } });
  categoryId = category.id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Kargo ürünü ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: 4000 });

  // İki DE deposu: biri rota (bölgeye bağlı), biri kargo. Ayrı olmaları testin bütün noktası —
  // aynı depo olsalardı "hangisinden çıktı" sorusu ölçülemezdi.
  routeWarehouseId = (await createTestWarehouse(db, { label: 'ROTA', countryCode: 'DE' })).id;
  shippingWarehouseId = (await createTestWarehouse(db, { label: 'KARGO', countryCode: 'DE', shipsOnline: true })).id;

  // Stok YALNIZ kargo deposunda: kargo grubunun gerçek hâli.
  await new StockService(db).insert({
    warehouseId: shippingWarehouseId,
    variantId,
    physicalQty: 20,
    expiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
  });

  const local = await new ProductService(db).create({
    name: { tr: `Kapı ürünü ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  localProductId = local.product.id;
  localVariantId = local.variants[0]!.id;
  // Kapı siparişinin asgari sepeti küresel ayardan okunur; fiyat onun rahatça üstünde ki test ayara dokunmasın.
  await new PriceService(db).insert({ variantId: localVariantId, channel: 'b2c', amountCents: 20_000 });
  await new StockService(db).insert({
    warehouseId: routeWarehouseId,
    variantId: localVariantId,
    physicalQty: 20,
    expiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
  });

  const authUser = await db.auth.admin.createUser({ email: `kargo${stamp}@ornek.de`, email_confirm: true });
  authUserId = authUser.data.user!.id;
  const profile = await new UserProfileService(db).findByAuthUserId(authUserId);
  if (!profile) throw new Error('auth→profil tetikleyicisi profil açmadı');
  customerId = profile.id;
  createdProfiles.push(profile.id);

  // Adres ROTA İÇİNDE: kargo siparişinin ezmesi gereken şey tam olarak bu.
  const zoneSvc = new DeliveryZoneService(db);
  zoneId = (await zoneSvc.insert({ name: `Kargo testi bölgesi ${stamp}`, warehouseId: routeWarehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zoneSvc.replacePostalCodes(zoneId, [{ country: 'DE', postalCode: rotaKodu }]);
  addressId = (
    await new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Stefan Weber',
      phone: '+4978514455',
      line1: 'Marktplatz 3',
      postalCode: rotaKodu,
      city: 'Kehl',
      country: 'DE',
    })
  ).id;

  // Şirket müşterisi: DE + B2B + VIES'te doğrulanmış numara, reverse charge'ın üç şartı. `vatNumberValid` ayrı alan, çünkü motor
  // %0'ı yalnız doğrulanmış numarada açar ve yanlış %0'ın bedelini biz öderiz.
  const b2bAuth = await db.auth.admin.createUser({ email: `kargob2b${stamp}@ornek.de`, email_confirm: true });
  b2bAuthUserId = b2bAuth.data.user!.id;
  const b2bProfile = await new UserProfileService(db).findByAuthUserId(b2bAuthUserId);
  if (!b2bProfile) throw new Error('auth→profil tetikleyicisi B2B profili açmadı');
  b2bCustomerId = b2bProfile.id;
  createdProfiles.push(b2bProfile.id);
  await new UserProfileService(db).update({
    id: b2bCustomerId,
    type: 'company',
    companyInfo: { legalName: `Testhandel GmbH ${stamp}` },
    vatNumber: `DE${String(stamp).slice(-9)}`,
    vatNumberValid: true,
  });
  b2bAddressId = (
    await new AddressService(db).addForCustomer({
      customerId: b2bCustomerId,
      recipient: 'Klaus Bauer',
      phone: '+4978514456',
      line1: 'Hauptstraße 12',
      postalCode: rotaKodu,
      city: 'Kehl',
      country: 'DE',
    })
  ).id;
  // Eşik altındaki kargo siparişi canlı fiyat ister: teklif ölçü, gönderici adresi ve kutu olmadan sorulamaz.
  await new ProductVariantService(db).update({
    id: variantId,
    packedWeightG: 1000,
    packedLengthMm: 140,
    packedWidthMm: 90,
    packedHeightMm: 60,
  });
  await new WarehouseService(db).update({ id: shippingWarehouseId, address: { line1: 'Depostraße 1', postalCode: '77694', city: 'Kehl' } });
  await new ShippingBoxService(db).insert({
    warehouseId: shippingWarehouseId,
    name: `Seçim kutusu ${stamp}`,
    lengthMm: 300,
    widthMm: 200,
    heightMm: 150,
    tareG: 130,
    maxContentG: null,
  });
  SettingsService.invalidate();
});

beforeEach(async () => {
  // Parti burada silinmez: `beforeAll`da bir kez kurulur ve bütün testler onu paylaşır. Silme `mustDelete` ile, çünkü
  // `delete()` hatayı yutar.
  await mustDelete(db, 'order', (q) => q.in('customer_id', [customerId, b2bCustomerId]));
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.in('customer_id', [customerId, b2bCustomerId]));
  await purgeVariantStock(db, [variantId, localVariantId]);
  await db.from('address').delete().in('customer_id', [customerId, b2bCustomerId]);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId, localProductId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    authUserIds: [authUserId, b2bAuthUserId],
    warehouseIds: [routeWarehouseId, shippingWarehouseId],
  });
  SettingsService.invalidate();
});

// Fonksiyon, sabit DEĞİL: modül seviyesinde değerlendirilirse `variantId` henüz boştur ve satır
// "kaynağı kayboldu" hâline düşer (`orphanLine`, `shippable: false`) — sipariş soğuk zincir
// gerekçesiyle reddedilir ve testin ölçtüğü şey kaybolur.
const entries = () => [{ kind: 'variant' as const, variantId, qty: 1, stockId: null }];

const secenek = (code: string, priceCents: number, lastMile: string, carrierCode = 'colissimo', labelless = false): ShippingQuote => ({
  code,
  carrierCode,
  carrierName: carrierCode,
  name: code,
  priceCents,
  currency: 'EUR',
  leadTimeHours: null,
  lastMile: lastMile as ShippingQuote['lastMile'],
  signature: false,
  tracked: true,
  ecoDelivery: false,
  multicollo: true,
  labelless,
});
const nokta = (id: string, carrierCode: string, kind: ServicePoint['kind'] = 'servicepoint'): ServicePoint => ({
  id,
  carrierCode,
  name: `Nokta ${id}`,
  street: 'Marktplatz',
  houseNumber: '1',
  postalCode: rotaKodu,
  city: 'Kehl',
  country: 'DE',
  latitude: null,
  longitude: null,
  distanceM: null,
  active: true,
  kind,
  openingTimes: null,
});
// Liste bilerek fiyata göre sıralı değil ve en ucuzu teslim noktası: "seçim yoksa en ucuz" hatası burada görünür.
const saglayici: ShippingRateProvider = {
  quote: async () => [
    secenek('eve-pahali', 990, 'home_delivery'),
    secenek('nokta-mr', 450, 'service_point', 'mondial_relay'),
    secenek('dolap-mr', 400, 'locker', 'mondial_relay'),
    secenek('eve-ucuz', 690, 'home_delivery'),
    // Etiketli ikizinden ucuz etiketsiz servis: süzülmezse "eve giden en ucuz" onu seçerdi.
    secenek('eve-ucuz-qr', 650, 'home_delivery', 'colissimo', true),
  ],
  announce: () => Promise.reject(new Error('taslakta duyuru çağrılmamalı')),
  cancel: () => Promise.reject(new Error('taslakta iptal çağrılmamalı')),
  status: () => Promise.reject(new Error('taslakta durum çağrılmamalı')),
  listRecent: () => Promise.reject(new Error('taslakta liste çağrılmamalı')),
  servicePoints: () => Promise.reject(new Error('taslakta arama çağrılmamalı')),
  servicePoint: async (id) => (id === 'sp-mr' ? nokta('sp-mr', 'mondial_relay') : id === 'sp-dpd' ? nokta('sp-dpd', 'dpd') : null),
};
/** Taşıyıcıya ulaşılamayan hâl: teklif atar, öteki çağrılar zaten sorulmaz. */
const cevapsizSaglayici: ShippingRateProvider = { ...saglayici, quote: () => Promise.reject(new Error('taşıyıcı cevap vermedi')) };

const base = () => ({
  locale: 'tr' as const,
  customerId,
  addressId,
  deliveryDate: null,
  paymentMethod: 'online' as const,
  rateProvider: saglayici,
});

describe('kargo siparişi taslağı', () => {
  it('rota İÇİ adresten açılsa bile KARGO deposundan ve `shipping` türüyle doğar', async () => {
    const outcome = await createCheckoutDraft({ ...base(), entries: entries(), shippingOrder: true });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.deliveryType).toBe('shipping');

    const order = await new OrderService(db).getById(outcome.orderId);
    // Asıl iddia: mal kargo deposunda duruyor ve sipariş oradan çıkıyor.
    expect(order?.warehouseId).toBe(shippingWarehouseId);
    expect(order?.warehouseId).not.toBe(routeWarehouseId);
    // Kargo siparişi bir BÖLGEYE ait değildir: rota bölgesi araçla giden teslimatın kaydı.
    expect(order?.deliveryZoneId).toBeNull();
    // Kargoda gün söz verilmez — tarih taşıyıcıya bağlı.
    expect(order?.deliveryDate).toBeNull();
  });

  it('KAPIDA ödeme kargo siparişinde hiç listelenmez (K37)', async () => {
    const outcome = await createCheckoutDraft({ ...base(), entries: entries(), paymentMethod: 'cash', shippingOrder: true });
    expect(outcome.status).toBe('payment_not_allowed');
    if (outcome.status !== 'payment_not_allowed') return;
    // Motor `deliveryType === 'shipping'` görünce kapıda yöntemleri zaten kapatıyor; burada
    // sınanan şey o kuralın kargo siparişine de UYGULANDIĞI — türü ezmeseydik adres rota içi
    // olduğu için kapıda ödeme açık kalırdı.
    expect(outcome.methods).not.toContain('cash');
    expect(outcome.methods).not.toContain('card');
  });

  it('bayraksız çağrı, malın olmadığı depodan sipariş AÇMAZ — ezme tek yönlü', async () => {
    // Aynı kalem, aynı adres: bayraksız çağrı adresin cevabını kullanır ve sipariş kalemin olmadığı rota deposundan açılmaya
    // çalışılır. Bu kontrol `blocked`tan ayrıdır: kargoyla gelebilen ürün sepette satılabilir görünür ama sipariş tek depodan çıkar.
    const outcome = await createCheckoutDraft({ ...base(), entries: entries() });
    expect(outcome.status).toBe('blocked_lines');
  });

  it('kapıya teslimin asgari sepetine takılmaz — kargo siparişinin tabanı yoktur', async () => {
    // Taban yalnız bu testin kargo deposuna yazılır: kapı kuralı bu satırı okur, kargo kuralı okumaz; başka test etkilenmez.
    await new SettingsService(db).set('min_basket_cents', 1_000_000, { scopeType: 'warehouse', scopeId: shippingWarehouseId });
    try {
      const outcome = await createCheckoutDraft({ ...base(), entries: entries(), shippingOrder: true });
      expect(outcome.status).toBe('ok');
    } finally {
      await mustDelete(db, 'settings', (q) =>
        q.eq('key', 'min_basket_cents').eq('scope_type', 'warehouse').eq('scope_id', shippingWarehouseId),
      );
      SettingsService.invalidate('min_basket_cents');
    }
  });

  it('bütün sepet gönderilse de kargo siparişi yalnız kargo kalemini, kapı siparişi yalnız kapı kalemini alır', async () => {
    const tumSepet = [...entries(), { kind: 'variant' as const, variantId: localVariantId, qty: 1, stockId: null }];
    const kalemleri = async (orderId: string) => (await new OrderService(db).getWithItems(orderId))!.items.map((i) => i.variantId);

    const kargo = await createCheckoutDraft({ ...base(), entries: tumSepet, shippingOrder: true });
    expect(kargo.status).toBe('ok');
    if (kargo.status !== 'ok') return;
    expect(await kalemleri(kargo.orderId)).toEqual([variantId]);

    // Kapı siparişi gün ister: ilk çağrı açık günleri söyler, ikincisi ilk günü seçer.
    const ilk = await createCheckoutDraft({ ...base(), entries: tumSepet });
    const gun = ilk.status === 'date_unavailable' ? (ilk.availableDates[0] ?? null) : null;
    const kapi = gun === null ? ilk : await createCheckoutDraft({ ...base(), deliveryDate: gun, entries: tumSepet });
    expect(kapi.status).toBe('ok');
    if (kapi.status !== 'ok') return;
    expect(await kalemleri(kapi.orderId)).toEqual([localVariantId]);
  });
});

/**
 * KDV işlemi: sınanan motor değil, motorun sipariş anında çağrıldığı; bu yalnız sepetten doğan gerçek bir siparişin satırında
 * görülür. Kurulum bu dosyada, çünkü reverse charge DE kargo deposu ister ve ülke başına tek depo paralel bir dosyayla çakışırdı.
 */
describe('KDV işlemi — sipariş anında çözülür', () => {
  const b2bBase = () => ({
    locale: 'tr' as const,
    customerId: b2bCustomerId,
    addressId: b2bAddressId,
    deliveryDate: null,
    paymentMethod: 'online' as const,
    rateProvider: saglayici,
  });

  it('DE + B2B + doğrulanmış vergi no → reverse charge; kalem KDV\'si %0 ve numara siparişe kopyalanır', async () => {
    const outcome = await createCheckoutDraft({ ...b2bBase(), entries: entries(), shippingOrder: true });
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    const record = (await new OrderService(db).getWithItems(outcome.orderId))!;
    expect(record.order.channel).toBe('b2b');
    expect(record.order.vatTreatment).toBe('intra_eu_b2b_reverse_charge');
    // Ürünün kendi oranı 5,5 (şema varsayılanı) — %0 kalemin ORANINDA uygulanmalı, yalnız başlıkta
    // değil: muhasebe dışa aktarımı ve kâr hesabı kalem oranından da geçiyor.
    expect(record.items.length).toBeGreaterThan(0);
    expect(record.items.every((i) => i.vatRate === 0)).toBe(true);
    // Denetim kanıtı: müşteri numarasını sonradan değiştirse bile sipariş neden KDV kesilmediğini
    // kendi üstünde taşır (`addressSnapshot` ile aynı kural).
    expect(record.order.vatNumberSnapshot).toBe(`DE${String(stamp).slice(-9)}`);
  });

  it('DOĞRULANMAMIŞ vergi numarası %0 açmaz — yurt içi kalır', async () => {
    // Asıl riskli dal bu: yanlış %0 uygulamanın bedelini biz öderiz, eksik %0'ınkini müşteri geri
    // ister. Motor `vatNumberValid === true` şartını koşuyor; burada sınanan, uygulama katmanının
    // o üçüncü hâli (`null` = hiç sorulmadı) motora DOĞRU çevirdiği.
    const profiles = new UserProfileService(db);
    await profiles.update({ id: b2bCustomerId, vatNumberValid: null });
    try {
      const outcome = await createCheckoutDraft({ ...b2bBase(), entries: entries(), shippingOrder: true });
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') return;

      const record = (await new OrderService(db).getWithItems(outcome.orderId))!;
      expect(record.order.vatTreatment).toBe('domestic');
      expect(record.items.every((i) => i.vatRate > 0)).toBe(true);
      // Kanıt yalnız %0 uygulandığında yazılır: yurt içi bir siparişte numara taşımak, kolonu okuyan
      // denetçiye "burada reverse charge var" dedirtirdi.
      expect(record.order.vatNumberSnapshot).toBeNull();
    } finally {
      // Değiştirdiğini geri koy (`CLAUDE.md §4b`): sıra değişirse ilk test bu satırı bozuk bulurdu.
      await profiles.update({ id: b2bCustomerId, vatNumberValid: true });
    }
  });
});

describe('kargo seçimi ödeme anında siparişe yazılır', () => {
  const siparis = (over: Record<string, unknown> = {}) => createCheckoutDraft({ ...base(), entries: entries(), shippingOrder: true, ...over });
  /** Teklif KDV hariç gelir; müşterinin ücreti siparişin kendi kalem oranlarıyla KDV dahildir. */
  const brut = async (orderId: string, netCents: number) => {
    const kayit = await new OrderService(db).getWithItems(orderId);
    return shippingPriceWithVat(netCents, kayit!.items.map((i) => ({ totalCents: i.unitPriceCents * i.qty, vatRate: i.vatRate })));
  };

  it('müşterinin seçtiği servis, gördüğü fiyat ve koli planı siparişe yazılır', async () => {
    const outcome = await siparis({ shippingOptionCode: 'eve-pahali' });
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    const order = await new OrderService(db).getById(outcome.orderId);
    // Müşteri KDV dahil öder, maliyet taşıyıcının KDV hariç fiyatıdır: ikisi eşit yazılsaydı KDV bizden çıkardı.
    expect(order).toMatchObject({ shippingOptionCode: 'eve-pahali', shippingFeeCents: await brut(outcome.orderId, 990), deliveryCostCents: 990, servicePoint: null });
    expect(order!.shippingFeeCents).toBeGreaterThan(990);
    expect(order?.parcelPlan).toHaveLength(1);
  });

  // Ters vergilendirmede kalemlerin KDV'si sıfırdır ama kargo ücreti herkes için aynı kuralla bulunur; sıfırlanmış oranla hesaplansaydı
  // sipariş ekranda gösterilenden düşük bir ücretle açılırdı.
  it('ters vergilendirmeli şirkette kargo ücreti ekranda gösterilenle aynı ve KDV dahil', async () => {
    const secim = { customerId: b2bCustomerId, addressId: b2bAddressId, entries: entries(), shippingOrder: true, rateProvider: saglayici, shippingOptionCode: 'eve-pahali' };
    const ekran = await readCheckoutSnapshot(db, 'tr', { ...secim, couponCode: null, pickupWarehouseId: null });
    const outcome = await createCheckoutDraft({ ...secim, locale: 'tr', deliveryDate: null, paymentMethod: 'online' });
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    const order = await new OrderService(db).getById(outcome.orderId);
    expect(order?.vatTreatment).toBe('intra_eu_b2b_reverse_charge');
    expect(order?.shippingFeeCents).toBe(ekran.payment?.shippingFeeCents);
    expect(order!.shippingFeeCents).toBeGreaterThan(990);
  });

  it('seçim yoksa en ucuz değil, EVE giden en ucuz servis yazılır', async () => {
    const outcome = await siparis();
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    expect(await new OrderService(db).getById(outcome.orderId)).toMatchObject({ shippingOptionCode: 'eve-ucuz', shippingFeeCents: await brut(outcome.orderId, 690) });
  });

  it('teslim noktası isteyen servis noktasız sipariş AÇMAZ', async () => {
    expect((await siparis({ shippingOptionCode: 'nokta-mr' })).status).toBe('service_point_invalid');
  });

  it('başka taşıyıcının noktası kabul edilmez — nokta sağlayıcıdan yeniden okunur', async () => {
    expect((await siparis({ shippingOptionCode: 'nokta-mr', servicePointId: 'sp-dpd' })).status).toBe('service_point_invalid');
  });

  it('geçerli nokta siparişe kopyası ile yazılır', async () => {
    const outcome = await siparis({ shippingOptionCode: 'nokta-mr', servicePointId: 'sp-mr' });
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    expect(await new OrderService(db).getById(outcome.orderId)).toMatchObject({
      shippingOptionCode: 'nokta-mr',
      shippingFeeCents: await brut(outcome.orderId, 450),
      servicePoint: { id: 'sp-mr', carrierCode: 'mondial_relay', name: 'Nokta sp-mr' },
    });
  });

  it('dükkân noktası dolap servisiyle sipariş AÇMAZ — noktanın türü sağlayıcıdan okunur', async () => {
    expect((await siparis({ shippingOptionCode: 'dolap-mr', servicePointId: 'sp-mr' })).status).toBe('service_point_invalid');
  });

  it('listede olmayan servis başka servise düşmez, sipariş açılmaz', async () => {
    expect((await siparis({ shippingOptionCode: 'kalkmis' })).status).toBe('shipping_option_unavailable');
  });

  it('etiketli ikizi olan etiketsiz servis istenemez — depo etiketi kendisi basıyor', async () => {
    expect((await siparis({ shippingOptionCode: 'eve-ucuz-qr' })).status).toBe('shipping_option_unavailable');
  });

  it('ücretsiz kargoda istenen teslim noktası yok sayılır: koli eve gider, maliyet teklifin fiyatıdır', async () => {
    const outcome = await siparis({
      entries: [{ kind: 'variant' as const, variantId, qty: 10, stockId: null }],
      shippingOptionCode: 'nokta-mr',
      servicePointId: 'sp-mr',
    });
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    const order = await new OrderService(db).getById(outcome.orderId);
    // Ön koşul: sepet eşiği geçti. Geçmediyse test kendi kurulumunu yalanlar, kural sınanmış olmaz.
    expect(order?.shippingFeeCents).toBe(0);
    expect(order).toMatchObject({ shippingOptionCode: 'eve-ucuz', servicePoint: null, deliveryCostCents: 690 });
  });
});

/**
 * Sabit yedek ücret yok: eşik altındaki kargo siparişi canlı fiyat olmadan açılmaz, eşik üstündeki fiyatsız da açılır ve servisi sevkte
 * depo seçer. Sebep ayrı taşınır, çünkü taşıyıcı arızası geçer, verimizin eksiği ise düzeltilene kadar sürer.
 */
describe('fiyatsız kargo siparişi', () => {
  const ekranOku = (over: Record<string, unknown> = {}) =>
    readCheckoutSnapshot(db, 'tr', {
      customerId,
      addressId,
      entries: entries(),
      couponCode: null,
      pickupWarehouseId: null,
      shippingOrder: true,
      rateProvider: saglayici,
      ...over,
    });

  it('eşik altında taşıyıcı cevap vermezse toplam bilinmez ve sipariş açılmaz', async () => {
    const ekran = await ekranOku({ rateProvider: cevapsizSaglayici });
    expect(ekran.shipping?.status).toBe('provider_error');
    expect(ekran.payment).toMatchObject({ shippingFeeCents: null, orderTotalCents: null });

    const outcome = await createCheckoutDraft({ ...base(), entries: entries(), shippingOrder: true, rateProvider: cevapsizSaglayici });
    expect(outcome).toEqual({ status: 'shipping_unpriced', reason: 'carrier' });
  });

  it('eşik üstünde taşıyıcı cevap vermese de sipariş ücretsiz açılır, servisi depo seçer', async () => {
    const outcome = await createCheckoutDraft({
      ...base(),
      entries: [{ kind: 'variant' as const, variantId, qty: 10, stockId: null }],
      shippingOrder: true,
      rateProvider: cevapsizSaglayici,
    });
    if (outcome.status !== 'ok') throw new Error(`taslak bekleniyordu: ${outcome.status}`);
    expect(await new OrderService(db).getById(outcome.orderId)).toMatchObject({ shippingFeeCents: 0, shippingOptionCode: null });
  });

  it('ölçüsü eksik ürün kargoyla sipariş açmaz; ekran ürünün adını söyler', async () => {
    const variants = new ProductVariantService(db);
    await variants.update({ id: variantId, packedWeightG: null });
    try {
      const ekran = await ekranOku();
      expect(ekran.shipping).toMatchObject({ status: 'unmeasured', unshippable: [expect.stringContaining(`Kargo ürünü ${stamp}`)] });
      expect(await createCheckoutDraft({ ...base(), entries: entries(), shippingOrder: true })).toEqual({
        status: 'shipping_unpriced',
        reason: 'data',
      });
    } finally {
      await variants.update({ id: variantId, packedWeightG: 1000 });
    }
  });
});
