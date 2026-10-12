import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import {
  createTestWarehouse,
  mustDelete,
  purgeTestData,
  purgeVariantStock,
  settingsSnapshot,
  testPostalCode,
  type SettingsSnapshot,
} from '@lezzet/database/testing';
import type {
  StaffAddressCreateResponse,
  StaffAddressOption,
  StaffCustomerPage,
  StaffDeliveryContext,
  StaffOrderOrigin,
  StaffOrderResponse,
  StaffStockResponse,
  StaffVariantScan,
} from '@lezzet/types';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, type SignedInUser } from '../../lib/testing';

/**
 * Personelin müşteri adına sipariş girişi (mobil): rol kapısı, pazarlık kapısı ve kuryenin siparişi gerçekten açması. Seçicideki kalan
 * limit ve ödeme ön izlemesi de burada ölçülür, çünkü ikisi de birden çok okumanın birleşimidir ve yanlış müşteriye yazılabilir.
 */
const db = serviceDb();
const stamp = Date.now();
const rotaKodu = testPostalCode();

const LIMIT = 1_000_000;
const IKINCI_LIMIT = 250_000;

let warehouseId: string;
let baskaDepoId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let zoneId: string;
let vadeliId: string;
let ikinciVadeliId: string;
let vadeliAdresId: string;
let kurye: SignedInUser;
let yonetici: SignedInUser;
let musteriHesabi: SignedInUser;
const profiller: string[] = [];
let ayarlar: SettingsSnapshot;

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const istek = (user: SignedInUser, path: string, body?: unknown) =>
  app.request(`/api/v1/staff-order${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...bearer(user.token), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const baglam = async (lines: { totalCents: number; vatRate: number }[]) =>
  envelopeData<StaffDeliveryContext>(await istek(kurye, '/context', { customerId: vadeliId, addressId: vadeliAdresId, lines }));

const siparis = async (user: SignedInUser, patch: Record<string, unknown> = {}) => {
  const { delivery } = await baglam([]);
  return istek(user, '/orders', {
    customerId: vadeliId,
    addressId: vadeliAdresId,
    deliveryDate: delivery.availableDates[0] ?? null,
    paymentMethod: 'cash',
    onAccount: false,
    lines: [{ variantId, qty: 2 }],
    ...patch,
  });
};

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  baskaDepoId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Personel siparişi ${stamp}` } })).id;
  // Seçici yalnız satıştaki ürünü listeler; yayın kısıtı üç dilde ad, açıklama, içindekiler, saklama ve alerjen beyanı ister.
  const ucDil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
  const urun = await new ProductService(db).create({
    name: ucDil(`Saha böreği ${stamp}`),
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `PSG-${stamp}`, netQuantity: 1000, netUnit: 'g' }],
    description: ucDil('Personel siparişi testi ürünü'),
    ingredients: ucDil('Un, su, tuz'),
    storageInstructions: ucDil('Serin yerde saklayın'),
    allergens: [],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
  await new ProductService(db).update({ id: productId, status: 'active' });
  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2500 });
  await prices.setPrice({ variantId, channel: 'b2b', amountCents: 3000 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 100, expiryDate: gun(120), purchasePriceCents: 900 });

  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Personel siparişi bölgesi ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5, 6, 7] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);

  const profiles = new UserProfileService(db);
  const vadeli = await profiles.insert({
    name: `Saha işletmesi ${stamp}`,
    type: 'company',
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: LIMIT,
  });
  const ikinci = await profiles.insert({
    name: `Saha komşusu ${stamp}`,
    type: 'company',
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: IKINCI_LIMIT,
  });
  vadeliId = vadeli.id;
  ikinciVadeliId = ikinci.id;
  profiller.push(vadeli.id, ikinci.id);
  vadeliAdresId = (
    await new AddressService(db).addForCustomer({
      customerId: vadeliId,
      recipient: 'Mutfak',
      phone: '+33612345678',
      line1: '3 rue du Test',
      postalCode: rotaKodu,
      city: 'Strasbourg',
    })
  ).id;

  kurye = await createSignedInUser({ prefix: 'staff-order', label: 'kurye', roles: ['courier'], warehouseIds: [warehouseId] });
  yonetici = await createSignedInUser({ prefix: 'staff-order', label: 'yonetici', roles: ['admin'], warehouseIds: [warehouseId] });
  musteriHesabi = await createSignedInUser({ prefix: 'staff-order', label: 'musteri' });
  profiller.push(kurye.profileId, yonetici.profileId, musteriHesabi.profileId);

  // Kapıda ödeme tavanı ölçülen değerde tutulur; satır okunup `afterAll`da geri konur (CLAUDE §4b).
  ayarlar = settingsSnapshot(db);
  await ayarlar.override('cod_max_cents', 30000);
  SettingsService.invalidate();
});

