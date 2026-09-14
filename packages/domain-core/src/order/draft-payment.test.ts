import { describe, expect, it } from 'vitest';
import { decideDraftPayment } from './draft-payment';

describe('decideDraftPayment', () => {
  it('para alındıysa pencere kapanmış olsa da onaylanır', () => {
    expect(decideDraftPayment({ status: 'succeeded', windowOpen: true })).toBe('confirm');
    expect(decideDraftPayment({ status: 'succeeded', windowOpen: false })).toBe('confirm');
  });

  it('banka işliyorsa ya da para ayrılmışsa pencere kapansa da iptal edilmez', () => {
    expect(decideDraftPayment({ status: 'processing', windowOpen: false })).toBe('wait');
    expect(decideDraftPayment({ status: 'requires_capture', windowOpen: false })).toBe('wait');
  });

  it('müşteri ödemeyi bitirmediyse pencere açıkken beklenir, kapanınca iptal edilir', () => {
    for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action'] as const) {
      expect(decideDraftPayment({ status, windowOpen: true })).toBe('wait');
      expect(decideDraftPayment({ status, windowOpen: false })).toBe('cancel');
    }
  });

  it('sağlayıcıda iptal edilmiş ödeme taslağı kapatır', () => {
    expect(decideDraftPayment({ status: 'canceled', windowOpen: true })).toBe('cancel');
  });
});
