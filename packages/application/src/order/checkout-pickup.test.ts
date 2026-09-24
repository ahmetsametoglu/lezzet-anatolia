import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AddressService,
  CategoryService,
  OrderService,
  PriceService,
  ProductService,
  SettingsService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock, testPostalCode } from '@lezzet/database/testing';
import { getCartView } from '../cart/read';
import { readCheckoutSnapshot } from './checkout-snapshot';
import { placeOrder } from './place-order';

/**
 * Gel-al checkout'u. Her test adını verebildiği bir arızayı yakalar:
 *  · izinsiz müşteriye teklif çıkar ya da izinsiz istek sipariş açarsa → teklif `null`, ret `pickup_not_allowed`;
 *  · gel-al noktası olmayan depo seçilebilirse → `pickup_warehouse_unavailable`;
 *  · gel-al siparişi bölge/gün/kargo ücreti taşır ya da depo seçilen değilse → satırın alanları;
 *  · depoda ödeme (kapıda ödeme kuralı) kapalı çıkarsa → yöntem listesi;
 *  · gel-al siparişine sepetin grubu ya da kapının asgari sepeti uygulanırsa → adrese gidemeyen kalem düşer ya da sipariş reddedilir.
 */
const db = serviceDb();
const stamp = Date.now();
const kod = testPostalCode();
let pickupWarehouseId = '';
let plainWarehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';
let allowedId = '';
let deniedId = '';
let allowedAddressId = '';
let deniedAddressId = '';

const entries = () => [{ kind: 'variant' as const, variantId, qty: 1, stockId: null }];

