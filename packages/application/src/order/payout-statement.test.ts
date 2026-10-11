import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { recordOrderPayment } from './payment';
import { reconcilePayoutStatement } from './payout-statement';
import type { RevolutClient } from './revolut';

/**
 * Aktarım raporundan komisyon: rapor iki kez okunsa da komisyon bir kez yazılır, komisyon satırı ödemenin künyesini taşısa da iade
 * olayları ödemeyi bulmaya devam eder ve defterin açıklayamadığı işlem yönetime aktarım başına bir kez bildirilir.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stamp = Date.now();
const paymentRef = `rev_${stamp}`;
const payoutIds = [`payout_${stamp}_a`, `payout_${stamp}_b`];

let warehouseId: string;
let productId: string;
let categoryId: string;
let providerAccount: string;
let orderId: string;
const createdProfiles: string[] = [];

/** Raporun okunan sütunları; Revolut'un dosyası daha fazlasını taşır, okuyucu adla seçer. */
const HEADER = 'type,state,order_id,original_order_id,transaction_amount,fee_amount,fee_currency,settlement_amount';

/** Raporu hazır dönen sahte sağlayıcı; dosya isteği CSV istemeli, yoksa gerçek sağlayıcı JSON hatası dönerdi. */
function reportClient(rows: string[]): RevolutClient {
  return {
    mode: 'sandbox',
    async request(method, path, _body, opts) {
      if (method === 'POST' && path === '/api/report-runs') return { report_run_id: 'run-1', status: 'completed' };
      if (path === '/api/report-runs/run-1/file') {
        expect(opts?.accept).toBe('text/csv');
        return [HEADER, ...rows].join('\n');
      }
      throw new Error(`beklenmeyen istek: ${method} ${path}`);
    },
  };
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Aktarım testi ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Pekmez ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  const customer = await new UserProfileService(db).insert({ name: `Aktarım müşterisi ${stamp}` });
  createdProfiles.push(customer.id);
  providerAccount = (await new AccountService(db).insert({ name: `Aktarım havuzu ${stamp}`, type: 'provider' })).id;

  const { order } = await orders.create(
    { warehouseId, customerId: customer.id, channel: 'b2c', orderSource: 'web', orderedTotalCents: 2000 },
    [{ variantId: variants[0]!.id, qty: 2, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  orderId = order.id;
  await recordOrderPayment(db, {
    orderId,
    accountId: providerAccount,
    amountCents: 2000,
    method: 'online',
    meta: { providerRef: paymentRef },
  });
});

afterAll(async () => {
  // Zil hedefsizdir ve bütün yöneticilere düşer; test yalnız kendi aktarımlarının satırını siler.
  await mustDelete(db, 'notification', (q) => q.eq('kind', 'payout_unexplained').in('payload->>payoutId', payoutIds));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    accountIds: [providerAccount],
    warehouseIds: [warehouseId],
  });
});

describe('aktarım raporundan kart komisyonu', () => {
  it('komisyon siparişe ve deftere bir kez yazılır; yazıldıktan sonra iade olayları ödemeyi yine bulur', async () => {
    const client = reportClient([`Settlement,COMPLETED,${paymentRef},${paymentRef},20.00,0.45,EUR,19.55`]);

    const first = await reconcilePayoutStatement(db, client, payoutIds[0]!);
    const second = await reconcilePayoutStatement(db, client, payoutIds[0]!);

    expect(first).toEqual({ feesWritten: 1, unexplained: 0 });
    expect(second).toEqual({ feesWritten: 0, unexplained: 0 });
    expect((await orders.getById(orderId))?.paymentFeeCents).toBe(45);
    const { data, error } = await db.from('money_movement').select('amount').eq('idempotency_key', `card-fee:${paymentRef}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    // Komisyon satırı siparişe bağlanmaz; künye araması onu döndürseydi iade mutabakatı siparişi bulamazdı.
    expect((await new MoneyMovementService(db).findByProviderRef(paymentRef))?.orderId).toBe(orderId);
  });

  it('defterin açıklayamadığı işlem yönetime aktarım başına tek zil düşürür', async () => {
    const admin = await new UserProfileService(db).insert({ name: `Aktarım zili ${stamp}`, roles: ['admin'] });
    createdProfiles.push(admin.id);
    const client = reportClient([
      `Settlement,COMPLETED,${paymentRef},${paymentRef},20.00,0.45,EUR,19.55`,
      `Settlement,COMPLETED,yabanci_${stamp},yabanci_${stamp},12.00,0.30,EUR,11.70`,
      `Customer dispute - withdrawal,COMPLETED,cb_${stamp},${paymentRef},-5.00,0.00,EUR,-5.00`,
    ]);

    const outcome = await reconcilePayoutStatement(db, client, payoutIds[1]!);
    await reconcilePayoutStatement(db, client, payoutIds[1]!);

    expect(outcome.unexplained).toBe(2);
    const { data, error } = await db
      .from('notification')
      .select('payload')
      .eq('profile_id', admin.id)
      .eq('kind', 'payout_unexplained')
      .eq('payload->>payoutId', payoutIds[1]!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.payload).toMatchObject({ rowCount: 2, amountCents: 670 });
  });
});
