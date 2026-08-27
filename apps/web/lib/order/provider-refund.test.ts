import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountService,
  CategoryService,
  MoneyMovementService,
  OrderService,
  ProductService,
  StockService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { purgeTestData, createTestWarehouse, purgeVariantStock, mustDelete } from '@lezzet/database/testing';
import { recordOrderPayment } from '../money/order-payment';
import { cancelOrder, retryRefund } from './refund';
import { handleStripeEvent } from './stripe-webhook';
import type { ProviderRefundInput, ProviderRefundOutcome, ProviderRefunder } from './provider-refund';
import { transitionOrder } from './transition';

/**
 * **Sağlayıcıya iade** (07.11) — paranın karta fiilen dönmesi.
 *
 * Sınanan tek şey SIRA ve onun sonuçları: *önce sağlayıcı çağrısı, sonra hareket.* Ters sırada
 * başarısız bir iade defterde kapanmış görünür, para dönmemiş olur — ve hiçbir ekranda iz bırakmaz.
 * Bu yüzden testlerin çoğu çağrı DÜŞTÜĞÜNDE geriye ne kaldığına bakıyor.
 *
 * Sağlayıcı bir PORT: gerçek Stripe'a çıkmadan "döndü" ve "düştü" hâlleri kurulabiliyor.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const money = new MoneyMovementService(db);

const stamp = Date.now();
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let providerAccount: string;
let cashAccount: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const category = await new CategoryService(db).create({ name: { tr: `Sağlayıcı iade ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Börek ${stamp}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `Sağlayıcı iade müşterisi ${stamp}` })).id;
  // Stripe havuzu bir HESAPTIR (DOMAIN §9) — sağlayıcı çağrısı hesabın türünden tetiklenir.
  providerAccount = (await new AccountService(db).insert({ name: `Stripe ${stamp}`, type: 'provider' })).id;
  cashAccount = (await new AccountService(db).insert({ name: `Kasa ${stamp}`, type: 'cash' })).id;
});

beforeEach(async () => {
  // SIRA: defter → parti → sipariş (06.14) — künye `packages/application/src/courier/day.test.ts`te.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(30), purchasePriceCents: 400 });
});

afterAll(async () => {
  await db.from('webhook_event').delete().like('event_id', `evt_${stamp}_%`);
  // Parti ÖNCE: son testin siparişi deftere `sale` yazmış olabilir ve o satır siparişi tutuyor.
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'order', (q) => q.eq('customer_id', customerId));
  await mustDelete(db, 'reservation', (q) => q.eq('variant_id', variantId));
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: [customerId],
    accountIds: [providerAccount, cashAccount],
    warehouseIds: [warehouseId],
  });
});

/** Sahte sağlayıcı: çağrıları kaydeder, sonucu test söyler. */
function fakeRefunder(outcome: ProviderRefundOutcome): ProviderRefunder & { calls: ProviderRefundInput[] } {
  const calls: ProviderRefundInput[] = [];
  const refunder = (async (input: ProviderRefundInput) => {
    calls.push(input);
    return outcome;
  }) as ProviderRefunder & { calls: ProviderRefundInput[] };
  refunder.calls = calls;
  return refunder;
}

/**
 * Kartla ödenmiş, onaylanmış sipariş. `providerRef` tahsilat hareketinin künyesine yazılır —
 * üretimde bunu webhook yapar, burada aynı kapı taklit edilir.
 */
async function paidOrder(opts: { providerRef?: string | null; accountId?: string } = {}) {
  const { order } = await orders.create({ warehouseId, customerId, channel: 'b2c', deliveryType: 'route', totalCents: 2000 }, [
    { variantId, qty: 2, unitPriceCents: 1000, vatRate: 5.5 },
  ]);
  await transitionOrder({ orderId: order.id, to: 'confirmed' });
  await recordOrderPayment({
    orderId: order.id,
    accountId: opts.accountId ?? providerAccount,
    amountCents: 2000,
    description: 'Stripe tahsilatı',
    meta: opts.providerRef === null ? null : { providerRef: opts.providerRef ?? `pi_${stamp}_${order.id.slice(0, 8)}` },
  });
  return order.id;
}

