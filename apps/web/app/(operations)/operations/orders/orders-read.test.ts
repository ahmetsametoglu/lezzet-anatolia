import { describe, expect, it } from 'vitest';
import { toCountsView, toOrderRows } from './orders-read';
import type { Order, OrderItem, UserProfile } from '@lezzet/types';

// Satır kurulumunun sözü: kararı MOTOR verir, burası taşır. Testler o taşımanın sessizce
// bozulmadığını sabitliyor — özellikle vade ve izinli geçişler.

const NOW = new Date('2026-07-29T10:00:00Z');

const order = (patch: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    customerId: 'c1',
    channel: 'b2b',
    orderSource: 'web',
    isGiftOrder: false,
    status: 'confirmed',
    paymentStatus: 'pending',
    paymentMethod: null,
    onAccount: true,
    deliveryType: 'route',
    deliveryZoneId: null,
    deliveryDate: '2026-07-30',
    addressId: null,
    addressSnapshot: { city: 'Strasbourg', postalCode: '67000' },
    courierId: null,
    deliveryCountry: 'FR',
    vatNumberSnapshot: null,
    vatTreatment: 'domestic',
    referenceNo: 'LA-26-AAA111',
    invoiceNo: null,
    deliveryProof: null,
    shippingFee: 0,
    total: 100,
    discountId: null,
    discountAmount: 0,
    amountCollected: 0,
    amountRefunded: 0,
    cogsAmount: null,
    deliveryCost: null,
    paymentFee: null,
    packagingCost: null,
    createdAt: '2026-06-01T10:00:00Z',
    ...patch,
  }) as Order;

const item = (patch: Partial<OrderItem> = {}): OrderItem =>
  ({ id: 'i1', orderId: 'o1', variantId: 'v1', qty: 2, fulfilledQty: 2, stockId: null, bundleId: null, unitPrice: 10, lineDiscountAmount: 0, vatRate: 5.5, returnDisposition: null, ...patch }) as OrderItem;

const customer = (patch: Partial<UserProfile> = {}): UserProfile =>
  ({ id: 'c1', name: 'Café Marceau', phone: '+33612345678', companyInfo: null, paymentTermDays: null, ...patch }) as UserProfile;

const build = (orders: Order[], opts: { items?: OrderItem[]; customer?: UserProfile; termDays?: number } = {}) =>
  toOrderRows({
    orders,
    itemsByOrder: new Map([['o1', opts.items ?? [item()]]]),
    customers: new Map([['c1', opts.customer ?? customer()]]),
    courierNames: new Map([['k1', 'Ali']]),
    defaultTermDays: opts.termDays ?? 30,
    now: NOW,
  });

describe('sipariş satırı', () => {
  it('içerik sistemin bildiği gerçekten çıkar (kalem ve adet)', () => {
    const [row] = build([order()], { items: [item(), item({ id: 'i2', qty: 3 })] });
    expect(row?.itemCount).toBe(2);
    expect(row?.unitCount).toBe(5);
    expect(row?.hasBundle).toBe(false);
  });

  it('paketten gelen kalem işaretlenir', () => {
    const [row] = build([order()], { items: [item({ bundleId: 'b1' })] });
    expect(row?.hasBundle).toBe(true);
  });

  it('izinli geçişler MOTORDAN gelir — ekran kendi listesini kurmaz', () => {
    const [row] = build([order({ status: 'ready' })]);
    expect(row?.allowedNext).toEqual(['out_for_delivery', 'cancelled']);
  });

  it('kapanmış siparişin ilerleyeceği yer yoktur', () => {
    const [row] = build([order({ status: 'completed' })]);
    expect(row?.allowedNext).toEqual([]);
  });

  it('vade günü MÜŞTERİNİN süresinden hesaplanır, yoksa ayardan', () => {
    const [own] = build([order()], { customer: customer({ paymentTermDays: 15 }) });
    expect(own?.payment.dueDate).toBe('2026-06-16');
    const [fallback] = build([order()], { termDays: 45 });
    expect(fallback?.payment.dueDate).toBe('2026-07-16');
  });

  it('peşin siparişte vade günü YOKTUR — olmayan borç gösterilmez', () => {
    const [row] = build([order({ onAccount: false })]);
    expect(row?.payment.dueDate).toBeNull();
    expect(row?.payment.overdue).toBe(false);
  });

  it('ödenmemiş vadeli sipariş süresini aşmışsa gecikmiştir', () => {
    const [row] = build([order()]);
    expect(row?.payment.overdue).toBe(true);
    expect(row?.payment.openCents).toBe(10000);
  });

  it('adres kopyası eksikse semt UYDURULMAZ', () => {
    const [row] = build([order({ addressSnapshot: null })]);
    expect(row?.deliveryArea).toBe('');
  });

  it('müşteri künyesi şirket adından, yoksa telefondan gelir', () => {
    const [byPhone] = build([order()]);
    expect(byPhone?.customerHint).toBe('+33612345678');
    const [byCompany] = build([order()], { customer: customer({ companyInfo: { legalName: 'SARL Marceau' } as never }) });
    expect(byCompany?.customerHint).toBe('SARL Marceau');
  });
});

describe('sayaç görünümü', () => {
  it('kapıda tahsilat açık tutar formülünden çıkar', () => {
    const view = toCountsView({
      byStatus: new Map([['confirmed', 2]]),
      total: 5,
      sum: { total: 300, collected: 100, refunded: 0 },
      cod: { count: 2, total: 140, collected: 40, refunded: 10 },
    });
    expect(view.totalCents).toBe(30000);
    expect(view.codOpenCents).toBe(11000);
    expect(view.byStatus.confirmed).toBe(2);
  });
});
