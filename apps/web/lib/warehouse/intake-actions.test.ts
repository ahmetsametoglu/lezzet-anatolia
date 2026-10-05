import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseScope } from '@lezzet/domain-core';
import {
  CategoryService,
  ProductService,
  PurchaseOrderService,
  StockIntakeService,
  StockService,
  SupplierService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';

/*
  Stok ekranındaki mal kabulde alış fiyatı salt okunurdur, çünkü fiyat siparişin kaydıdır: ekrandan gönderilen fiyat partiye yazılırsa ya
  da depoya bağlı personele sipariş fiyatı giderse bu dosya kırmızıya döner. Oturum koruması ve sayfa yenileme sahtedir, gerisi gerçek.
*/

const kapsam: { simdiki: WarehouseScope } = { simdiki: { kind: 'all' } };
// Oturum kimliği personelin profil kimliğinden farklıdır, çünkü profil oturumdan önce açılır; kabul profile yazılmazsa FK düşer.
const personel = { id: '00000000-0000-4000-8000-00000000a0a0', profileId: '' };
vi.mock('@/lib/guard', () => ({
  requireWarehouseScope: async () => ({ user: personel, scope: kapsam.simdiki }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const { openIntakeFormAction, receiveIntakeAction } = await import('./intake-actions');

const db = serviceDb();
const stamp = Date.now();
let warehouseId = '';
let variantId = '';
let productId = '';
let categoryId = '';
let supplierId = '';
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Salt okunur kabul ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Salt okunur mantı ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  supplierId = (await new SupplierService(db).insert({ name: `Salt okunur tedarikçi ${stamp}` })).id;
  personel.profileId = (await new UserProfileService(db).insert({ name: `Kabulcü ${stamp}` })).id;
});

beforeEach(async () => {
  kapsam.simdiki = { kind: 'all' };
  await purgeVariantStock(db, [variantId]);
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    supplierIds: [supplierId],
    warehouseIds: [warehouseId],
    profileIds: [personel.profileId],
  });
});

async function siparis(unitPriceCents: number): Promise<string> {
  const { order } = await new PurchaseOrderService(db).createDraft(supplierId, 'lezzet', [{ variantId, qty: 10, unitPriceCents }]);
  return order.id;
}

describe('stok ekranında alış fiyatı salt okunur', () => {
  it('yetkili rol siparişin fiyatını görür, depoya bağlı personele fiyat gitmez', async () => {
    const purchaseOrderId = await siparis(600);

    const yonetici = await openIntakeFormAction(purchaseOrderId);
    expect(yonetici.data?.unitCostsCents?.[variantId]).toBe(600);

    kapsam.simdiki = { kind: 'limited', warehouseIds: [warehouseId] };
    const depocu = await openIntakeFormAction(purchaseOrderId);
    expect(depocu.data?.rows).toHaveLength(1);
    expect(depocu.data?.unitCostsCents).toBeNull();
  });

  it('ekrandan gönderilen fiyat yok sayılır, parti siparişin fiyatıyla doğar', async () => {
    const purchaseOrderId = await siparis(600);
    const satir = { variantId, qty: 10, expiryDate: dayOffset(90), lotNumber: null, storageAreaId: null, unitCost: 1 };

    const sonuc = await receiveIntakeAction({
      warehouseId,
      purchaseOrderId,
      supplierId,
      date: null,
      note: null,
      lines: [satir as Omit<typeof satir, 'unitCost'>],
    });

    expect(sonuc.error).toBeNull();
    const partiler = await new StockService(db).listByVariant(warehouseId, variantId);
    expect(partiler.map((parti) => parti.purchasePriceCents)).toEqual([600]);
  });

  it('kabulü yapan personelin profiliyle yazılır', async () => {
    const satir = { variantId, qty: 3, expiryDate: dayOffset(90), lotNumber: null, storageAreaId: null };

    const sonuc = await receiveIntakeAction({ warehouseId, purchaseOrderId: null, supplierId, date: null, note: null, lines: [satir] });

    expect(sonuc.error).toBeNull();
    const kabuller = await new StockIntakeService(db).listRecent({ warehouseIds: [warehouseId] });
    expect(kabuller.rows.map((kabul) => kabul.receivedBy)).toContain(personel.profileId);
  });
});
