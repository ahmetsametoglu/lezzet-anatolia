import { describe, expect, it } from 'vitest';
import { paymentStateOf } from './confirmation-types';

/**
 * **Onay ekranı ödemesi beklenen taslakta ne der** (07.18). Önce yalnız veritabanına bakıyordu ve ödeme
 * olayı gelmeyince süresiz "onaylanıyor" diyordu — kartı reddedilmiş müşteri de, parası alınmış müşteri
 * de aynı cümleyi okuyordu.
 */
describe('paymentStateOf', () => {
  it('para alındıysa "alındı", banka işliyorsa "işleniyor"', () => {
    expect(paymentStateOf('succeeded')).toBe('paid');
    expect(paymentStateOf('processing')).toBe('processing');
    expect(paymentStateOf('requires_capture')).toBe('processing');
  });

  it('tamamlanmamış ya da iptal edilmiş ödeme "tamamlanmadı" — müşteri beklemez, yeniden dener', () => {
    for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled'] as const) {
      expect(paymentStateOf(status)).toBe('incomplete');
    }
  });
});
