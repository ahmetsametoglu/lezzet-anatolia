import { describe, expect, it } from 'vitest';
import { checkDoorCode, doorCodeApplies, doorCodeVia } from './door-code';

/*
  Bu testler şu hatalarda kırmızıya döner: kargo ya da gel-al siparişine kod üretilir, kapsam dışı kanala kod gider, WhatsApp'ı olan
  müşteriye kod e-postayla gider, hak dolduktan sonra doğru tahmin kabul edilir ya da kalan hak yanlış sayılır.
*/

describe('doorCodeApplies', () => {
  const scope = { b2b: true, b2c: false };

  it('yalnız rota teslimi ve kapsamdaki kanal kod alır', () => {
    expect(doorCodeApplies({ channel: 'b2b', deliveryType: 'route' }, scope)).toBe(true);
    expect(doorCodeApplies({ channel: 'b2c', deliveryType: 'route' }, scope)).toBe(false);
  });

  it('kargo ve gel-al kapsamda olsa da kod almaz', () => {
    expect(doorCodeApplies({ channel: 'b2b', deliveryType: 'shipping' }, scope)).toBe(false);
    expect(doorCodeApplies({ channel: 'b2b', deliveryType: 'pickup' }, scope)).toBe(false);
  });
});

describe('doorCodeVia', () => {
  it('doğrulanmış WhatsApp varsa kod oradan gider, e-posta olsa da', () => {
    expect(doorCodeVia({ whatsapp: true, email: true })).toBe('whatsapp');
  });

  it('WhatsApp yoksa e-posta; ikisi de yoksa kod gönderilemez', () => {
    expect(doorCodeVia({ whatsapp: false, email: true })).toBe('email');
    expect(doorCodeVia({ whatsapp: false, email: false })).toBeNull();
  });
});

describe('checkDoorCode', () => {
  const base = { issued: '482913', failedAttempts: 0, maxAttempts: 5 };

  it('kod üretilmemiş siparişte girilen kod yok sayılır', () => {
    expect(checkDoorCode({ ...base, issued: null, given: '482913' })).toEqual({ kind: 'none' });
  });

  it('doğru kod doğrulanır, boş kod kodsuz teslimdir', () => {
    expect(checkDoorCode({ ...base, given: ' 482913 ' })).toEqual({ kind: 'verified' });
    expect(checkDoorCode({ ...base, given: null })).toEqual({ kind: 'skipped' });
  });

  it('yanlış kod kalan hakkı bu deneme düşülmüş olarak söyler', () => {
    expect(checkDoorCode({ ...base, given: '000000' })).toEqual({ kind: 'mismatch', attemptsLeft: 4 });
    expect(checkDoorCode({ ...base, failedAttempts: 4, given: '000000' })).toEqual({ kind: 'mismatch', attemptsLeft: 0 });
  });

  it('hak dolunca doğru kod da kabul edilmez, kodsuz teslim açık kalır', () => {
    expect(checkDoorCode({ ...base, failedAttempts: 5, given: '482913' })).toEqual({ kind: 'locked' });
    expect(checkDoorCode({ ...base, failedAttempts: 5, given: null })).toEqual({ kind: 'skipped' });
  });
});
