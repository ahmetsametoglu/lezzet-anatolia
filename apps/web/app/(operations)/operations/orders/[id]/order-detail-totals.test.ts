import { describe, expect, it } from 'vitest';
import { derivePaymentStatus, fulfilledLineAmountCents } from '@lezzet/domain-core';
import type { Order, VatTreatment } from '@lezzet/types';
import { totalsOf } from './order-detail-read';
import type { OrderLineView } from './order-detail-types';

/**
 * Sipariş detayının TOPLAM BLOĞU — saf dönüşüm (DB'siz), `orders-read.test.ts` emsali.
 *
 * ── NEDEN "İÇİNDEKİ KDV" SATIRININ AYRI TESTİ VAR (denetim 26.08) ────────────
 * O satır motorun (`vatSplitOf`) elle yazılmış bir kopyasıydı ve kopyada motorun ÜÇÜNCÜ dalı
 * eksikti: `zeroRated`. Reverse charge siparişinde (VIES ile doğrulanmış vergi numaralı Alman
 * B2B alıcısı) KDV yasal olarak sıfırdır — müşteri kendi ülkesinde beyan eder — ama ekran
 * `addVat(...) − tutar` yazıyordu. Toplamı bozmuyordu (satır `note`), operatörün mutabakat
 * yaparken okuduğu sayı yanlıştı.
 *
 * Aynı karşılaştırma depoda üç ayrı yerde elle yazılıydı; dördüncü okuyan onu sormayı unuttu.
 * Kural artık motorda tek yerde (`isZeroRated`) ve iddialar aşağıda KURALDAN kuruluyor: "reverse
 * charge siparişinde ekranda vergi görünmez", "b2c'de tutarın içinden çıkar", "b2b'de üstüne
 * eklenir" — bugünkü kodun ne yaptığı değil, ne yapması gerektiği.
 */

const line = (over: Partial<OrderLineView> = {}): OrderLineView => {
  const base = {
    id: 'l1',
    title: 'Mantı · 500 g',
    sub: '500 g',
    imageUrl: null,
    productSlug: null,
    productName: 'Mantı',
    qty: 2,
    fulfilledQty: 2,
    unitPriceCents: 1000,
    lineDiscountCents: 0,
    vatRate: 5.5,
    lineTotalCents: 2000,
    bundleId: null,
    returnDisposition: null,
    defaultsToDiscard: false,
    batchNos: [],
    ...over,
  };
  // Ödenecek MOTORDAN — fikstürde elle yazılsaydı test motoru değil kendi kopyasını doğrulardı.
  return {
    ...base,
    payableCents:
      over.payableCents ??
      fulfilledLineAmountCents({
        fulfilledQty: base.fulfilledQty,
        orderedQty: base.qty,
        unitPriceCents: base.unitPriceCents,
        lineDiscountCents: base.lineDiscountCents,
      }),
  };
};

const order = (over: Partial<Order> = {}): Order =>
  ({
    channel: 'b2c',
    vatTreatment: 'domestic' as VatTreatment,
    shippingFeeCents: 0,
    discountAmountCents: 0,
    discountLabel: null,
    amountRefundedCents: 0,
    orderedTotalCents: 2000,
    ...over,
  }) as Order;

/** Bloktan tek satırı çeker — iddia satırın ADIYLA kurulur, sırasıyla değil. */
const satir = (rows: ReturnType<typeof totalsOf>, label: string) => rows.find((r) => r.label === label);

/**
 * "Ödenecek" tutarı MOTORDAN alınır, testte elle yazılmaz.
 *
 * Bloğun iddiası zaten "motorla aynı sayıyı söylüyorum"dur; beklenen değeri elle yazsaydık test
 * motoru değil kendi kopyasını doğrulardı ve motor değiştiği gün ikisi sessizce ayrışırdı.
 */
function karsilanan(o: Order, lines: OrderLineView[], settled: boolean): number {
  return derivePaymentStatus({
    lines: lines.map((l) => ({
      fulfilledQty: l.fulfilledQty,
      orderedQty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineDiscountCents: l.lineDiscountCents,
    })),
    collectedCents: 0,
    refundedCents: 0,
    shippingFeeCents: o.shippingFeeCents,
    fulfillmentSettled: settled,
    orderTotalCents: o.orderedTotalCents,
  }).fulfilledAmountCents;
}