describe('sıra: önce sağlayıcı, sonra hareket', () => {
  it('iade sağlayıcıya GİDER ve hareket ondan sonra yazılır', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_ok' });
    const refunder = fakeRefunder({ status: 'ok', refundId: 're_test_1' });

    const result = await cancelOrder(orderId, { refunder });

    expect(result).toMatchObject({ status: 'ok', refundedAmountCents: 2000 });
    expect(refunder.calls).toHaveLength(1);
    // Tutar CENT gider: sağlayıcı euro bilmez, yuvarlama burada bir kez yapılır.
    expect(refunder.calls[0]).toMatchObject({ paymentIntentId: 'pi_test_ok', amountCents: 2000 });

    // Hareketin künyesi iadeyi sağlayıcıdaki kaydına bağlar — mutabakat bunun üstünde durur.
    const movements = await money.listByOrder(orderId);
    const refund = movements.find((m) => m.type === 'order_refund');
    expect(refund?.meta).toMatchObject({ providerRef: 'pi_test_ok', refundId: 're_test_1' });
  });

  it('sağlayıcı DÜŞERSE hareket HİÇ yazılmaz — defter yalan söylemez', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_fail' });

    const result = await cancelOrder(orderId, { refunder: fakeRefunder({ status: 'failed', error: 'card_declined' }) });

    // İptal geçerli (mal serbest kaldı), iade yazılmadı ve sebebi SÖYLENİYOR.
    expect(result).toMatchObject({ status: 'ok', refundedAmountCents: 0, refundBlocked: 'provider_failed' });

    const movements = await money.listByOrder(orderId);
    expect(movements.filter((m) => m.type === 'order_refund')).toHaveLength(0);
    // Sipariş hâlâ "para bizde" diyor: borç açıkta, kimse iadeyi yapılmış sanmıyor.
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(0);
  });

  it('anahtar yoksa iade yazılmaz — "sağlayıcı tanımlı değil" ile "iade edildi" karıştırılmaz', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_unavailable' });

    const result = await cancelOrder(orderId, { refunder: fakeRefunder({ status: 'unavailable' }) });

    expect(result).toMatchObject({ refundedAmountCents: 0, refundBlocked: 'provider_unavailable' });
    expect(await money.listByOrder(orderId).then((m) => m.filter((x) => x.type === 'order_refund'))).toHaveLength(0);
  });

  it('ödeme künyesi yoksa TAHMİN EDİLMEZ — yanlış niyete iade başkasının parasını gönderirdi', async () => {
    const orderId = await paidOrder({ providerRef: null });
    const refunder = fakeRefunder({ status: 'ok', refundId: 're_never' });

    const result = await cancelOrder(orderId, { refunder });

    expect(result).toMatchObject({ refundedAmountCents: 0, refundBlocked: 'provider_ref_missing' });
    expect(refunder.calls).toHaveLength(0);
  });
});

describe('sağlayıcı çağrısı hesabın TÜRÜNE bağlı', () => {
  it('kasadan iadede sağlayıcıya gidilmez — operatör nakit vermeyi seçmiştir', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_cash' });
    const refunder = fakeRefunder({ status: 'ok', refundId: 're_never' });

    const result = await cancelOrder(orderId, { refundAccountId: cashAccount, refunder });

    expect(result).toMatchObject({ status: 'ok', refundedAmountCents: 2000 });
    expect(refunder.calls).toHaveLength(0);
  });

  it('kapıda nakit tahsil edilmiş siparişte de sağlayıcı yolu açılmaz', async () => {
    const orderId = await paidOrder({ accountId: cashAccount, providerRef: null });
    const refunder = fakeRefunder({ status: 'ok', refundId: 're_never' });

    const result = await cancelOrder(orderId, { refunder });

    expect(result).toMatchObject({ status: 'ok', refundedAmountCents: 2000 });
    expect(refunder.calls).toHaveLength(0);
  });
});

/**
 * **Mutabakat** (`charge.refunded`): sağlayıcıdaki iade toplamı ile defterdeki toplam eşitlenir.
 * İki yol aynı olayı doğurur ve ikisi de doğru işlenmeli — biz başlattıysak yazılacak bir şey
 * yoktur (yoksa iade iki kez düşerdi), panelden elle yapıldıysa fark deftere düşmelidir.
 */
