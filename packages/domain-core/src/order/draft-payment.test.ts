import { describe, expect, it } from 'vitest';
import { decideDraftPayment, isClosedPayment } from './draft-payment';

describe('decideDraftPayment', () => {
  it('para alındıysa pencere kapanmış olsa da onaylanır', () => {
    expect(decideDraftPayment({ status: 'completed', windowOpen: true })).toBe('confirm');
    expect(decideDraftPayment({ status: 'completed', windowOpen: false })).toBe('confirm');
  });

  it('banka işliyorsa ya da para ayrılmışsa pencere kapansa da iptal edilmez', () => {
    expect(decideDraftPayment({ status: 'processing', windowOpen: false })).toBe('wait');
    expect(decideDraftPayment({ status: 'authorised', windowOpen: false })).toBe('wait');
  });

  it('müşteri ödemeyi bitirmediyse pencere açıkken beklenir, kapanınca iptal edilir', () => {
    expect(decideDraftPayment({ status: 'pending', windowOpen: true })).toBe('wait');
    expect(decideDraftPayment({ status: 'pending', windowOpen: false })).toBe('cancel');
  });

  it('sağlayıcıda iptal edilmiş ya da süresi dolmuş ödeme taslağı kapatır', () => {
    expect(decideDraftPayment({ status: 'cancelled', windowOpen: true })).toBe('cancel');
    expect(decideDraftPayment({ status: 'failed', windowOpen: true })).toBe('cancel');
  });
});

describe('isClosedPayment', () => {
  it('yalnız iptal edilmiş ve süresi dolmuş ödeme kapalıdır; bekleyen ödemenin iptali sağlayıcıya gönderilir', () => {
    expect(isClosedPayment('cancelled')).toBe(true);
    expect(isClosedPayment('failed')).toBe(true);
    expect(isClosedPayment('pending')).toBe(false);
    expect(isClosedPayment('authorised')).toBe(false);
  });
});