afterAll(async () => {
  await ayarlar?.restore();
  await mustDelete(db, 'order', (q) => q.in('customer_id', [vadeliId, ikinciVadeliId]));
  await purgeVariantStock(db, [variantId]);
  await db.from('address').delete().in('customer_id', [vadeliId, ikinciVadeliId]);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: profiller,
    authUserIds: [kurye.authUserId, yonetici.authUserId, musteriHesabi.authUserId],
    warehouseIds: [warehouseId, baskaDepoId],
  });
  SettingsService.invalidate();
});

describe('rol kapısı', () => {
  it('müşteri hesabı personel sipariş uçlarına giremez', async () => {
    expect((await istek(musteriHesabi, `/customers?q=${stamp}`)).status).toBe(403);
  });
});

describe('sipariş yazımı', () => {
  it('kurye müşterinin fiyatıyla siparişi açar; sipariş elle girilmiş kaynağıyla bu depoya yazılır', async () => {
    const data = await envelopeData<StaffOrderResponse>(await siparis(kurye));
    expect(data.status).toBe('placed');
    if (data.status !== 'placed') return;
    const order = await new OrderService(db).getById(data.orderId);
    expect(order).toMatchObject({ customerId: vadeliId, warehouseId, orderSource: 'manual', paymentMethod: 'cash' });
  });

  it('kuryenin pazarlıklı fiyatı reddedilir ve sipariş yazılmaz', async () => {
    const once = (await new OrderService(db).listByCustomer(vadeliId)).rows.length;
    const res = await siparis(kurye, { lines: [{ variantId, qty: 1, unitPriceCents: 1000 }] });
    expect(res.status).toBe(403);
    expect((await new OrderService(db).listByCustomer(vadeliId)).rows.length).toBe(once);
  });

  it('yöneticinin pazarlıklı fiyatı kaleme, liste fiyatı ve yazan kişi pazarlık izine yazılır', async () => {
    const data = await envelopeData<StaffOrderResponse>(await siparis(yonetici, { lines: [{ variantId, qty: 1, unitPriceCents: 2000 }] }));
    expect(data.status).toBe('placed');
    if (data.status !== 'placed') return;
    const { data: kalem } = await db
      .from('order_item')
      .select('unit_price, list_unit_price, price_set_by')
      .eq('order_id', data.orderId)
      .single();
    expect({ birim: Number(kalem?.unit_price), liste: Number(kalem?.list_unit_price), yazan: kalem?.price_set_by }).toEqual({
      birim: 20,
      liste: 30,
      yazan: yonetici.profileId,
    });
  });

  it('kapalı yöntem hata değil cevaptır: sebep kodu ve personelin cümlesi gelir', async () => {
    const data = await envelopeData<StaffOrderResponse>(await siparis(kurye, { lines: [{ variantId, qty: 12 }] }));
    expect(data).toMatchObject({ status: 'rejected', reason: 'payment_not_allowed' });
    if (data.status === 'rejected') expect(data.message.length).toBeGreaterThan(0);
  });
});

describe('duraktan ve barkoddan giriş', () => {
  it('duraktan açılan sipariş durağın müşterisine ve adresine bağlanır', async () => {
    const yazilan = await envelopeData<StaffOrderResponse>(await siparis(kurye));
    expect(yazilan.status).toBe('placed');
    if (yazilan.status !== 'placed') return;
    const origin = await envelopeData<StaffOrderOrigin>(await istek(kurye, `/origin/${yazilan.orderId}`));
    expect({ musteri: origin.customer.id, adres: origin.addressId }).toEqual({ musteri: vadeliId, adres: vadeliAdresId });
  });

  it('okutulan ürün müşterinin fiyatıyla gelir; maliyet yalnız yöneticiye gider', async () => {
    const yol = `/variants/scan?customerId=${vadeliId}&warehouseId=${warehouseId}&code=PSG-${stamp}`;
    const kuryeye = await envelopeData<StaffVariantScan>(await istek(kurye, yol));
    const yoneticiye = await envelopeData<StaffVariantScan>(await istek(yonetici, yol));
    expect(kuryeye).toMatchObject({ status: 'found', qtyPerCode: 1, row: { variantId, listPriceCents: 3000, costCents: null } });
    expect(yoneticiye).toMatchObject({ status: 'found', row: { variantId, listPriceCents: 3000 } });
    if (yoneticiye.status === 'found') expect(yoneticiye.row.costCents).not.toBeNull();
  });
});