describe('charge.refunded mutabakatı', () => {
  const refundEvent = (paymentIntentId: string, amountRefundedCents: number, suffix: string) => ({
    id: `evt_${stamp}_${suffix}`,
    type: 'charge.refunded',
    orderId: null,
    paymentIntentId,
    amountTotalCents: 2000,
    amountRefundedCents,
  });

  it('panelden yapılan iade DEFTERE düşer — sipariş "ödendi" görünmeye devam etmez', async () => {
    const orderId = await paidOrder({ providerRef: `pi_panel_${stamp}` });

    // Sipariş kimliği olayda YOK: bulunması bizim sakladığımız künyeye bağlı.
    const outcome = await handleStripeEvent(refundEvent(`pi_panel_${stamp}`, 2000, 'panel'), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'refunded' });
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(2000);
  });

  it('kendi başlattığımız iadede İKİNCİ kez yazılmaz — toplam zaten eşit', async () => {
    const orderId = await paidOrder({ providerRef: `pi_own_${stamp}` });
    await cancelOrder(orderId, { refunder: fakeRefunder({ status: 'ok', refundId: 're_own' }) });

    const outcome = await handleStripeEvent(refundEvent(`pi_own_${stamp}`, 2000, 'own'), providerAccount);

    expect(outcome).toMatchObject({ status: 'ok', action: 'ignored' });
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(2000);
  });

  it('kısmi iadede yalnız FARK yazılır', async () => {
    const orderId = await paidOrder({ providerRef: `pi_part_${stamp}` });
    await cancelOrder(orderId, { refundAmountCents: 500, refunder: fakeRefunder({ status: 'ok', refundId: 're_part' }) });

    // Sağlayıcıda toplam 12 € iade görünüyor: 5 € bizim, 7 € panelden eklenmiş.
    await handleStripeEvent(refundEvent(`pi_part_${stamp}`, 1200, 'part'), providerAccount);

    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(1200);
  });
});

/**
 * Sağlayıcı düştüğünde düzeltme/iptal ZATEN yazılmıştır ve geri alınmaz: `cancelOrder` ikinci kez
 * koşamaz (sipariş artık iptal), `adjustFulfillment` koşarsa adetleri ikinci kez uygular. O yüzden
 * yalnız para ayağını tekrar deneyen ayrı bir kapı var — yoksa ekrandaki "tekrar deneyin" cümlesinin
 * karşılığı olmazdı.
 */
describe('yeniden deneme', () => {
  it('iade tek başına yeniden denenir ve İKİNCİSİNDE yazılır', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_retry' });
    await cancelOrder(orderId, { refunder: fakeRefunder({ status: 'failed', error: 'network' }) });

    const retried = await retryRefund(orderId, { refunder: fakeRefunder({ status: 'ok', refundId: 're_retry' }) });

    expect(retried).toMatchObject({ status: 'ok', refundedAmountCents: 2000 });
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(2000);
  });

  it('aynı iade tekrar denendiğinde AYNI anahtar gider — para iki kez çıkmaz', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_idem' });
    const failing = fakeRefunder({ status: 'failed', error: 'network' });

    await cancelOrder(orderId, { refunder: failing });
    // İkinci deneme: ilk çağrı düştüğü için hareket yazılmadı, sıra numarası değişmedi.
    await retryRefund(orderId, { refunder: failing });

    expect(failing.calls).toHaveLength(2);
    expect(failing.calls[0]?.idempotencyKey).toBe(failing.calls[1]?.idempotencyKey);
    // Anahtar siparişe ve tutara bağlı: başka bir siparişin iadesiyle karışmaz.
    expect(failing.calls[0]?.idempotencyKey).toContain(orderId);
  });

  it('borç kalmadıysa ikinci kez iade YAZILMAZ — tekrar basmak parayı iki kez döndürmez', async () => {
    const orderId = await paidOrder({ providerRef: 'pi_test_twice' });
    await cancelOrder(orderId, { refunder: fakeRefunder({ status: 'ok', refundId: 're_first' }) });

    const again = fakeRefunder({ status: 'ok', refundId: 're_second' });
    const retried = await retryRefund(orderId, { refunder: again });

    // Borç türetimden geliyor ve kapandı: sağlayıcıya hiç gidilmez.
    expect(retried).toMatchObject({ status: 'ok', refundedAmountCents: 0 });
    expect(again.calls).toHaveLength(0);
    expect((await orders.getById(orderId))?.amountRefundedCents).toBe(2000);
  });
});