/** Bloğu motorun cevabıyla birlikte kurar — üretimdeki çağrının aynısı. */
const blok = (o: Order, lines: OrderLineView[], settled: boolean) =>
  totalsOf(o, lines, settled, karsilanan(o, lines, settled));

describe('İçindeki KDV — karar motorun', () => {
  it('reverse charge siparişinde vergi SIFIRDIR — olmayan vergi ekranda yazılmaz', () => {
    const rows = blok(order({ channel: 'b2b', vatTreatment: 'intra_eu_b2b_reverse_charge' as VatTreatment }), [line()], true);

    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(0);
  });

  it('b2c: fiyat KDV DAHİL — vergi tutarın içinden çıkar', () => {
    const rows = blok(order({ channel: 'b2c' }), [line({ lineTotalCents: 2000, vatRate: 5.5 })], true);

    // 20,00 € TTC · %5,5 → HT 18,96 → içindeki KDV 1,04.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(104);
  });

  it('b2b: fiyat KDV HARİÇ — vergi tutarın üstüne eklenir', () => {
    const rows = blok(order({ channel: 'b2b', vatTreatment: 'domestic' as VatTreatment }), [line({ lineTotalCents: 2000, vatRate: 5.5 })], true);

    // 20,00 € HT · %5,5 → 1,10. b2c ile AYNI tutarda farklı sayı çıkması doğru: taban farklı.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(110);
  });

  it('KDV satırı bir DÜŞÜM değil bilgidir — ödenecek tutara dokunmaz', () => {
    const rows = blok(order({ orderedTotalCents: 2000 }), [line()], true);

    expect(satir(rows, 'İçindeki KDV')?.kind).toBe('note');
    expect(satir(rows, 'Ödenecek')?.amountCents).toBe(2000);
  });

  it('kalem oranları kalem kalem okunur — karışık sepette tek oran varsayılmaz', () => {
    const rows = blok(order({ channel: 'b2c', orderedTotalCents: 4000 }), [
      line({ id: 'a', lineTotalCents: 2000, vatRate: 5.5 }),
      line({ id: 'b', lineTotalCents: 2000, vatRate: 20 }),
    ], true);

    // 104 + 333: iki oranı ortalamak ya da birini ötekine uydurmak sessizce yanlış sayı verirdi.
    expect(satir(rows, 'İçindeki KDV')?.amountCents).toBe(104 + 333);
  });
});

describe('taban: hazırlık kesinleşti mi', () => {
  it('hazırlık KESİNLEŞMEDİYSE taban SİPARİŞ EDİLENDİR — 0 karşılanan "hiçbiri gitmedi" demek değildir', () => {
    const rows = blok(order(), [line({ qty: 2, fulfilledQty: 0 })], false);

    // Kalemler sipariş edilen adetten: 2 × 10,00. Aksi hâlde onaylanmış her sipariş "0,00 €
    // ödenecek" görünürdü.
    expect(satir(rows, 'Kalemler')?.amountCents).toBe(2000);
    expect(satir(rows, 'Ödenecek')?.amountCents).toBe(2000);
  });

  it('hazırlık kesinleştiyse taban GİDEN maldır', () => {
    const rows = blok(order(), [line({ qty: 2, fulfilledQty: 1 })], true);

    expect(satir(rows, 'Kalemler')?.amountCents).toBe(1000);
    expect(satir(rows, 'Ödenecek')).toMatchObject({ amountCents: 1000, kind: 'grand' });
  });

  it('ARA TOPLAM yalnız ardında bir şey varken yazılır', () => {
    const kargosuz = blok(order(), [line()], true);
    const kargolu = blok(order({ shippingFeeCents: 590, orderedTotalCents: 2590 }), [line()], true);

    // Kargosuzda ara toplam ile ödenecek aynı sayıdır; iki kez yazmak okuyana boş bir soru sordurur.
    expect(satir(kargosuz, 'Ara toplam')).toBeUndefined();
    expect(satir(kargolu, 'Ara toplam')?.amountCents).toBe(2000);
    expect(satir(kargolu, 'Ödenecek')?.amountCents).toBe(2590);
  });
});

