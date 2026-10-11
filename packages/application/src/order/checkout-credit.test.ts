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
import {
  createTestWarehouse,
  mustDelete,
  purgeTestData,
  purgeVariantStock,
  settingsSnapshot,
  testPostalCode,
  type SettingsSnapshot,
} from '@lezzet/database/testing';
import type { PaymentMethod } from '@lezzet/types';
import { createCheckoutDraft } from './checkout-draft';
import { readDeliveryInputs, resolveDelivery } from './delivery';

/**
 * Vadeli işaret ve havale sunucuda denetlenir (DOMAIN §7): ekran seçeneği gizler ama istek elle kurulabilir ve kurye vadeli
 * siparişte para istemez. Havale yalnız açık vadenin yöntemidir, çünkü peşin havale beklenmeden teslim edilir.
 */
const db = serviceDb();
const stamp = Date.now();
const rotaKodu = testPostalCode();

let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let zoneId: string;
let bireyselId: string;
let vadesizIsletmeId: string;
let vadeliIsletmeId: string;
const adresOf = new Map<string, string>();
const createdProfiles: string[] = [];
let ayarlar: SettingsSnapshot;

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function ilkUygunGun(): Promise<string> {
  const inputs = await readDeliveryInputs(db);
  const { availableDates } = await resolveDelivery(db, { postalCode: rotaKodu, country: 'FR', business: 'lezzet', inputs });
  return availableDates[0]!;
}

/** Müşteri yolundan tek kalemlik sipariş; personel künyesi yok, çünkü açık müşterinin elle kurduğu istekteydi. */
async function siparis(customerId: string, paymentMethod: PaymentMethod, onAccount: boolean, qty: number) {
  return createCheckoutDraft(db, {
    locale: 'tr',
    customerId,
    entries: [{ kind: 'variant', variantId, qty, stockId: null }],
    addressId: adresOf.get(customerId)!,
    deliveryDate: await ilkUygunGun(),
    paymentMethod,
    onAccount,
  });
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Vadeli havale testi ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Kol böreği ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `VAD-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2500 });
  await prices.setPrice({ variantId, channel: 'b2b', amountCents: 3000 });
  await new StockService(db).insert({ warehouseId, variantId, physicalQty: 100, expiryDate: gun(120), purchasePriceCents: 900 });

  const profiles = new UserProfileService(db);
  const bireysel = await profiles.insert({ name: `Bireysel ${stamp}` });
  const vadesiz = await profiles.insert({ name: `Vadesiz işletme ${stamp}`, type: 'company', b2bApproved: true });
  const vadeli = await profiles.insert({
    name: `Vadeli işletme ${stamp}`,
    type: 'company',
    b2bApproved: true,
    creditEnabled: true,
    creditLimitCents: 1_000_000,
  });
  bireyselId = bireysel.id;
  vadesizIsletmeId = vadesiz.id;
  vadeliIsletmeId = vadeli.id;
  createdProfiles.push(bireysel.id, vadesiz.id, vadeli.id);

  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({ name: `Vadeli bölge ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: rotaKodu }]);
  const addresses = new AddressService(db);
  for (const customerId of createdProfiles) {
    const adres = await addresses.addForCustomer({
      customerId,
      recipient: 'Ayşe Yılmaz',
      phone: '+33612345678',
      line1: '1 rue du Test',
      postalCode: rotaKodu,
      city: 'Strasbourg',
    });
    adresOf.set(customerId, adres.id);
  }

  // Ret doğru sebeple doğsun diye iki küresel eşik varsayılanında tutulur: asgari sepet ve kapıda ödeme tavanı reddi kendi
  // sebebiyle döner. Satırlar okunup `afterAll`da geri konur (CLAUDE §4b).
  ayarlar = settingsSnapshot(db);
  await ayarlar.override('min_basket_cents', 4000);
  await ayarlar.override('cod_max_cents', 30000);
  SettingsService.invalidate();
});

beforeEach(async () => {
  await mustDelete(db, 'order', (q) => q.in('customer_id', createdProfiles));
});

afterAll(async () => {
  await ayarlar.restore();
  await mustDelete(db, 'order', (q) => q.in('customer_id', createdProfiles));
  await purgeVariantStock(db, [variantId]);
  await db.from('address').delete().in('customer_id', createdProfiles);
  await db.from('delivery_zone').delete().eq('id', zoneId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
  SettingsService.invalidate();
});

describe('vadeli işaret ve havale sunucuda denetlenir (11.10)', () => {
  it('kapıda nakit ödemeye vadeli işareti eklenemez', async () => {
    // 3 × 25 € = 75 €: asgari sepetin üstünde, kapıda ödeme tavanının altında — nakit yöntemi açık.
    expect((await siparis(bireyselId, 'cash', true, 3)).status).toBe('payment_not_allowed');
  });

  it('vade izni olmayan onaylı işletme vadeli havale açamaz', async () => {
    expect((await siparis(vadesizIsletmeId, 'bank_transfer', true, 10)).status).toBe('payment_not_allowed');
  });

  it('vadesi açık işletme peşin havale seçemez', async () => {
    expect((await siparis(vadeliIsletmeId, 'bank_transfer', false, 10)).status).toBe('payment_not_allowed');
  });

  it('vadesi açık işletme vadeli havaleyle sipariş açar', async () => {
    const sonuc = await siparis(vadeliIsletmeId, 'bank_transfer', true, 10);
    expect(sonuc.status).toBe('ok');
    const order = await new OrderService(db).getById((sonuc as { orderId: string }).orderId);
    expect(order).toMatchObject({ onAccount: true, paymentMethod: 'bank_transfer' });
  });
});
