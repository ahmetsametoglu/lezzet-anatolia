import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { createCheckoutDraft } from './checkout-draft';

/**
 * Kargo siparişi taslağı (19.15) — sepetin kargo grubundan açılan İKİNCİ sipariş.
 *
 * Sınanan asıl şey şu: **rota İÇİ bir adresten açılan kargo siparişi, rota deposundan değil KARGO
 * deposundan çıkar.** Taslak sepetin alt kümesini zaten alabiliyordu ama teslimatı adresten
 * çözüyordu; adres rota içindeyse zincir rota deposunu döndürür ve sipariş malın BULUNMADIĞI
 * depodan açılırdı.
 *
 * Kurulum `DE` üzerinde: "ülke başına en fazla bir aktif kargo deposu" kısmi unique indeksi (0042)
 * FR'de seed'in deposuyla çakışırdı. Test kendi ülkesinde kendi ikilisini kurar — paylaşılan
 * veritabanında başka bir koşuyu etkilemez (`CLAUDE.md §4b`).
 */
const db = serviceDb();
const stamp = Date.now();
/**
 * Damgalı kod: seed'in `DE-77694`'ü PK'yi (ülke, kod) zaten tutuyor.
 *
 * **Önek 43, çünkü DE referansında 43 ile başlayan kod YOK** (ölçüldü: 0 satır; boş önekler
 * 00 · 05 · 43 · 62). Önceki hâli `10_000 + (stamp % 80_000)` idi ve künyesinde "bu kod GeoNames'te
 * de yok" yazıyordu — o iddia DOĞRULANMAMIŞTI ve yanlıştı: üretilen aralık gerçek DE kodlarıyla
 * dolu. 19.17 ile bedeli doğdu (`createCheckoutDraft` rota siparişinde şehri kodun yerleşimleriyle
 * karşılaştırıyor); damga gerçek bir koda denk geldiğinde buradaki "Kehl" uymaz ve dosya kendiliğinden
 * düşerdi. Şimdi iddia ölçülmüş bir gerçek: test aynı zamanda 19.16a'yı sınıyor — kendi bölge
 * tablomuz dış referanstan üstündür.
 */
const rotaKodu = `43${String(stamp).slice(-3)}`;

let categoryId: string;
let productId: string;
let variantId: string;
let customerId: string;
let authUserId: string;
let addressId: string;
/**
 * KDV testlerinin ŞİRKET müşterisi (03.10) — ayrı bir profil, çünkü var olanın tipini değiştirmek
 * dosyadaki öteki testlere sızardı (`type: 'company'` ödeme seçeneklerini de oynatır).
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
      line1: 'Marktplatz 3',
      postalCode: rotaKodu,
      city: 'Kehl',
      country: 'DE',
    })
  ).id;

  // ── KDV testlerinin şirket müşterisi: DE + B2B + VIES'te DOĞRULANMIŞ numara ────
  // Reverse charge dalının üç şartı da burada kuruluyor. `vatNumberValid` AYRI bir alan ve öyle
  // olmalı: numaranın yazılmış olması doğrulanmış olması demek değil — motor yalnız `true`da %0
  // açar, çünkü yanlış %0 uygulamanın bedelini biz öderiz.
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
      line1: 'Hauptstraße 12',
      postalCode: rotaKodu,
      city: 'Kehl',
      country: 'DE',
    })
  ).id;
  SettingsService.invalidate();
});

beforeEach(async () => {
  await db.from('order').delete().in('customer_id', [customerId, b2bCustomerId]);
});

afterAll(async () => {
  await db.from('order').delete().in('customer_id', [customerId, b2bCustomerId]);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('address').delete().in('customer_id', [customerId, b2bCustomerId]);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId],
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
const base = () => ({ locale: 'tr' as const, customerId, addressId, deliveryDate: null, paymentMethod: 'online' as const });

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
    // Aynı kalem, aynı adres: bayraksız çağrıda zincir adresin cevabını olduğu gibi kullanır ve
    // sipariş ROTA deposundan açılmaya çalışılır. Kalem orada yok.
    //
    // Bu kontrol `blocked`'tan AYRIDIR ve olmak zorunda: 19.10 `blocked`'ı daralttı çünkü kargoyla
    // gelebilen ürün "tükendi" değildir (C3) — sepette satılabilir görünür. Ama bu sipariş tek
    // depodan çıkar (K5). Ayrım olmasaydı taslak açılır, iş rezervasyonda patlardı: müşteri
    // ödemeye geçtikten SONRA.
    const outcome = await createCheckoutDraft({ ...base(), entries: entries() });
    expect(outcome.status).toBe('blocked_lines');
  });
});

/**
 * KDV işlemi (03.10 · DOMAIN §5) — **sınanan şey motor değil, motorun ÇAĞRILDIĞI.**
 *
 * `resolveVatTreatment` yazılıydı, testliydi ve hiçbir yerden çağrılmıyordu: `vat_treatment`
 * kolonunu yazan tek şey `default 'domestic'`ti. Motorun kendi testi bu açığı göremezdi — test
 * motoru zaten elle çağırıyor. Görülebileceği tek yer burası: sepetten doğan gerçek bir siparişin
 * satırına bakmak.
 *
 * Kurulum bu dosyada, ayrı bir dosyada DEĞİL: reverse charge DE'ye teslimat ister, DE teslimatı
 * kargo deposu ister ve `warehouse_single_online` (0031) ülke başına tek aktif kargo deposuna izin
 * verir. İkinci bir dosya kendi DE kargo deposunu kursaydı, paralel koşan bu dosyayla çakışır ve
 * ortaya tekrarlanmayan bir düşüş çıkardı (`CLAUDE.md §4b`).
 */
describe('KDV işlemi — sipariş anında çözülür', () => {
  const b2bBase = () => ({
    locale: 'tr' as const,
    customerId: b2bCustomerId,
    addressId: b2bAddressId,
    deliveryDate: null,
    paymentMethod: 'online' as const,
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
