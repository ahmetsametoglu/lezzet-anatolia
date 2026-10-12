import { describe, expect, it } from 'vitest';
import type { OrderItem, SalesInvoiceCandidate } from '@lezzet/types';
import {
  salesInvoiceDueOn,
  salesInvoiceGaps,
  salesInvoiceGroups,
  salesInvoiceOpensNow,
  salesInvoiceTotals,
  sirenOfVatNumber,
  tenDaySliceEnd,
} from './sales-invoice';
import type { SaleVatBasis } from './export';

/**
 * Satış faturasının saf kararları: ne zaman ve hangi satışlarla açılır, neden bekler, vadesi ve tutarı. Her biri faturada doğru
 * görünüp yanlış olabilecek türden; kesinleşen fatura değiştirilemediği için yanlışı sonradan düzeltmenin yolu alacak notudur.
 */

const SIRET = '73282932000074';

type Customer = Parameters<typeof salesInvoiceGaps>[0];
const customer = (over: Partial<Customer> = {}): Customer => ({
  country: 'FR',
  companyInfo: { legalName: 'Restaurant Oberjaegerhof', siret: SIRET },
  vatNumber: null,
  vatNumberValid: null,
  b2bApproved: true,
  ...over,
});

type Line = Pick<OrderItem, 'qty' | 'fulfilledQty' | 'goodwillQty' | 'unitPriceCents' | 'lineDiscountAmountCents' | 'vatRate'>;
const line = (over: Partial<Line> = {}): Line => ({
  qty: 1,
  fulfilledQty: 1,
  goodwillQty: 0,
  unitPriceCents: 1000,
  lineDiscountAmountCents: 0,
  vatRate: 5.5,
  ...over,
});
const B2B: SaleVatBasis = { pricesIncludeVat: false, vatTreatment: 'domestic', shippingFeeCents: 0 };

const sale = (over: Partial<SalesInvoiceCandidate> = {}): SalesInvoiceCandidate => ({
  orderId: crypto.randomUUID(),
  customerId: 'oberjaegerhof',
  business: 'qualite',
  saleDate: '2026-10-15',
  vatTreatment: 'domestic',
  invoiceMode: 'month_end',
  ...over,
});

describe('faturanın açılma anı', () => {
  it('teslim başına modda fatura teslimden hemen sonra açılır', () => {
    expect(salesInvoiceOpensNow(sale({ invoiceMode: 'per_delivery' }), { day: '2026-10-15', minutes: 9 * 60 })).toBe(true);
  });

  // Erken açılsaydı akşam teslimi ikinci faturaya kalırdı; ay geçince açılmasaydı ayın faturası hiç kesilmezdi.
  it("ay sonu modunda fatura ayın son günü 20.00'de ya da ay geçince açılır", () => {
    expect(salesInvoiceOpensNow(sale(), { day: '2026-10-30', minutes: 23 * 60 })).toBe(false);
    expect(salesInvoiceOpensNow(sale(), { day: '2026-10-31', minutes: 20 * 60 - 1 })).toBe(false);
    expect(salesInvoiceOpensNow(sale(), { day: '2026-10-31', minutes: 20 * 60 })).toBe(true);
    expect(salesInvoiceOpensNow(sale(), { day: '2026-11-01', minutes: 10 })).toBe(true);
  });
});

describe('aynı faturaya giren satışlar', () => {
  // Ayrılmasaydı iki işin satışı tek şablonla, ters yüklemeli satış yurt içi satışla aynı faturada kesilirdi.
  it('ay sonu modunda müşteri, iş, ay ve KDV rejimi aynı olan satışlar tek faturadır', () => {
    const first = sale({ saleDate: '2026-10-03' });
    const second = sale({ saleDate: '2026-10-28' });
    const otherBusiness = sale({ business: 'lezzet' });
    const otherMonth = sale({ saleDate: '2026-11-02' });
    const reverseCharge = sale({ vatTreatment: 'intra_eu_b2b_reverse_charge' });
    const otherCustomer = sale({ customerId: 'baeckerei-mueller' });
    const groups = salesInvoiceGroups([first, second, otherBusiness, otherMonth, reverseCharge, otherCustomer]);
    expect(groups).toEqual([[first, second], [otherBusiness], [otherMonth], [reverseCharge], [otherCustomer]]);
  });

  it('teslim başına modda her satış ayrı faturadır', () => {
    const first = sale({ invoiceMode: 'per_delivery' });
    const second = sale({ invoiceMode: 'per_delivery' });
    expect(salesInvoiceGroups([first, second])).toEqual([[first], [second]]);
  });
});

