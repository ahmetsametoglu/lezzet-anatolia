import { describe, expect, it } from 'vitest';
import { apportionShippingVat, meetsMinBasket, resolveShippingFee } from './shipping-fee';

const ESIK = 6000; // 60 € ücretsiz kargo eşiği
const UCRET = 790; // 7,90 €

describe('kargo ücreti (07.3)', () => {
  it('rota içi teslimat her zaman ücretsiz — sepet ne olursa olsun', () => {
    const r = resolveShippingFee({ deliveryType: 'route', basketCents: 500, freeThresholdCents: ESIK, feeCents: UCRET });
    expect(r).toEqual({ feeCents: 0, freeReason: 'route', remainingForFreeCents: 0, source: null });
  });

  it('kargoda eşik altı sipariş ücret öder', () => {
    const r = resolveShippingFee({ deliveryType: 'shipping', basketCents: 4000, freeThresholdCents: ESIK, feeCents: UCRET });
    expect(r.feeCents).toBe(UCRET);
    expect(r.freeReason).toBeNull();
    expect(r.remainingForFreeCents).toBe(2000); // "20 € daha ekleyin"
  });

  it('eşiğe tam ulaşan sipariş ücretsizdir (sınır dâhil)', () => {
    const r = resolveShippingFee({ deliveryType: 'shipping', basketCents: ESIK, freeThresholdCents: ESIK, feeCents: UCRET });
    expect(r).toMatchObject({ feeCents: 0, freeReason: 'threshold' });
  });
});

describe('asgari sepet', () => {
  it('eksik tutar bildirilir — arayüz "X € daha" der', () => {
    expect(meetsMinBasket(1500, 2500)).toEqual({ ok: false, missingCents: 1000 });
  });

  it('asgari yoksa (0) her sepet geçer', () => {
    expect(meetsMinBasket(1, 0)).toEqual({ ok: true, missingCents: 0 });
  });
});

describe('kargo ücretinin KDV\'si — taşıdığı malın oranını izler', () => {
  it('tek oranlı sepette ücret o orandan vergilenir', () => {
    const parcalar = apportionShippingVat(790, [{ totalCents: 4000, vatRate: 5.5 }]);
    expect(parcalar).toEqual([{ vatRate: 5.5, amountCents: 790, vatCents: 41 }]);
  });

  it('karışık sepette ücret kalem tutarlarına ORANSAL bölünür, her parça kendi oranından', () => {
    // 3.000 (%5,5) + 1.000 (%20) → ücretin 3/4'ü düşük orana, 1/4'ü yükseğe.
    const parcalar = apportionShippingVat(800, [
      { totalCents: 3000, vatRate: 5.5 },
      { totalCents: 1000, vatRate: 20 },
    ]);
    expect(parcalar).toEqual([
      { vatRate: 5.5, amountCents: 600, vatCents: 31 },
      { vatRate: 20, amountCents: 200, vatCents: 33 },
    ]);
  });

  it('kuruş kaybı olmaz: Σ parça = ücret', () => {
    const parcalar = apportionShippingVat(777, [
      { totalCents: 1000, vatRate: 5.5 },
      { totalCents: 1000, vatRate: 20 },
      { totalCents: 1000, vatRate: 10 },
    ]);
    expect(parcalar.reduce((sum, p) => sum + p.amountCents, 0)).toBe(777);
  });

  it('aynı orandaki kalemler birleşir — parça sayısı ORAN sayısıdır', () => {
    const parcalar = apportionShippingVat(600, [
      { totalCents: 1000, vatRate: 5.5 },
      { totalCents: 2000, vatRate: 5.5 },
      { totalCents: 1000, vatRate: 20 },
    ]);
    expect(parcalar).toHaveLength(2);
    expect(parcalar[0]).toMatchObject({ vatRate: 5.5, amountCents: 450 });
  });

  it('ücret yoksa ya da kalem yoksa parça üretilmez', () => {
    expect(apportionShippingVat(0, [{ totalCents: 1000, vatRate: 20 }])).toEqual([]);
    expect(apportionShippingVat(790, [])).toEqual([]);
  });
});

describe('canlı teklif — hibrit fiyat modeli (07.12)', () => {
  const taban = { deliveryType: 'shipping' as const, basketCents: 4000, freeThresholdCents: 10_000, feeCents: 1190 };

  it('teklif VARSA ücret ondan gelir ve kaynağı söylenir', () => {
    expect(resolveShippingFee({ ...taban, quotedFeeCents: 499 })).toMatchObject({ feeCents: 499, source: 'quote' });
  });

  it('teklif YOKSA sabit tarifeye düşer — ve DÜŞTÜĞÜNÜ söyler', () => {
    // Sessizce düşmek, müşteriye "canlı fiyat" diye hesaplanmamış bir sayı göstermek olurdu.
    expect(resolveShippingFee({ ...taban, quotedFeeCents: null })).toMatchObject({ feeCents: 1190, source: 'tariff' });
    expect(resolveShippingFee(taban)).toMatchObject({ feeCents: 1190, source: 'tariff' });
  });

  it('ÜCRETSİZ teklif (0) sabit tarifeye DÜŞMEZ — sıfır geçerli bir fiyattır', () => {
    // `0 || fallback` tuzağı: sıfır yanlışlıkla "yok" sayılırsa ücretsiz seçenek para keserdi.
    expect(resolveShippingFee({ ...taban, quotedFeeCents: 0 })).toMatchObject({ feeCents: 0, source: 'quote' });
  });

  it('⚠ EŞİK canlı fiyata BAKMAZ — teklif ne olursa olsun eşik üstü ücretsiz', () => {
    // Eşik bir pazarlama sözüdür ve maliyete bağlanamaz: "100 € üzeri ücretsiz" cümlesi bazı
    // adreslerde yalan olamaz.
    const sonuc = resolveShippingFee({ ...taban, basketCents: 12_000, quotedFeeCents: 2500 });
    expect(sonuc).toMatchObject({ feeCents: 0, freeReason: 'threshold', source: null });
  });

  it('ROTA teklifi hiç sormaz — kendi aracımızla giden malın tarifesi yok', () => {
    const sonuc = resolveShippingFee({ ...taban, deliveryType: 'route', quotedFeeCents: 2500 });
    expect(sonuc).toMatchObject({ feeCents: 0, freeReason: 'route', source: null });
  });
});
