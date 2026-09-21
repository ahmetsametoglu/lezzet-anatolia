import { describe, expect, it } from 'vitest';
import { isValidPriceRule, priceIn, resolvePrice, type ResolvePriceInput } from './resolve-price';
import { vatBaseOf } from './vat-base';

// DOMAIN §5'teki her dal. Fiyatlar cent; b2c satırları TTC, b2b satırları HT (kanal tabanı).
const LIST = [
  { channel: 'b2c' as const, amountCents: 1690 }, // 16,90 € TTC
  { channel: 'b2b' as const, amountCents: 1200 }, // 12,00 € HT
];

function input(over: Partial<ResolvePriceInput> = {}): ResolvePriceInput {
  return { channel: 'b2c', b2bApproved: true, channelPrices: LIST, ...over };
}

describe('resolvePrice — kanal ve onay', () => {
  it('ziyaretçi/B2C müşteri kanal fiyatını TTC tabanında alır', () => {
    const r = resolvePrice(input());
    expect(r).toMatchObject({ sellable: true, unitPriceCents: 1690, source: 'channel', effectiveChannel: 'b2c', vatBase: 'ttc' });
  });

  it('onaylı şirket B2B fiyatını HT tabanında alır', () => {
    const r = resolvePrice(input({ channel: 'b2b' }));
    expect(r).toMatchObject({ sellable: true, unitPriceCents: 1200, effectiveChannel: 'b2b', vatBase: 'ht' });
  });

  it('ONAYSIZ şirket B2C fiyatına düşer — toptan liste doğrulanmamış kayda açılmaz (DOMAIN §10)', () => {
    const r = resolvePrice(input({ channel: 'b2b', b2bApproved: false }));
    expect(r).toMatchObject({ sellable: true, unitPriceCents: 1690, effectiveChannel: 'b2c', vatBase: 'ttc' });
  });

  it('kanalda fiyat yoksa satışa kapalıdır', () => {
    const r = resolvePrice(input({ channel: 'b2b', channelPrices: [{ channel: 'b2c', amountCents: 1690 }] }));
    expect(r).toEqual({ sellable: false, reason: 'no_price_in_channel' });
  });
});

describe('resolvePrice — müşteriye özel fiyat', () => {
  it('özel fiyat kanal fiyatını ezer', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1050 }));
    expect(r).toMatchObject({ sellable: true, unitPriceCents: 1050, source: 'customer', quantityCap: null });
  });

  it('özel fiyat listeden pahalıysa liste geçerlidir — özel fiyat müşteriyi kötü duruma düşüremez', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1350 }));
    expect(r).toMatchObject({ unitPriceCents: 1200, source: 'channel', strikeCents: null });
  });

  it('özel fiyat listeye eşitse liste kalır — kalem indirimden çıkarılmaz', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1200 }));
    expect(r).toMatchObject({ unitPriceCents: 1200, source: 'channel' });
  });

  it('kazanan özel fiyatın üstü çizili fiyatı listedir', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1050 }));
    expect(r).toMatchObject({ unitPriceCents: 1050, strikeCents: 1200 });
  });

  it('onaysız şirkette özel fiyat da B2C tabanında değerlendirilir', () => {
    // Çağıran, geçerli kanalın özel fiyatını verir; onaysızsa b2c fiyatı çözülür.
    const r = resolvePrice(input({ channel: 'b2b', b2bApproved: false, customerPriceCents: null }));
    expect(r).toMatchObject({ effectiveChannel: 'b2c', unitPriceCents: 1690 });
  });
});

