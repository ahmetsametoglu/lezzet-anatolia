import { describe, expect, it } from 'vitest';
import { suggestShortfallAction } from './shortfall';

/**
 * Eksik karşılamada öneri (10.3). Sınanan şey: **şüphede insana danışılıyor mu** ve tavsiyenin
 * içinden para sızmıyor mu.
 */
describe('eksik karşılama önerisi', () => {
  it('tam karşılanan kalemde soru yok', () => {
    const suggestion = suggestShortfallAction({ orderedQty: 5, pickedQty: 5, missingValueCents: 0 });

    expect(suggestion).toEqual({ action: 'send_rest', reason: 'complete', missingQty: 0 });
  });

  it('kalem HİÇ karşılanamadıysa oran hesabı yapılmadan müşteriye sorulur', () => {
    // Ucuz ve tek adetlik bile olsa: müşteri sipariş ettiği şeyi hiç almayacak.
    const suggestion = suggestShortfallAction({ orderedQty: 1, pickedQty: 0, missingValueCents: 200 });

    expect(suggestion).toMatchObject({ action: 'ask_customer', reason: 'line_fully_missing', missingQty: 1 });
  });

  it('kalemin yarısından fazlası eksikse müşteriye sorulur', () => {
    const suggestion = suggestShortfallAction({ orderedQty: 10, pickedQty: 4, missingValueCents: 500 });

    expect(suggestion).toMatchObject({ action: 'ask_customer', reason: 'large_share' });
  });

  it('oran küçük ama TUTAR yüksekse yine sorulur — iki ölçüt bağımsız', () => {
    // 10'da 1 eksik (%10) ama eksik 40 € değerinde: tek başına oran bunu kaçırırdı.
    const suggestion = suggestShortfallAction({ orderedQty: 10, pickedQty: 9, missingValueCents: 4_000 });

    expect(suggestion).toMatchObject({ action: 'ask_customer', reason: 'high_value' });
  });

  it('küçük eksikte müşteri bekletilmez, kalan gönderilir', () => {
    const suggestion = suggestShortfallAction({ orderedQty: 10, pickedQty: 9, missingValueCents: 300 });

    expect(suggestion).toMatchObject({ action: 'send_rest', reason: 'minor', missingQty: 1 });
  });

  it('eşikler parametrik — çağıran ayardan geçirir', () => {
    const strict = suggestShortfallAction({
      orderedQty: 10,
      pickedQty: 9,
      missingValueCents: 300,
      thresholds: { ratio: 0.05, valueCents: 100 },
    });

    expect(strict.action).toBe('ask_customer');
  });

  it('öneri TUTAR TAŞIMAZ — depo ekranı parayı görmemeli', () => {
    const suggestion = suggestShortfallAction({ orderedQty: 4, pickedQty: 1, missingValueCents: 9_999 });

    expect(Object.keys(suggestion).sort()).toEqual(['action', 'missingQty', 'reason']);
    expect(JSON.stringify(suggestion)).not.toContain('9999');
  });
});
