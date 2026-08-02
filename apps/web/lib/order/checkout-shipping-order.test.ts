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
  await new PriceService(db).insert({ variantId, channel: 'b2c', amount: 40 });

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
  SettingsService.invalidate();
});

beforeEach(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
});

afterAll(async () => {
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('address').delete().eq('customer_id', customerId);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    authUserIds: [authUserId],
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