describe('resolvePrice — fiyat grubu (B2B alt kademesi, 20.08)', () => {
  it('gruplu B2B müşteri listeden yüzde düşülmüş fiyatı alır', () => {
    const r = resolvePrice(input({ channel: 'b2b', groupPercentOff: 5 }));
    expect(r).toMatchObject({ unitPriceCents: 1140, source: 'group', effectiveChannel: 'b2b' }); // 12,00 − %5
  });

  it('müşteriye özel fiyat grubu ezer — istisna kademeden üstündür', () => {
    const r = resolvePrice(input({ channel: 'b2b', groupPercentOff: 5, customerPriceCents: 1100 }));
    expect(r).toMatchObject({ unitPriceCents: 1100, source: 'customer' });
  });

  it('ONAYSIZ şirkette grup uygulanmaz — B2C ile birlikte toptan kademe de kapanır', () => {
    const r = resolvePrice(input({ channel: 'b2b', b2bApproved: false, groupPercentOff: 5 }));
    expect(r).toMatchObject({ unitPriceCents: 1690, source: 'channel', effectiveChannel: 'b2c' });
  });

  it('B2C kanalında grup yüzdesi sessizce yok sayılır', () => {
    const r = resolvePrice(input({ groupPercentOff: 5 }));
    expect(r).toMatchObject({ unitPriceCents: 1690, source: 'channel' });
  });

  it('teklif grup fiyatından da düşükse kazanır — kıyas ödenen fiyattan', () => {
    const r = resolvePrice(input({ channel: 'b2b', groupPercentOff: 5, offer: { unitPriceCents: 990, remainingQty: 3, stockId: 's1' } }));
    expect(r).toMatchObject({ unitPriceCents: 990, source: 'offer', quantityCap: 3 });
  });
});

describe('resolvePrice — müşterinin genel fiyat kuralı', () => {
  it('liste tabanlı kural etkin kanalın listesinden yüzde düşer', () => {
    const r = resolvePrice(input({ customerRule: { basis: 'list', percent: 10 } }));
    expect(r).toMatchObject({ unitPriceCents: 1521, source: 'customer_rule', strikeCents: 1690 }); // 16,90 − %10
  });

  it('alış tabanlı kural B2B\'de maliyete yüzde ekler (HT)', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerRule: { basis: 'cost', percent: 15 }, costCents: 1000, vatRate: 5.5 }));
    expect(r).toMatchObject({ unitPriceCents: 1150, source: 'customer_rule', strikeCents: 1200 });
  });

  it('alış tabanlı kural B2C\'de KDV dahil tabana çevrilir', () => {
    const r = resolvePrice(input({ customerRule: { basis: 'cost', percent: 30 }, costCents: 1000, vatRate: 5.5 }));
    expect(r).toMatchObject({ unitPriceCents: 1372, source: 'customer_rule' }); // 13,00 HT × 1,055
  });

  it('kural fiyatı listeden pahalıysa liste geçerlidir', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerRule: { basis: 'cost', percent: 50 }, costCents: 1000 }));
    expect(r).toMatchObject({ unitPriceCents: 1200, source: 'channel', strikeCents: null });
  });

  it('maliyet bilinmiyorsa alış tabanlı kural uygulanmaz — fiyat uydurulmaz', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerRule: { basis: 'cost', percent: 10 }, costCents: null }));
    expect(r).toMatchObject({ unitPriceCents: 1200, source: 'channel' });
  });

  it('B2C\'de KDV oranı yoksa alış tabanlı kural uygulanmaz', () => {
    const r = resolvePrice(input({ customerRule: { basis: 'cost', percent: 10 }, costCents: 1000, vatRate: null }));
    expect(r).toMatchObject({ unitPriceCents: 1690, source: 'channel' });
  });

  it('grup kuraldan ucuzsa grup kazanır, üstü çizili fiyat yok', () => {
    const r = resolvePrice(input({ channel: 'b2b', groupPercentOff: 20, customerRule: { basis: 'list', percent: 10 } }));
    expect(r).toMatchObject({ unitPriceCents: 960, source: 'group', strikeCents: null });
  });

  it('kural gruptan ucuzsa kural kazanır, üstü çizili fiyat grup fiyatıdır', () => {
    const r = resolvePrice(input({ channel: 'b2b', groupPercentOff: 5, customerRule: { basis: 'list', percent: 10 } }));
    expect(r).toMatchObject({ unitPriceCents: 1080, source: 'customer_rule', strikeCents: 1140 });
  });

  it('ürün bazlı özel fiyat kuraldan ucuzsa o kazanır', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1000, customerRule: { basis: 'list', percent: 10 } }));
    expect(r).toMatchObject({ unitPriceCents: 1000, source: 'customer' });
  });

  it('kural ürün bazlı özel fiyattan ucuzsa kural kazanır — ucuz olan geçerlidir', () => {
    const r = resolvePrice(input({ channel: 'b2b', customerPriceCents: 1150, customerRule: { basis: 'list', percent: 10 } }));
    expect(r).toMatchObject({ unitPriceCents: 1080, source: 'customer_rule' });
  });

  it('teklif kural fiyatından ucuzsa teklif kazanır; üstü çizili fiyat kural fiyatıdır', () => {
    const offer = { unitPriceCents: 900, remainingQty: 2, stockId: 'b1' };
    const r = resolvePrice(input({ channel: 'b2b', customerRule: { basis: 'list', percent: 10 }, offer }));
    expect(r).toMatchObject({ unitPriceCents: 900, source: 'offer', strikeCents: 1080 });
  });
});