describe('stok tazeleme', () => {
  it('kalan yalnız istenen deponun stoğundan okunur', async () => {
    const oku = async (depo: string) =>
      envelopeData<StaffStockResponse>(await istek(kurye, '/stock', { warehouseId: depo, variantIds: [variantId] }));
    expect((await oku(warehouseId)).stock[0]?.availableQty).toBeGreaterThan(0);
    expect(await oku(baskaDepoId)).toEqual({ stock: [{ variantId, availableQty: 0 }] });
  });
});

describe('ödeme ön izlemesi', () => {
  it('tavanı aşan tutarda kapıda ödeme sebebiyle kapanır, altında açıktır', async () => {
    const alti = await baglam([{ totalCents: 2 * 3000, vatRate: 5.5 }]);
    expect(alti.payment.methods).toContain('cash');
    const ustu = await baglam([{ totalCents: 12 * 3000, vatRate: 5.5 }]);
    expect(ustu.payment).toMatchObject({ codBlockedReason: 'over_limit', codMaxCents: 30000 });
    expect(ustu.payment.methods).not.toContain('cash');
  });
});

describe('müşteri seçicisi', () => {
  it('kalan limit açık vadeli siparişten düşer ve her satır kendi müşterisinin bakiyesini taşır', async () => {
    const vadeliSiparis = await envelopeData<StaffOrderResponse>(
      await siparis(kurye, { paymentMethod: 'bank_transfer', onAccount: true, lines: [{ variantId, qty: 3 }] }),
    );
    expect(vadeliSiparis.status).toBe('placed');
    if (vadeliSiparis.status !== 'placed') return;
    const order = await new OrderService(db).getById(vadeliSiparis.orderId);

    const page = await envelopeData<StaffCustomerPage>(await istek(kurye, `/customers?q=${stamp}`));
    const satir = (id: string) => page.customers.find((c) => c.id === id);
    expect(satir(vadeliId)?.credit).toMatchObject({ limitCents: LIMIT, remainingCents: LIMIT - (order?.orderedTotalCents ?? 0) });
    expect(satir(ikinciVadeliId)?.credit).toMatchObject({ limitCents: IKINCI_LIMIT, remainingCents: IKINCI_LIMIT });
  });

  it('tek harfle arama yapılmaz', async () => {
    const page = await envelopeData<StaffCustomerPage>(await istek(kurye, '/customers?q=S'));
    expect(page.customers).toEqual([]);
  });
});

describe('adres', () => {
  it('geçersiz posta kodu alanıyla döner, geçerli adres listeye girer', async () => {
    const yol = `/customers/${ikinciVadeliId}/addresses`;
    const gecersiz = await envelopeData<StaffAddressCreateResponse>(
      await istek(kurye, yol, { recipient: 'Kasa', phone: '+33612345678', line1: '5 rue du Test', postalCode: '67', city: 'Strasbourg' }),
    );
    expect(gecersiz).toEqual({ status: 'invalid', field: 'postalCode' });

    const gecerli = await envelopeData<StaffAddressCreateResponse>(
      await istek(kurye, yol, {
        recipient: 'Kasa',
        phone: '+33612345678',
        line1: '5 rue du Test',
        postalCode: rotaKodu,
        city: 'Strasbourg',
      }),
    );
    expect(gecerli.status).toBe('ok');
    if (gecerli.status !== 'ok') return;
    const liste = await envelopeData<{ addresses: { id: string }[] }>(await istek(kurye, yol));
    expect(liste.addresses.map((a) => a.id)).toContain(gecerli.address.id);
  });

  // Seçenek adresin ülkesini taşımaz ya da sabit yazarsa personelin kalem seçicisi Almanya adresine Fransa fiyatını sorar; kırmızıya döner.
  it('adres seçeneği adresin ülkesini taşır', async () => {
    const almanya = await new AddressService(db).addForCustomer({
      customerId: vadeliId,
      recipient: 'Lager',
      phone: '+49781223344',
      line1: 'Hauptstraße 45',
      postalCode: '77652',
      city: 'Offenburg',
      country: 'DE',
    });

    const liste = await envelopeData<{ addresses: StaffAddressOption[] }>(await istek(kurye, `/customers/${vadeliId}/addresses`));
    const ulkesi = (id: string) => liste.addresses.find((a) => a.id === id)?.country;
    expect(ulkesi(almanya.id)).toBe('DE');
    expect(ulkesi(vadeliAdresId)).toBe('FR');
  });
});