beforeAll(async () => {
  pickupWarehouseId = (await createTestWarehouse(db, { label: 'GLA', pickupEnabled: true })).id;
  plainWarehouseId = (await createTestWarehouse(db, { label: 'DUZ' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Gel-al checkout ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Gel-al künefesi ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `GLC-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: 2500 });
  await new StockService(db).insert({ warehouseId: pickupWarehouseId, variantId, physicalQty: 30, expiryDate: '2027-06-01', purchasePriceCents: 800 });
  const profiles = new UserProfileService(db);
  allowedId = (await profiles.insert({ name: `Gel-al izinli ${stamp}`, phone: `+3365555${String(stamp).slice(-4)}`, pickupAllowed: true })).id;
  deniedId = (await profiles.insert({ name: `Gel-al izinsiz ${stamp}`, phone: `+3366666${String(stamp).slice(-4)}` })).id;
  const addresses = new AddressService(db);
  // Adres hiçbir bölgede değil: gel-al adresten çözülmez, adres yalnız fatura adresi olarak siparişe yazılır.
  allowedAddressId = (await addresses.addForCustomer({ customerId: allowedId, recipient: 'Gel-al Alıcı', phone: '+33612345678', line1: '2 rue du Test', postalCode: kod, city: 'Strasbourg' })).id;
  deniedAddressId = (await addresses.addForCustomer({ customerId: deniedId, recipient: 'Düz Alıcı', phone: '+33612345679', line1: '3 rue du Test', postalCode: kod, city: 'Strasbourg' })).id;
});

afterAll(async () => {
  await mustDelete(db, 'order', (q) => q.in('customer_id', [allowedId, deniedId]));
  await purgeVariantStock(db, [variantId]);
  await db.from('address').delete().in('customer_id', [allowedId, deniedId]);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [allowedId, deniedId], warehouseIds: [pickupWarehouseId, plainWarehouseId] });
});

describe('gel-al teklifi (anlık görüntü)', () => {
  it('izinli müşteri gel-al noktasını görür; izinsiz müşteriye teklif yoktur', async () => {
    const allowed = await readCheckoutSnapshot(db, 'fr', { customerId: allowedId, entries: entries(), addressId: allowedAddressId });
    expect(allowed.pickup?.warehouses.map((w) => w.id)).toContain(pickupWarehouseId);
    // Gel-al noktası olmayan tesis teklifte YOK: müşteriye adresi gösterilmeyen depo seçilemez.
    expect(allowed.pickup?.warehouses.map((w) => w.id)).not.toContain(plainWarehouseId);
    const denied = await readCheckoutSnapshot(db, 'fr', { customerId: deniedId, entries: entries(), addressId: deniedAddressId });
    expect(denied.pickup).toBeNull();
  });

  it('gel-al seçilince tür `pickup`, gün ve kargo yok, depoda ödeme açık, ücret sıfır', async () => {
    const snapshot = await readCheckoutSnapshot(db, 'fr', {
      customerId: allowedId,
      entries: entries(),
      addressId: allowedAddressId,
      pickupWarehouseId,
    });
    expect(snapshot.delivery).toMatchObject({ deliveryType: 'pickup', availableDates: [], requiresDateChoice: false, blocked: false });
    expect(snapshot.shipping).toBeNull();
    expect(snapshot.payment?.shippingFeeCents).toBe(0);
    expect(snapshot.payment?.shippingFreeReason).toBe('pickup');
    expect(snapshot.payment?.methods).toEqual(expect.arrayContaining(['online', 'cash', 'card']));
    expect(snapshot.pickup?.selectedWarehouseId).toBe(pickupWarehouseId);
  });

  it('tanınmayan depo kimliği düşer — ekran adresin cevabına döner, sunucu uydurmaz', async () => {
    const snapshot = await readCheckoutSnapshot(db, 'fr', {
      customerId: allowedId,
      entries: entries(),
      addressId: allowedAddressId,
      pickupWarehouseId: plainWarehouseId,
    });
    expect(snapshot.pickup?.selectedWarehouseId).toBeNull();
    expect(snapshot.delivery?.deliveryType).not.toBe('pickup');
  });
});

describe('gel-al siparişi (placeOrder)', () => {
  const place = (customerId: string, addressId: string, warehouseId: string, paymentMethod: 'cash' | 'online' = 'cash') =>
    placeOrder(db, {
      locale: 'fr',
      customerId,
      entries: entries(),
      addressId,
      deliveryDate: null,
      paymentMethod,
      pickupWarehouseId: warehouseId,
      idempotencyKey: `gla-${stamp}-${customerId}-${warehouseId}-${Math.random().toString(36).slice(2, 8)}`,
      createPaymentSession: async () => ({ id: `pi_gla_${stamp}`, clientSecret: `secret_${stamp}` }),
    });

  it('izinsiz müşterinin gel-al isteği reddedilir — kart gizlenmiş olsa da kapı sunucuda', async () => {
    expect((await place(deniedId, deniedAddressId, pickupWarehouseId)).status).toBe('pickup_not_allowed');
  });

  it('gel-al noktası olmayan depo reddedilir', async () => {
    expect((await place(allowedId, allowedAddressId, plainWarehouseId)).status).toBe('pickup_warehouse_unavailable');
  });

  it('depoda ödemeyle gel-al siparişi: seçilen depodan, bölgesiz, günsüz, kargo ücretsiz, fatura adresiyle', async () => {
    const outcome = await place(allowedId, allowedAddressId, pickupWarehouseId);
    expect(outcome.status).toBe('placed');
    if (outcome.status !== 'placed') return;
    expect(outcome.deliveryType).toBe('pickup');
    const order = await new OrderService(db).getById(outcome.orderId);
    expect(order).toMatchObject({
      deliveryType: 'pickup',
      warehouseId: pickupWarehouseId,
      deliveryZoneId: null,
      deliveryDate: null,
      shippingFeeCents: 0,
      addressId: allowedAddressId,
      status: 'confirmed',
      paymentMethod: 'cash',
    });
    // Sipariş kaynağı sepetin kaynağıdır (`web`), yerinde satışın `door`u değil — iki `pickup` yolu raporda ayrışır.
    expect(order?.orderSource).toBe('web');
  });
});

describe('gel-al sepetin grubuna ve kapının asgari sepetine bağlı değildir', () => {
  const addresses = new AddressService(db);
  let pickupId = '';
  let shippingId = '';
  let kargoProductId = '';
  let kargoVariantId = '';
  let sogukProductId = '';
  let sogukVariantId = '';
  let addressId = '';
  const ikiKalem = () => [
    { kind: 'variant' as const, variantId: kargoVariantId, qty: 1, stockId: null },
    { kind: 'variant' as const, variantId: sogukVariantId, qty: 1, stockId: null },
  ];

  // DE'de kurulur, çünkü ülke başına tek aktif kargo deposu kuralı FR'de seed'in deposuyla çakışırdı.
  beforeAll(async () => {
    pickupId = (await createTestWarehouse(db, { label: 'GLD', countryCode: 'DE', pickupEnabled: true })).id;
    shippingId = (await createTestWarehouse(db, { label: 'KRD', countryCode: 'DE', shipsOnline: true })).id;
    const products = new ProductService(db);
    const kargo = await products.create({
      name: { tr: `Gel-al kargo ürünü ${stamp}` },
      categoryId,
      vatRate: 5.5,
      shippable: true,
      variants: [{ label: { tr: '1 kg' }, sku: `GLK-${stamp}` }],
    });
    const soguk = await products.create({
      name: { tr: `Gel-al soğuk ürün ${stamp}` },
      categoryId,
      vatRate: 5.5,
      shippable: false,
      variants: [{ label: { tr: '1 kg' }, sku: `GLS-${stamp}` }],
    });
    kargoProductId = kargo.product.id;
    kargoVariantId = kargo.variants[0]!.id;
    sogukProductId = soguk.product.id;
    sogukVariantId = soguk.variants[0]!.id;
    const prices = new PriceService(db);
    await prices.setPrice({ variantId: kargoVariantId, channel: 'b2c', amountCents: 2500 });
    await prices.setPrice({ variantId: sogukVariantId, channel: 'b2c', amountCents: 2500 });
    const stock = new StockService(db);
    for (const [warehouseId, variantId] of [
      [pickupId, kargoVariantId],
      [shippingId, kargoVariantId],
      [pickupId, sogukVariantId],
    ] as const) {
      await stock.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: '2027-06-01', purchasePriceCents: 800 });
    }
    // Bölge dışı adres: kapı yolu yok, soğuk zincir kalem bu adrese hiçbir yoldan gidemez.
    addressId = (
      await addresses.addForCustomer({
        customerId: allowedId,
        recipient: 'Gel-al Alıcı',
        phone: '+4978514457',
        line1: 'Marktplatz 5',
        postalCode: testPostalCode(),
        city: 'Kehl',
        country: 'DE',
      })
    ).id;
    // Kapı kuralı depo kapsamını okur, gel-al okumaz; taban yalnız bu testin gel-al deposuna yazılır.
    await new SettingsService(db).set('min_basket_cents', 1_000_000, { scopeType: 'warehouse', scopeId: pickupId });
    SettingsService.invalidate('min_basket_cents');
  });

  afterAll(async () => {
    await mustDelete(db, 'settings', (q) => q.eq('key', 'min_basket_cents').eq('scope_type', 'warehouse').eq('scope_id', pickupId));
    SettingsService.invalidate('min_basket_cents');
    await mustDelete(db, 'order', (q) => q.eq('customer_id', allowedId).eq('warehouse_id', pickupId));
    await purgeVariantStock(db, [kargoVariantId, sogukVariantId]);
    await mustDelete(db, 'address', (q) => q.eq('id', addressId));
    await purgeTestData(db, { productIds: [kargoProductId, sogukProductId], warehouseIds: [pickupId, shippingId] });
  });

  it('adrese gidemeyen kalem de depodan alınır ve depo kapsamlı taban gel-al siparişini durdurmaz', async () => {
    const outcome = await placeOrder(db, {
      locale: 'fr',
      customerId: allowedId,
      entries: ikiKalem(),
      addressId,
      deliveryDate: null,
      paymentMethod: 'cash',
      pickupWarehouseId: pickupId,
      idempotencyKey: `gld-${stamp}`,
      createPaymentSession: async () => ({ id: `pi_gld_${stamp}`, clientSecret: `secret_gld_${stamp}` }),
    });
    expect(outcome.status).toBe('placed');
    if (outcome.status !== 'placed') return;
    const { data } = await db.from('order_item').select('variant_id').eq('order_id', outcome.orderId);
    expect((data ?? []).map((row) => row.variant_id).sort()).toEqual([kargoVariantId, sogukVariantId].sort());
  });

  it('gel-al sepeti depo kapsamlı tabanı okumaz — okusaydı sepetin düğmesi kapanırdı', async () => {
    const view = await getCartView(db, 'fr', ikiKalem(), {
      customerId: allowedId,
      warehouseId: pickupId,
      shippingWarehouseId: null,
      country: 'DE',
      zoneId: null,
      pickup: true,
    });
    expect(view.minBasketOk).toBe(true);
  });
});