describe('kesmeyi bekleten eksikler', () => {
  // Eksik bilgiyle kesilen fatura alıcıya yönlenemez ve kesinleştiği için düzeltilemez.
  it('bilgisi tam Fransız şirketin eksiği yoktur', () => {
    expect(salesInvoiceGaps(customer(), true)).toEqual([]);
  });

  it('SIRET yoksa FR KDV numarasındaki SIREN yeter; ikisi de yoksa kimlik eksiktir', () => {
    const noSiret = customer({ companyInfo: { legalName: 'Restaurant Oberjaegerhof', siret: null } });
    expect(salesInvoiceGaps({ ...noSiret, vatNumber: 'FR40732829320' }, true)).toEqual([]);
    expect(salesInvoiceGaps(noSiret, true)).toEqual(['siren']);
    expect(sirenOfVatNumber('DE123456789')).toBeNull();
  });

  // SIREN istenseydi Alman şirketin faturası hiç kesilmezdi; AB'deki alıcı KDV numarasıyla yönlenir.
  it('Alman şirket SIREN ile değil geçerli KDV numarasıyla tanınır', () => {
    const german = customer({ country: 'DE', companyInfo: { legalName: 'Bäckerei Müller', siret: null }, vatNumber: 'DE123456789' });
    expect(salesInvoiceGaps({ ...german, vatNumberValid: true }, true)).toEqual([]);
    expect(salesInvoiceGaps({ ...german, vatNumberValid: false }, true)).toEqual(['siren']);
  });

  it('fatura adresi ve B2B onayı ayrı eksiklerdir', () => {
    expect(salesInvoiceGaps(customer({ b2bApproved: null }), false)).toEqual(['billing_address', 'b2b_approval']);
  });
});

describe('on günlük dilim ve vade', () => {
  it("dilimin son günü ayın 10'u, 20'si ya da son günüdür", () => {
    expect(tenDaySliceEnd('2026-10-10')).toBe('2026-10-10');
    expect(tenDaySliceEnd('2026-10-11')).toBe('2026-10-20');
    expect(tenDaySliceEnd('2026-10-20')).toBe('2026-10-20');
    expect(tenDaySliceEnd('2026-10-21')).toBe('2026-10-31');
    expect(tenDaySliceEnd('2028-02-25')).toBe('2028-02-29');
  });

  it('teslim başına faturada vade fatura günü artı müşterinin vadesidir', () => {
    expect(salesInvoiceDueOn({ issuedOn: '2026-10-05', termDays: 30, firstDeliveryOn: '2026-10-05' })).toBe('2026-11-04');
  });

  // Sınır uygulanmasaydı ay sonu faturasının vadesi bozulabilir gıdanın yasal üst sınırını geçerdi.
  it('ay sonu faturasında vade ilk teslimin diliminin bitiminden 30 günü geçmez', () => {
    expect(salesInvoiceDueOn({ issuedOn: '2026-10-31', termDays: 30, firstDeliveryOn: '2026-10-03' })).toBe('2026-11-09');
  });

  it('geç kesilen faturada vade fatura gününden önceye düşmez', () => {
    expect(salesInvoiceDueOn({ issuedOn: '2026-12-15', termDays: 30, firstDeliveryOn: '2026-10-03' })).toBe('2026-12-15');
  });
});

describe('fatura tutarı', () => {
  // Kırılım sipariş sipariş yazılsaydı aynı oran iki satır olurdu ve belge kısıtı faturayı reddederdi.
  it('birden çok siparişin kırılımı oran oran toplanır, tutar satırların toplamıdır', () => {
    const totals = salesInvoiceTotals([
      { sale: B2B, items: [line({ unitPriceCents: 1000 })] },
      { sale: B2B, items: [line({ unitPriceCents: 2000 }), line({ unitPriceCents: 500, vatRate: 20 })] },
    ]);
    expect(totals.vatLines).toEqual([
      { vatRate: 5.5, netCents: 3000, vatCents: 165 },
      { vatRate: 20, netCents: 500, vatCents: 100 },
    ]);
    expect(totals.amountCents).toBe(3765);
    expect(totals.vatRegime).toBe('standard');
  });

  it('teslim edilmeyen kalem faturaya girmez', () => {
    const totals = salesInvoiceTotals([{ sale: B2B, items: [line({ qty: 4, fulfilledQty: 2, unitPriceCents: 1000 })] }]);
    expect(totals.vatLines).toEqual([{ vatRate: 5.5, netCents: 2000, vatCents: 110 }]);
  });

  // Ters yüklemeli satış yurt içi satışla aynı faturaya girseydi tek rejim taşıyan fatura birinin KDV'sini yanlış yazardı.
  it('ters yüklemede KDV sıfırdır; ters yüklemeli ve yurt içi satış aynı faturaya giremez', () => {
    const reverse: SaleVatBasis = { ...B2B, vatTreatment: 'intra_eu_b2b_reverse_charge' };
    expect(salesInvoiceTotals([{ sale: reverse, items: [line()] }])).toEqual({
      amountCents: 1000,
      vatLines: [{ vatRate: 5.5, netCents: 1000, vatCents: 0 }],
      vatRegime: 'reverse_charge',
    });
    expect(() =>
      salesInvoiceTotals([
        { sale: reverse, items: [line()] },
        { sale: B2B, items: [line()] },
      ]),
    ).toThrow();
  });
});
