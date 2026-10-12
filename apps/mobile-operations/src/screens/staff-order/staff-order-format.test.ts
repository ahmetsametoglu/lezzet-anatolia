import type { StaffCustomerOption, StaffDeliveryContext, StaffPaymentOptions } from '@lezzet/types';

import { money } from '@/lib/operations/money';
import { staffOrderCopy as t } from './copy';
import {
  dayChipLabelOf,
  footerReasonOf,
  lineIssueOf,
  orderRequestOf,
  paymentRowsOf,
  subtotalBasisOf,
  type FooterState,
  type OrderLine,
} from './staff-order-format';

/*
  Personel sipariş girişinin ekran kararları. Her biri ekranda düzgün görünüp yanlış iş yapabilecek türden: çıkarılan kalemin siparişe
  gitmesi, pazarlıksız kaleme fiyat yazılması, kapalı yöntemin sebepsiz kalması ve düğmenin bayat ödeme kararıyla açılması.
*/

const line = (patch: Partial<OrderLine> = {}): OrderLine => ({
  variantId: 'v1',
  title: 'Şöbiyet · 1 kg',
  imageUrl: null,
  qty: 2,
  listPriceCents: 2980,
  unitPriceCents: 2980,
  costCents: null,
  targetMarginPercent: null,
  vatRate: 5.5,
  availableQty: 12,
  shippable: true,
  ...patch,
});

const customer = (patch: Partial<StaffCustomerOption> = {}): StaffCustomerOption => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Restaurant Oberjaegerhof',
  phone: null,
  email: null,
  type: 'company',
  channel: 'b2b',
  isDraft: false,
  siret: null,
  b2bPending: false,
  credit: { termDays: 30, limitCents: 150_000, remainingCents: 124_000, overdue: false },
  ...patch,
});

const payment = (patch: Partial<StaffPaymentOptions> = {}): StaffPaymentOptions => ({
  methods: ['cash', 'card', 'bank_transfer'],
  codBlockedReason: null,
  codMaxCents: 30_000,
  creditAvailable: true,
  creditBlockedReason: null,
  ...patch,
});

const context = (patch: Partial<StaffDeliveryContext['delivery']> = {}): StaffDeliveryContext => ({
  delivery: {
    deliveryType: 'route',
    availableDates: ['2026-10-15', '2026-10-20'],
    warehouseId: '22222222-2222-4222-8222-222222222222',
    warehouseName: 'Strasbourg Merkez',
    unresolvedReason: null,
    ...patch,
  },
  payment: payment(),
});

describe('gönderilecek istek', () => {
  it('sıfıra inen kalem gitmez, fiyat yalnız pazarlık edilen kalemde gider', () => {
    const istek = orderRequestOf({
      customerId: 'c',
      addressId: 'a',
      deliveryType: 'route',
      deliveryDate: '2026-10-15',
      lines: [line(), line({ variantId: 'v2', qty: 0 }), line({ variantId: 'v3', unitPriceCents: 2500 })],
      payment: 'cash',
      idempotencyKey: 'k',
    });
    expect(istek.lines).toEqual([
      { variantId: 'v1', qty: 2 },
      { variantId: 'v3', qty: 2, unitPriceCents: 2500 },
    ]);
  });

  it('vadeli havale yöntemiyle vadeli bayrağını birlikte taşır; kargoda gün gönderilmez', () => {
    const istek = orderRequestOf({
      customerId: 'c',
      addressId: 'a',
      deliveryType: 'shipping',
      deliveryDate: '2026-10-15',
      lines: [line()],
      payment: 'credit',
      idempotencyKey: 'k',
    });
    expect(istek).toMatchObject({ paymentMethod: 'bank_transfer', onAccount: true, deliveryDate: null });
  });
});

