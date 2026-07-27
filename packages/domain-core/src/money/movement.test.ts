import { describe, expect, it } from 'vitest';
import { expectedDirection, signedAmountFor, validateMovement } from './movement';

/**
 * Para hareketi kuralları (12.1). Test edilen şey **anlam**: veri bozukluğunu DB engelliyor,
 * burada "yanlış ama geçerli görünen" hareket yakalanıyor.
 */
const KASA = '11111111-1111-1111-1111-111111111111';
const BANKA = '22222222-2222-2222-2222-222222222222';
const SIPARIS = '33333333-3333-3333-3333-333333333333';

describe('tipten yön türetimi', () => {
  it('satış parayı içeri, gider dışarı alır', () => {
    expect(expectedDirection('order_payment')).toBe('in');
    expect(expectedDirection('capital')).toBe('in');
    expect(expectedDirection('order_refund')).toBe('out');
    expect(expectedDirection('purchase')).toBe('out');
    expect(expectedDirection('expense')).toBe('out');
  });

  it('transfer ve sair SERBEST: yön sebepten türemez', () => {
    // Transfer iki hesabı birden ilgilendirir (yön gönderenin gözünden), `misc` zaten
    // "sınıflandırılamayan" demektir — ikisine de yön dayatmak yanlış reddetme üretirdi.
    expect(expectedDirection('transfer')).toBeNull();
    expect(expectedDirection('misc')).toBeNull();
  });
});

describe('hareket doğrulama', () => {
  const gecerli = { accountId: KASA, direction: 'in' as const, amount: 50, type: 'order_payment' as const, orderId: SIPARIS };

  it('tutarlı hareket geçer', () => {
    expect(validateMovement(gecerli)).toEqual({ valid: true });
  });

  it('sıfır ve negatif tutar reddedilir — yön ayrı alandır, işaret tutara gömülmez', () => {
    expect(validateMovement({ ...gecerli, amount: 0 })).toMatchObject({ reason: 'amount_not_positive' });
    expect(validateMovement({ ...gecerli, amount: -50 })).toMatchObject({ reason: 'amount_not_positive' });
  });

  it('tipin dayattığı yöne uymayan hareket reddedilir', () => {
    // "Tahsilat" diyip parayı dışarı çıkarmak: DB için geçerli, rapor için yalan.
    expect(validateMovement({ ...gecerli, direction: 'out' })).toMatchObject({ reason: 'direction_mismatch' });
    expect(validateMovement({ accountId: KASA, direction: 'in', amount: 20, type: 'expense' })).toMatchObject({
      reason: 'direction_mismatch',
    });
  });

  it('sipariş parası siparişsiz olmaz — cache bu bağdan türetilir', () => {
    expect(validateMovement({ ...gecerli, orderId: null })).toMatchObject({ reason: 'order_link_missing' });
    expect(validateMovement({ accountId: KASA, direction: 'out', amount: 10, type: 'order_refund' })).toMatchObject({
      reason: 'order_link_missing',
    });
  });

  it('stok alımı bir mal kabule YA DA tedarikçiye bağlanır', () => {
    const alim = { accountId: KASA, direction: 'out' as const, amount: 300, type: 'purchase' as const };
    expect(validateMovement(alim)).toMatchObject({ reason: 'supply_link_missing' });
    expect(validateMovement({ ...alim, supplierId: BANKA })).toEqual({ valid: true });
    expect(validateMovement({ ...alim, stockIntakeId: SIPARIS })).toEqual({ valid: true });
  });

  it('serbest tipler bağ istemez', () => {
    expect(validateMovement({ accountId: KASA, direction: 'in', amount: 5, type: 'misc' })).toEqual({ valid: true });
    expect(validateMovement({ accountId: KASA, direction: 'out', amount: 900, type: 'expense', category: 'kira' } as never)).toEqual({
      valid: true,
    });
  });
});

describe('transfer', () => {
  const transfer = { accountId: KASA, direction: 'out' as const, amount: 500, type: 'transfer' as const, counterAccountId: BANKA };

  it('karşı ucu olmayan transfer reddedilir — yarım transfer bakiyeyi sessizce kaydırır', () => {
    expect(validateMovement({ ...transfer, counterAccountId: null })).toMatchObject({ reason: 'transfer_needs_counter' });
  });

  it('kendine transfer reddedilir', () => {
    expect(validateMovement({ ...transfer, counterAccountId: KASA })).toMatchObject({ reason: 'transfer_same_account' });
  });

  it('transfer olmayan harekette karşı hesap anlamsızdır', () => {
    expect(validateMovement({ accountId: KASA, direction: 'in', amount: 50, type: 'order_payment', orderId: SIPARIS, counterAccountId: BANKA })).toMatchObject({
      reason: 'counter_on_non_transfer',
    });
  });

  it('iki hesaba SİMETRİK yansır: gönderenden çıkan, alana girer', () => {
    expect(signedAmountFor(transfer, KASA)).toBe(-500);
    expect(signedAmountFor(transfer, BANKA)).toBe(500);
    // Toplamı sıfır: transfer serveti değiştirmez, yerini değiştirir.
    expect(signedAmountFor(transfer, KASA) + signedAmountFor(transfer, BANKA)).toBe(0);
  });

  it('dokunmadığı hesabı etkilemez', () => {
    expect(signedAmountFor(transfer, SIPARIS)).toBe(0);
  });

  it('normal harekette işaret yönden gelir', () => {
    expect(signedAmountFor({ accountId: KASA, direction: 'in', amount: 40 }, KASA)).toBe(40);
    expect(signedAmountFor({ accountId: KASA, direction: 'out', amount: 40 }, KASA)).toBe(-40);
  });
});
