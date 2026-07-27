import { describe, expect, it } from 'vitest';
import { applyBestDiscount, type DiscountRule, type DiscountableLine } from './apply-discount';

const TATLI = 'cat-tatli';
const line = (over: Partial<DiscountableLine> = {}): DiscountableLine => ({
  variantId: 'v1',
  qty: 1,
  unitPriceCents: 1000,
  categoryId: TATLI,
  ...over,
});

const kupon = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: 'd1',
  trigger: 'coupon',
  code: 'BAYRAM15',
  type: 'percent',
  value: 15,
  scope: 'cart',
  ...over,
});

describe('tek-en-büyük kuralı', () => {
  it('iki uygun indirimden büyüğü seçilir, toplanmaz', () => {
    const r = applyBestDiscount(
      [line({ unitPriceCents: 2000 })],
      [kupon({ id: 'kucuk', value: 10 }), kupon({ id: 'buyuk', value: 25 })],
      { enteredCouponCode: 'BAYRAM15' },
    );
    expect(r).toMatchObject({ discountId: 'buyuk', amountCents: 500 }); // %25 × 2000, %10 eklenmez
  });

  it('müşterinin genel oranı da havuzdadır — kupondan büyükse o kazanır', () => {
    const r = applyBestDiscount([line({ unitPriceCents: 10_000 })], [kupon({ value: 5 })], {
      customerDiscountPercent: 12,
      enteredCouponCode: 'BAYRAM15',
    });
    expect(r).toMatchObject({ kind: 'customer_rate', discountId: null, amountCents: 1200 });
  });

  it('kupon müşteri oranından büyükse kupon kazanır — müşteri oranı KALKAR', () => {
    const r = applyBestDiscount([line({ unitPriceCents: 10_000 })], [kupon({ value: 20 })], {
      customerDiscountPercent: 12,
      enteredCouponCode: 'BAYRAM15',
    });
    expect(r).toMatchObject({ kind: 'coupon', amountCents: 2000 });
  });
});

describe('koşullar', () => {
  it('kupon yalnız kodu girilirse uygulanır', () => {
    expect(applyBestDiscount([line()], [kupon()], {})).toBeNull();
    expect(applyBestDiscount([line()], [kupon()], { enteredCouponCode: 'bayram15' })).toMatchObject({ kind: 'coupon' });
  });

  it('otomatik kampanya kod istemez', () => {
    const r = applyBestDiscount([line()], [kupon({ trigger: 'automatic', code: null })], {});
    expect(r).toMatchObject({ kind: 'automatic' });
  });

  it('asgari sepet ve ilk-sipariş koşulları', () => {
    const rule = kupon({ trigger: 'automatic', code: null, minBasketCents: 5000, firstOrderOnly: true });
    expect(applyBestDiscount([line({ unitPriceCents: 3000 })], [rule], { isFirstOrder: true })).toBeNull();
    expect(applyBestDiscount([line({ unitPriceCents: 9000 })], [rule], { isFirstOrder: false })).toBeNull();
    expect(applyBestDiscount([line({ unitPriceCents: 9000 })], [rule], { isFirstOrder: true })).not.toBeNull();
  });

  it('tarih penceresi dışında uygulanmaz', () => {
    const now = new Date('2026-07-27T12:00:00Z');
    const gecmis = kupon({ trigger: 'automatic', code: null, validTo: '2026-07-01T00:00:00Z' });
    const gelecek = kupon({ trigger: 'automatic', code: null, validFrom: '2026-08-01T00:00:00Z' });
    expect(applyBestDiscount([line()], [gecmis], { now })).toBeNull();
    expect(applyBestDiscount([line()], [gelecek], { now })).toBeNull();
  });

  it('kullanım sınırları (toplam ve müşteri başına)', () => {
    const dolu = kupon({ maxUses: 10, usedCount: 10 });
    const musteriDolu = kupon({ perCustomerLimit: 1, usedByCustomerCount: 1 });
    expect(applyBestDiscount([line()], [dolu], { enteredCouponCode: 'BAYRAM15' })).toBeNull();
    expect(applyBestDiscount([line()], [musteriDolu], { enteredCouponCode: 'BAYRAM15' })).toBeNull();
  });

  it('kişisel kupon başkasına geçmez', () => {
    const kisisel = kupon({ customerId: 'c1' });
    expect(applyBestDiscount([line()], [kisisel], { enteredCouponCode: 'BAYRAM15', customerId: 'c2' })).toBeNull();
    expect(applyBestDiscount([line()], [kisisel], { enteredCouponCode: 'BAYRAM15', customerId: 'c1' })).not.toBeNull();
  });

  it('pasif kural değerlendirilmez', () => {
    expect(applyBestDiscount([line()], [kupon({ isActive: false })], { enteredCouponCode: 'BAYRAM15' })).toBeNull();
  });
});

