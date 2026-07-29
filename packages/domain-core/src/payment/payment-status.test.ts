import { describe, expect, it } from 'vitest';
import { derivePaymentStatus, type FulfilledLine, type PaymentDerivationInput } from './payment-status';

/** 2 adet × 10 € = 20 € — tamamı gitmiş kalem. */
const line = (over: Partial<FulfilledLine> = {}): FulfilledLine => ({
  fulfilledQty: 2,
  orderedQty: 2,
  unitPriceCents: 1000,
  ...over,
});

const input = (over: Partial<PaymentDerivationInput> = {}): PaymentDerivationInput => ({
  lines: [line()],
  collectedCents: 0,
  refundedCents: 0,
  ...over,
});

describe('karşılanan tutar (03.6)', () => {
  it('yalnız giden miktar sayılır — hazırlanamayan kalem borç yaratmaz', () => {
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1 })] }));
    expect(r.fulfilledAmountCents).toBe(1000); // 2 sipariş, 1 gitti
  });

  it('indirim payı karşılanan orana bölünür — yarısı gittiyse indirimin yarısı düşer', () => {
    // 2 × 10 € = 20 €, kaleme 4 € indirim payı düşmüş; 1 adet gitti → 10 € − 2 € = 8 €
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1, lineDiscountCents: 400 })] }));
    expect(r.fulfilledAmountCents).toBe(800);
  });

  it('iptal edilen siparişte karşılanan 0 — tahsil edilmişse tamamı iade borcu', () => {
    const r = derivePaymentStatus(input({ collectedCents: 2000, cancelled: true }));
    expect(r.fulfilledAmountCents).toBe(0);
    expect(r.refundDueCents).toBe(2000);
  });
});

describe('kargo ücreti kuralı (03.6)', () => {
  it('en az bir kalem gittiyse kargo hizmeti verilmiştir — karşılanana eklenir', () => {
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1 })], shippingFeeCents: 590 }));
    expect(r.fulfilledAmountCents).toBe(1590);
  });

  it('hiçbir kalem gitmediyse kargo da iade edilir', () => {
    const r = derivePaymentStatus(
      input({ lines: [line({ fulfilledQty: 0 })], shippingFeeCents: 590, collectedCents: 2590 }),
    );
    expect(r.fulfilledAmountCents).toBe(0);
    expect(r.refundDueCents).toBe(2590); // kargo dâhil
  });
});

describe('payment_status türetimi (03.6)', () => {
  it('hiç tahsilat yoksa pending', () => {
    expect(derivePaymentStatus(input()).status).toBe('pending');
    expect(derivePaymentStatus(input()).amountToCollectCents).toBe(2000);
  });

  it('tam tahsilat → paid', () => {
    expect(derivePaymentStatus(input({ collectedCents: 2000 })).status).toBe('paid');
  });

  it('partial PARA eksenidir: net, karşılanandan az', () => {
    const r = derivePaymentStatus(input({ collectedCents: 1200 }));
    expect(r.status).toBe('partial');
    expect(r.amountToCollectCents).toBe(800);
    expect(r.refundDueCents).toBe(0);
  });

  it('eksik karşılama tek başına partial YAPMAZ — para tamsa paid', () => {
    // 2 sipariş edildi, 1 gitti, müşteri o 1 adedin parasını ödedi → borç yok
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1 })], collectedCents: 1000 }));
    expect(r.status).toBe('paid');
    expect(r.refundDueCents).toBe(0);
  });

  it('fazla tahsilat yeni durum açmaz: paid kalır, fark refundDueCents olur', () => {
    // Peşin 20 € ödendi, 1 adet gitti → 10 € iade borcu
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1 })], collectedCents: 2000 }));
    expect(r.status).toBe('paid');
    expect(r.refundDueCents).toBe(1000);
  });

  it('para tamamen geri döndüyse refunded', () => {
    const r = derivePaymentStatus(input({ collectedCents: 2000, refundedCents: 2000, cancelled: true }));
    expect(r.status).toBe('refunded');
    expect(r.refundDueCents).toBe(0);
  });
});

