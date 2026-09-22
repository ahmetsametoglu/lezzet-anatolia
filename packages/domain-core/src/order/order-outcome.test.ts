import { describe, expect, it } from 'vitest';
import { confirmationPhaseOf, confirmationToneOf, isRefundedCancellation, orderOutcomeOf, paymentStateOf } from './order-outcome';

describe('sağlayıcının durumundan onay ekranının hâli', () => {
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

describe('iptalde "paranız iade edildi" cümlesi', () => {
  // Sebep değil damga okunur: kapıda ödemede iptal edilmiş siparişin sebebi de `out_of_stock` olabilir ama para hiç çekilmedi.
  it('iptal + iade damgası → iade edildi, damga yoksa iade yok', () => {
    expect(isRefundedCancellation({ cancelled: true, refundedAt: '2026-08-08T09:30:54.000Z' })).toBe(true);
    expect(isRefundedCancellation({ cancelled: true, refundedAt: null })).toBe(false);
  });

  it('iptal edilmemiş sipariş hiç sorgulanmaz', () => {
    expect(isRefundedCancellation({ cancelled: false, refundedAt: '2026-08-08T09:30:54.000Z' })).toBe(false);
  });
});

describe('onay ekranının sipariş hâli', () => {
  it('kart ödemesi yalnız online ödemeli taslakta beklenir', () => {
    expect(orderOutcomeOf({ status: 'draft', paymentMethod: 'online' })).toEqual({ placed: false, cancelled: false, awaitingCard: true });
    expect(orderOutcomeOf({ status: 'draft', paymentMethod: 'cash' }).awaitingCard).toBe(false);
  });

  it('kesinleşmiş ya da iptal edilmiş sipariş kart beklemez', () => {
    expect(orderOutcomeOf({ status: 'confirmed', paymentMethod: 'online' })).toEqual({ placed: true, cancelled: false, awaitingCard: false });
    expect(orderOutcomeOf({ status: 'cancelled', paymentMethod: 'online' })).toEqual({ placed: false, cancelled: true, awaitingCard: false });
  });
});

describe('onay ekranının söylediği hâl', () => {
  const taslak = { placed: false, cancelled: false, awaitingCard: true, refunded: false };

  it('kart taslağında sağlayıcının cevabı: alındı onay, işleniyor bekleme, tamamlanmadı ret', () => {
    expect(confirmationPhaseOf({ ...taslak, paymentState: 'paid' })).toBe('paid');
    expect(confirmationPhaseOf({ ...taslak, paymentState: 'processing' })).toBe('processing');
    expect(confirmationPhaseOf({ ...taslak, paymentState: 'incomplete' })).toBe('failed');
    expect(confirmationPhaseOf({ ...taslak, paymentState: null })).toBe('pending');
  });

  it('iptalde iade damgası cümleyi seçer; kart beklemeyen taslak "tamamlanmadı"', () => {
    expect(confirmationPhaseOf({ ...taslak, awaitingCard: false, cancelled: true, refunded: true, paymentState: null })).toBe('refunded');
    expect(confirmationPhaseOf({ ...taslak, awaitingCard: false, cancelled: true, paymentState: 'paid' })).toBe('failed');
    expect(confirmationPhaseOf({ ...taslak, awaitingCard: false, paymentState: null })).toBe('incomplete');
  });

  it('ton: iade de ret sayılır, alınmış ödeme kesinleşmeden onay rengindedir', () => {
    expect(confirmationToneOf('refunded')).toBe('failed');
    expect(confirmationToneOf('paid')).toBe('ok');
    expect(confirmationToneOf('processing')).toBe('waiting');
    expect(confirmationToneOf('incomplete')).toBe('waiting');
  });
});