describe('kapsam', () => {
  it('kategori kapsamı yalnız o kategorinin kalemlerine iner', () => {
    const lines = [line({ unitPriceCents: 4000 }), line({ variantId: 'v2', categoryId: 'cat-borek', unitPriceCents: 6000 })];
    const rule = kupon({ trigger: 'automatic', code: null, scope: 'category', categoryId: TATLI, value: 10 });
    const r = applyBestDiscount(lines, [rule], {});
    expect(r?.amountCents).toBe(400); // yalnız 4000 üzerinden
    expect(r?.lineShares).toEqual([400, 0]);
  });

  it('koleksiyon kapsamı üyelikten süzer', () => {
    const lines = [line({ collectionIds: ['col-bayram'] }), line({ variantId: 'v2', collectionIds: [] })];
    const rule = kupon({ trigger: 'automatic', code: null, scope: 'collection', collectionId: 'col-bayram', value: 50 });
    expect(applyBestDiscount(lines, [rule], {})?.amountCents).toBe(500);
  });

  it('kapsamda hiç kalem yoksa indirim yok', () => {
    const rule = kupon({ trigger: 'automatic', code: null, scope: 'category', categoryId: 'yok' });
    expect(applyBestDiscount([line()], [rule], {})).toBeNull();
  });
});

describe('muafiyetler ve dağıtım', () => {
  it('paket kalemi ve teklif satırı indirime girmez — ne matrahta ne payda', () => {
    const lines = [
      line({ unitPriceCents: 5000 }),
      line({ variantId: 'paket', unitPriceCents: 9000, bundleId: 'b1' }),
      line({ variantId: 'teklif', unitPriceCents: 3000, offerStockId: 's1' }),
    ];
    const r = applyBestDiscount(lines, [kupon({ trigger: 'automatic', code: null, value: 10 })], {});
    expect(r?.amountCents).toBe(500); // yalnız 5000 matrah
    expect(r?.lineShares).toEqual([500, 0, 0]);
  });

  it('yalnız muaf kalemlerden oluşan sepette indirim yok', () => {
    const lines = [line({ bundleId: 'b1' }), line({ variantId: 'v2', offerStockId: 's1' })];
    expect(applyBestDiscount(lines, [kupon({ trigger: 'automatic', code: null })], {})).toBeNull();
  });

  it('dağıtım oransaldır ve toplamı indirime EŞİTTİR', () => {
    const lines = [line({ unitPriceCents: 1690 }), line({ variantId: 'v2', unitPriceCents: 800 }), line({ variantId: 'v3', unitPriceCents: 510 })];
    const r = applyBestDiscount(lines, [kupon({ trigger: 'automatic', code: null, value: 15 })], {});
    expect(r!.lineShares.reduce((a, b) => a + b, 0)).toBe(r!.amountCents);
  });

  it('sabit tutarlı indirim sepetten büyük olamaz', () => {
    const r = applyBestDiscount([line({ unitPriceCents: 500 })], [kupon({ trigger: 'automatic', code: null, type: 'fixed', value: 5000 })], {});
    expect(r?.amountCents).toBe(500);
  });
});
