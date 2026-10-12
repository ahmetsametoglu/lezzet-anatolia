import {
  AccountService,
  AddressService,
  CategoryService,
  OrderService,
  ProductService,
  UserProfileService,
  type Db,
} from '@lezzet/database';
import { createTestWarehouse } from '@lezzet/database/testing';
import type { UserProfileInsert, VatTreatment } from '@lezzet/types';

/**
 * Satış faturası testlerinin zemini: kendi deposu, ürünü ve hesabı; şirket müşterisi açar ve teslim edilmiş satışı verilen güne
 * kurar. Durum kaydı elle yazılır, çünkü satış günü onun anından türer ve servis tarihi geriye alamaz.
 */
export async function salesInvoiceGround(db: Db) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const orders = new OrderService(db);
  const warehouse = await createTestWarehouse(db);
  const category = await new CategoryService(db).create({ name: { tr: `Fatura testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Baklava ${stamp}`, fr: `Baklava ${stamp}` },
    categoryId: category.id,
  });
  const account = await new AccountService(db).insert({ name: `Fatura testi ${stamp}`, type: 'bank' });
  const created = {
    productIds: [product.id],
    categoryIds: [category.id],
    warehouseIds: [warehouse.id],
    accountIds: [account.id],
    profileIds: [] as string[],
  };
  let counter = 0;

  /** Bilgisi tam Fransız şirketi; `billing: false` fatura adresi olmayan kaydı açar. */
  async function company(over: UserProfileInsert = {}, opts: { billing?: boolean } = {}) {
    counter += 1;
    const profile = await new UserProfileService(db).insert({
      name: `Ahmet Yılmaz ${stamp}-${counter}`,
      type: 'company',
      email: `fatura-${stamp}-${counter}@example.test`,
      country: 'FR',
      preferredLanguage: 'fr',
      companyInfo: { legalName: `Restaurant Oberjaegerhof ${stamp}-${counter}`, siret: '73282932000074' },
      b2bApproved: true,
      ...over,
    });
    created.profileIds.push(profile.id);
    if (opts.billing !== false) await billingAddress(profile.id);
    return profile;
  }

  function billingAddress(customerId: string) {
    return new AddressService(db).addForCustomer({
      customerId,
      recipient: 'Restaurant Oberjaegerhof',
      line1: '12 rue du Faubourg de Pierre',
      postalCode: '67000',
      city: 'Strasbourg',
      phone: '+33388000000',
      country: 'FR',
      isBilling: true,
    });
  }

  /** Teslim edilmiş satış; tutar KDV hariçtir (B2B tabanı). */
  async function sale(
    customerId: string,
    g: {
      soldOn: string;
      qty?: number;
      fulfilledQty?: number;
      unitPriceCents?: number;
      channel?: 'b2b' | 'b2c';
      isGiftOrder?: boolean;
      vatTreatment?: VatTreatment;
    },
  ) {
    counter += 1;
    const qty = g.qty ?? 1;
    const unitPriceCents = g.unitPriceCents ?? 1000;
    const { order } = await orders.create(
      {
        warehouseId: warehouse.id,
        customerId,
        channel: g.channel ?? 'b2b',
        orderedTotalCents: qty * unitPriceCents,
        pricesIncludeVat: false,
        isGiftOrder: g.isGiftOrder,
        vatTreatment: g.vatTreatment,
      },
      [{ variantId: variants[0]!.id, qty, fulfilledQty: g.fulfilledQty ?? qty, unitPriceCents, vatRate: 5.5 }],
    );
    await orders.update({ id: order.id, status: 'delivered', referenceNo: `LA-SI-${stamp}-${counter}` });
    const { error } = await db
      .from('order_status_log')
      .insert({ order_id: order.id, from_status: 'draft', to_status: 'delivered', created_at: `${g.soldOn}T10:00:00.000Z` });
    if (error) throw error;
    return order;
  }

  return { created, accountId: account.id, company, billingAddress, sale };
}