/**
 * ── 01.09 · KULLANICI BİLDİRİMİ, GERÇEK SİPARİŞ (`LA-26-93UXKY`) ────────────────────────────────
 *
 * Üç arıza aynı ekranda birden görüldü ve üçü de bu bloktaydı. Rakamlar canlı kayıttan alındı;
 * uydurulmuş bir fikstür aynı hataları göstermezdi (indirim payı ve kısmi karşılama birlikte
 * bulunmalı ki kusur doğsun).
 */
describe('LA-26-93UXKY — blok kendi içinde toplanır', () => {
  const b2c = order({ channel: 'b2c', orderedTotalCents: 4639, discountAmountCents: 818, discountLabel: null });
  const kalemler = [
    line({ id: 'su', qty: 2, fulfilledQty: 1, unitPriceCents: 2247, lineDiscountCents: 675, lineTotalCents: 3819, vatRate: 5.5 }),
    line({ id: 'peynir', qty: 3, fulfilledQty: 3, unitPriceCents: 139, lineDiscountCents: 62, lineTotalCents: 355, vatRate: 5.5 }),
    line({ id: 'pogaca', qty: 6, fulfilledQty: 6, unitPriceCents: 91, lineDiscountCents: 81, lineTotalCents: 465, vatRate: 5.5 }),
  ];

  it('kalemler GİDEN malın liste tutarıdır', () => {
    const rows = blok(b2c, kalemler, true);

    // 1×22,47 + 3×1,39 + 6×0,91 = 32,10. Eskiden burada sipariş edilenin brütü (54,57) duruyordu.
    expect(satir(rows, 'Kalemler')?.amountCents).toBe(3210);
  });

  it('SEPET İNDİRİMİ gerçekten verilen indirimdir — gitmeyen malınki sayılmaz', () => {
    const rows = blok(b2c, kalemler, true);

    /*
      Ekran 8,18 € yazıyordu; onun 3,37 €'su hiç gitmemiş bir kutu böreğin indirimiydi. Gerçekten
      verilen 4,81 € — ve sistemin geri kalanı bunu ZATEN böyle biliyor: muhasebe kalemi
      (`lineAmountCents`) indirim payını karşılanan orana bölüyor. Blok tek başına ayrışıyordu.
    */
    expect(satir(rows, 'Sepet indirimi')).toMatchObject({ amountCents: 481, kind: 'deduction' });
  });

  it('blok kendi içinde TOPLANIR: kalemler − indirim = ödenecek', () => {
    const rows = blok(b2c, kalemler, true);
    const kalem = satir(rows, 'Kalemler')!.amountCents;
    const indirim = satir(rows, 'Sepet indirimi')!.amountCents;
    const odenecek = satir(rows, 'Ödenecek')!.amountCents;

    expect(kalem - indirim).toBe(odenecek);
    expect(odenecek).toBe(2729);
  });

  it('sipariş edileni anlatan satırlar bloktan KALKTI — o iş kalem tablosunun', () => {
    const rows = blok(b2c, kalemler, true);

    // SİP./KARŞIL. sütunları ve üstü çizili satır tutarı aynı gerçeği zaten söylüyor; blokta
    // tekrarlamak üçüncü bir anlatımdı ve indirim satırını yalancı yapan da oydu.
    expect(satir(rows, 'Sipariş toplamı')).toBeUndefined();
    expect(satir(rows, 'Karşılanmayan adet')).toBeUndefined();
  });

  it('içindeki KDV KARŞILANAN tutarın vergisidir — gitmeyen malın vergisi sayılmaz', () => {
    const eksikGiden = blok(b2c, kalemler, true);
    const tamamGiden = blok(b2c, kalemler.map((l) => ({ ...l, fulfilledQty: l.qty })), true);

    // Ölçüldü: ekran 2,42 € yazıyordu (46,39'un vergisi), doğrusu teslim edilenin vergisi.
    expect(satir(eksikGiden, 'İçindeki KDV')!.amountCents).toBeLessThan(satir(tamamGiden, 'İçindeki KDV')!.amountCents);
    // Kalem kalem: 19,09 → 1,00 · 3,55 → 0,19 · 4,65 → 0,24.
    expect(satir(eksikGiden, 'İçindeki KDV')?.amountCents).toBe(100 + 19 + 24);
  });
});
