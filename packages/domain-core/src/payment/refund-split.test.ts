import { describe, expect, it } from 'vitest';
import type { AccountType, PaymentMethod } from '@lezzet/types';
import { planRefund, refundSourcesOf } from './refund-split';

const TYPES = new Map<string, AccountType>([
  ['revolut', 'provider'],
  ['kasa', 'cash'],
  ['banka', 'bank'],
]);

let clock = 0;
const at = () => `2026-10-07T10:00:${String(clock++).padStart(2, '0')}Z`;
const payment = (accountId: string, amountCents: number, method: PaymentMethod, providerRef: string | null = null) => ({
  accountId,
  type: 'order_payment' as const,
  amountCents,
  paymentMethod: method,
  meta: providerRef ? { providerRef } : null,
  createdAt: at(),
});
const refund = (accountId: string, amountCents: number, providerRef: string | null = null) => ({
  accountId,
  type: 'order_refund' as const,
  amountCents,
  paymentMethod: null,
  meta: providerRef ? { providerRef } : null,
  createdAt: at(),
});
const plan = (
  movements: Parameters<typeof refundSourcesOf>[0],
  dueCents: number,
  route: { accountId: string; accountType: AccountType } | null = null,
) => planRefund({ dueCents, sources: refundSourcesOf(movements, TYPES), route });
const legsOf = (result: ReturnType<typeof planRefund>) =>
  result.legs.map(({ accountId, providerRef, method, amountCents }) => ({ accountId, providerRef, method, amountCents }));

describe('iadenin bölünmesi', () => {
  it('iade en son ödemeden geriye doğru dağılır: kartla kapora, kapıda nakit; kısmi iade nakitten çıkar, kapora yerinde kalır', () => {
    const movements = [payment('revolut', 500, 'online', 'rv_kapora'), payment('kasa', 2500, 'cash')];

    const result = plan(movements, 1000);

    expect(legsOf(result)).toEqual([{ accountId: 'kasa', providerRef: null, method: 'cash', amountCents: 1000 }]);
    expect(result.uncoveredCents).toBe(0);
  });

  it('tam iptalde her kaynak yalnız tuttuğu kadar verir; kart parası kart ödemesinin üzerinden döner', () => {
    const movements = [payment('revolut', 500, 'online', 'rv_kapora'), payment('kasa', 2500, 'cash')];

    expect(legsOf(plan(movements, 3000))).toEqual([
      { accountId: 'kasa', providerRef: null, method: 'cash', amountCents: 2500 },
      { accountId: 'revolut', providerRef: 'rv_kapora', method: 'online', amountCents: 500 },
    ]);
  });

  it('aynı sağlayıcı hesabına iki kart ödemesi: her biri kendi künyesinden ve kendi tutarından fazla olmadan iade edilir', () => {
    const movements = [payment('revolut', 500, 'online', 'rv_kapora'), payment('revolut', 2500, 'card', 'rv_kapi')];

    expect(legsOf(plan(movements, 3000))).toEqual([
      { accountId: 'revolut', providerRef: 'rv_kapi', method: 'card', amountCents: 2500 },
      { accountId: 'revolut', providerRef: 'rv_kapora', method: 'online', amountCents: 500 },
    ]);
  });

  it('önceki iade kaynağından düşer: künyeli iade kendi kart ödemesinden, künyesiz iade hesabın en yeni parasından', () => {
    const movements = [
      payment('revolut', 500, 'online', 'rv_kapora'),
      payment('revolut', 2500, 'card', 'rv_kapi'),
      payment('kasa', 1000, 'cash'),
      refund('revolut', 2000, 'rv_kapi'),
      refund('kasa', 400),
    ];

    expect(legsOf(plan(movements, 1600))).toEqual([
      { accountId: 'kasa', providerRef: null, method: 'cash', amountCents: 600 },
      { accountId: 'revolut', providerRef: 'rv_kapi', method: 'card', amountCents: 500 },
      { accountId: 'revolut', providerRef: 'rv_kapora', method: 'online', amountCents: 500 },
    ]);
  });

  it('parası hiç girmemiş hesaptan yapılmış iade kart ödemesini azaltmaz; kalan borç yine karta döner', () => {
    // Kartla alınıp operatörün seçimiyle kasadan nakit verilmiş 5 €: kalan 15 €'luk borç kart ödemesinden döner.
    const movements = [payment('revolut', 2000, 'online', 'rv_tek'), refund('kasa', 500)];

    expect(legsOf(plan(movements, 1500))).toEqual([{ accountId: 'revolut', providerRef: 'rv_tek', method: 'online', amountCents: 1500 }]);
  });

  it('kaynaklar yetmezse fazlası uydurulmaz, karşılanamayan kalan açık kalır', () => {
    const result = plan([payment('revolut', 500, 'online', 'rv_kapora')], 800);

    expect(legsOf(result)).toEqual([{ accountId: 'revolut', providerRef: 'rv_kapora', method: 'online', amountCents: 500 }]);
    expect(result.uncoveredCents).toBe(300);
  });
});

describe('operatörün seçtiği yol', () => {
  const movements = [
    payment('revolut', 500, 'online', 'rv_kapora'),
    payment('revolut', 2500, 'card', 'rv_kapi'),
    payment('kasa', 1000, 'cash'),
  ];

  it('nakit ya da havale yolunda tamamı o hesaptan çıkar; kartla alınmış parayı nakit vermek meşrudur', () => {
    expect(legsOf(plan(movements, 4000, { accountId: 'banka', accountType: 'bank' }))).toEqual([
      { accountId: 'banka', providerRef: null, method: 'bank_transfer', amountCents: 4000 },
    ]);
  });

  it('kart yolunda iade yalnız o hesabın kart ödemelerine, yine en sondan geriye dağılır', () => {
    expect(legsOf(plan(movements, 2800, { accountId: 'revolut', accountType: 'provider' }))).toEqual([
      { accountId: 'revolut', providerRef: 'rv_kapi', method: 'card', amountCents: 2500 },
      { accountId: 'revolut', providerRef: 'rv_kapora', method: 'online', amountCents: 300 },
    ]);
  });
});