describe('ödeme satırları', () => {
  it('kapalı yöntem gizlenmez, sebebi kendi satırında yazar', () => {
    const satirlar = paymentRowsOf({
      payment: payment({ methods: [], codBlockedReason: 'over_limit', creditAvailable: false, creditBlockedReason: 'limit_exceeded' }),
      customer: customer({ credit: { termDays: 30, limitCents: 150_000, remainingCents: 4000, overdue: false } }),
      totalCents: 40_600,
      hasLines: true,
      linesOk: true,
    });
    const tavan = `${money(30_000)} üstüne kapalı (ayardaki tavan)`;
    expect(satirlar.map((s) => [s.key, s.enabled, s.sub])).toEqual([
      ['cash', false, tavan],
      ['card', false, tavan],
      ['credit', false, `limit doldu: kalan ${money(4000)}, sipariş ~${money(40_600)}`],
    ]);
  });

  it('onay bekleyen kayıtta vade onaydan sonra açılır der; kargoda kapıda ödeme yok der', () => {
    const satirlar = paymentRowsOf({
      payment: payment({ methods: [], codBlockedReason: 'shipping', creditAvailable: false, creditBlockedReason: 'not_enabled' }),
      customer: customer({ b2bPending: true, channel: 'b2c', credit: null }),
      totalCents: 9000,
      hasLines: true,
      linesOk: true,
    });
    expect(satirlar.map((s) => s.sub)).toEqual([
      'kargoda kapıda ödeme yok',
      'kargoda kapıda ödeme yok',
      'B2B onayından ve vade izninden sonra açılır',
    ]);
  });
});

describe('alttaki düğmenin cümlesi', () => {
  const durum = (patch: Partial<FooterState> = {}): FooterState => {
    const base: Omit<FooterState, 'paymentRows'> = {
      customer: customer(),
      addressId: 'a',
      context: context(),
      contextFresh: true,
      deliveryDate: '2026-10-15',
      lines: [line()],
      payment: 'credit',
      ...patch,
    };
    const rows = paymentRowsOf({
      payment: base.context?.payment ?? null,
      customer: base.customer,
      totalCents: 5960,
      hasLines: true,
      linesOk: true,
    });
    return { ...base, paymentRows: patch.paymentRows ?? rows };
  };

  it('ilk eksiği sırasıyla söyler: gün, sonra kalem, sonra stok', () => {
    expect(footerReasonOf(durum({ deliveryDate: null, lines: [] })).text).toBe('Teslim gününü seçin — gün kendiliğinden seçilmez');
    expect(footerReasonOf(durum({ lines: [line({ qty: 0 })] })).text).toBe('Ürün ekleyin');
    expect(footerReasonOf(durum({ lines: [line({ qty: 3, availableQty: 2 })] })).text).toBe('Şöbiyet · 1 kg için depoda 2 adet var');
  });

  it('ödeme kararı son kalemlerle okunmadıysa düğme açılmaz', () => {
    expect(footerReasonOf(durum({ contextFresh: false }))).toEqual({ text: 'Ödeme seçenekleri okunuyor…', ready: false });
    expect(footerReasonOf(durum()).ready).toBe(true);
  });

  it('kargo adresinde soğuk zincir kalemi düğmeyi kilitler', () => {
    const kargo = durum({ context: context({ deliveryType: 'shipping', availableDates: [] }), lines: [line({ shippable: false })] });
    expect(footerReasonOf(kargo)).toEqual({ text: 'Şöbiyet · 1 kg kargoya çıkmaz', ready: false });
  });
});

describe('kalem sorunu', () => {
  it('bilinmeyen kalan sorun sayılmaz; sıfır kalan tükendi demektir', () => {
    expect(lineIssueOf(line({ availableQty: null, qty: 50 }), false)).toBeNull();
    expect(lineIssueOf(line({ availableQty: 0 }), false)).toEqual({ kind: 'sold_out' });
  });
});

describe('gün düğmesi', () => {
  it('gün adı saat diliminden kaymaz', () => {
    expect(dayChipLabelOf('2026-10-15')).toBe('Per 15 Eki');
    expect(dayChipLabelOf('2026-10-20')).toBe('Sal 20 Eki');
  });
});

describe('ara toplamın tabanı', () => {
  it('kanaldan okunur: onay bekleyen şirketin perakende fiyatı KDV dahildir, B2B fiyatı vergisizdir', () => {
    expect(subtotalBasisOf(customer())).toBe(t.page.basis.b2b);
    expect(subtotalBasisOf(customer({ channel: 'b2c', b2bPending: true, credit: null }))).toBe(t.page.basis.b2c);
  });
});