describe('iade senaryoları (03.6)', () => {
  it('normal iade: kalem geri döner → fulfilled_qty düşer, para iadesi ile refunded', () => {
    // 2 adetin 1'i iade edildi ve parası geri verildi
    const r = derivePaymentStatus(
      input({ lines: [line({ fulfilledQty: 1 })], collectedCents: 2000, refundedCents: 1000 }),
    );
    expect(r.status).toBe('paid'); // net 10 € = karşılanan 10 €
    expect(r.refundDueCents).toBe(0);
  });

  it('jest iadesi (goodwill): mal müşteride kalır, miktar DÜŞMEZ ama net 0 → refunded', () => {
    const r = derivePaymentStatus(input({ collectedCents: 2000, refundedCents: 2000 }));
    expect(r.fulfilledAmountCents).toBe(2000); // ürün gitti, karşılanan duruyor
    expect(r.status).toBe('refunded'); // yine de para geri döndü
    expect(r.amountToCollectCents).toBe(2000); // muhasebe farkı görünür kalır
  });

  it('kısmi jest iadesi: net karşılananın altına iner → partial', () => {
    const r = derivePaymentStatus(input({ collectedCents: 2000, refundedCents: 500 }));
    expect(r.status).toBe('partial');
  });
});

/**
 * **Hazırlık kesinleşmeden beklenen tutar siparişin KENDİ toplamıdır** (29.07 müdahalesi).
 *
 * Gerçek olay: sepet indiriminin kalem payı yazılmayınca (`line_discount_amount = 0`) kalemlerden
 * toplanan tutar indirim kadar yüksek çıkıyordu. Sonuç: tamamı ödenmiş bir sipariş `partial`
 * görünüyor, müşteriye giden mail "kapıda 3,00 € ödenecek" diyordu — LA-26-99C7YN.
 *
 * Yazım yolu düzeltildi; buradaki testler **motorun o hataya artık BAĞIŞIK olduğunu** sabitler.
 * Aynı gerçeği iki yoldan hesaplamamak, birinin bozulmasına açık kapı bırakmamaktır.
 */
describe('hazırlık kesinleşmemişken beklenen tutar', () => {
  const unsettled = { fulfillmentSettled: false, lines: [line({ fulfilledQty: 0 })] };

  it('sipariş toplamı verilmişse o kullanılır — kalemler yeniden toplanmaz', () => {
    // Kalemler 20 € eder; siparişin anlaşılan toplamı 17 € (3 € indirim düşülmüş).
    const r = derivePaymentStatus(input({ ...unsettled, orderTotalCents: 1700, collectedCents: 1700 }));

    expect(r.fulfilledAmountCents).toBe(1700);
    expect(r.status).toBe('paid');
    expect(r.amountToCollectCents).toBe(0); // "kapıda ödenecek" YOK: müşteri tamamını ödedi
  });

  it('kalem payı yazılmamış olsa bile sonuç değişmez — hata sınıfı motora ulaşmıyor', () => {
    const bozuk = derivePaymentStatus(input({ ...unsettled, lines: [line({ fulfilledQty: 0, lineDiscountCents: 0 })], orderTotalCents: 1700, collectedCents: 1700 }));
    const dogru = derivePaymentStatus(input({ ...unsettled, lines: [line({ fulfilledQty: 0, lineDiscountCents: 300 })], orderTotalCents: 1700, collectedCents: 1700 }));

    expect(bozuk.status).toBe(dogru.status);
    expect(bozuk.amountToCollectCents).toBe(dogru.amountToCollectCents);
  });

  it('sipariş toplamı verilmezse eski davranış sürer — çağıran zorlanmaz', () => {
    const r = derivePaymentStatus(input({ ...unsettled }));
    expect(r.fulfilledAmountCents).toBe(2000); // sipariş edilen adetten
  });

  it('hazırlık KESİNLEŞTİĞİNDE ölçü yine kalemlerdir — eksik giden mal borç yaratmaz', () => {
    // Burada sipariş toplamı ARTIK cevap değil: yarısı gitmişse yarısı faturalanır.
    const r = derivePaymentStatus(input({ lines: [line({ fulfilledQty: 1 })], orderTotalCents: 1700 }));
    expect(r.fulfilledAmountCents).toBe(1000);
  });
});