describe('isValidPriceRule — DB kısıtının aynısı', () => {
  it('listeden indirim uçları dışlar: %0 kural değil, %100 bedava', () => {
    expect(isValidPriceRule({ basis: 'list', percent: 0 })).toBe(false);
    expect(isValidPriceRule({ basis: 'list', percent: 100 })).toBe(false);
    expect(isValidPriceRule({ basis: 'list', percent: 12.5 })).toBe(true);
  });

  it('alış üzerine pay sıfır olabilir, eksi olamaz', () => {
    expect(isValidPriceRule({ basis: 'cost', percent: 0 })).toBe(true);
    expect(isValidPriceRule({ basis: 'cost', percent: -5 })).toBe(false);
    expect(isValidPriceRule({ basis: 'cost', percent: Number.NaN })).toBe(false);
  });
});

describe('resolvePrice — near-expiry teklif çakışması (düşük olan kazanır)', () => {
  const offer = { unitPriceCents: 1190, remainingQty: 4, stockId: 'batch-1' };

  it('teklif kanal fiyatından ucuzsa kazanır; tavan ve parti gelir', () => {
    const r = resolvePrice(input({ offer }));
    expect(r).toMatchObject({ unitPriceCents: 1190, source: 'offer', quantityCap: 4, stockId: 'batch-1' });
  });

  it('özel fiyat teklften ucuzsa özel fiyat kazanır; tavan YOK (normal rezervasyon)', () => {
    const r = resolvePrice(input({ customerPriceCents: 1100, offer }));
    expect(r).toMatchObject({ unitPriceCents: 1100, source: 'customer', quantityCap: null, stockId: null });
  });

  it('teklif özel fiyattan ucuzsa teklif kazanır — müşteri lehine', () => {
    const r = resolvePrice(input({ customerPriceCents: 1400, offer }));
    expect(r).toMatchObject({ unitPriceCents: 1190, source: 'offer', quantityCap: 4 });
  });

  it('eşitlikte teklif kazanmaz — aynı parayı ödeyen müşteri tavanla kısıtlanmaz', () => {
    const r = resolvePrice(input({ customerPriceCents: 1190, offer }));
    expect(r).toMatchObject({ unitPriceCents: 1190, source: 'customer', quantityCap: null });
  });

  it('kanalda fiyat yoksa teklif tek başına satış açmaz', () => {
    const r = resolvePrice(input({ channelPrices: [], offer }));
    expect(r).toEqual({ sellable: false, reason: 'no_price_in_channel' });
  });
});

describe('vatBaseOf / priceIn — taban çevrimi yalnız gösterim içindir', () => {
  it('kanal tabanları: b2c TTC, b2b HT', () => {
    expect(vatBaseOf('b2c')).toBe('ttc');
    expect(vatBaseOf('b2b')).toBe('ht');
  });

  it('B2C (TTC) fiyat HT istenince KDV ayrılır', () => {
    const r = resolvePrice(input());
    if (!r.sellable) throw new Error('satılabilir bekleniyordu');
    expect(priceIn(r, 'ttc', 5.5)).toBe(1690); // taban zaten TTC
    expect(priceIn(r, 'ht', 5.5)).toBe(1602); // 16,90 / 1,055 = 16,018…
  });

  it('B2B (HT) fiyat TTC istenince KDV eklenir', () => {
    const r = resolvePrice(input({ channel: 'b2b' }));
    if (!r.sellable) throw new Error('satılabilir bekleniyordu');
    expect(priceIn(r, 'ttc', 5.5)).toBe(1266); // 12,00 × 1,055
    expect(priceIn(r, 'ht', 5.5)).toBe(1200);
  });

  it('reverse charge (%0) HT tabanını değiştirmez', () => {
    const r = resolvePrice(input({ channel: 'b2b' }));
    if (!r.sellable) throw new Error('satılabilir bekleniyordu');
    expect(priceIn(r, 'ttc', 0)).toBe(1200);
  });
});
