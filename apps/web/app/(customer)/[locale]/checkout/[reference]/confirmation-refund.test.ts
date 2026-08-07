import { describe, expect, it } from 'vitest';
import { isRefundedCancellation } from './confirmation-types';

/**
 * **Onay ekranı iptalde hangi cümleyi kurar** (07.14).
 *
 * Bu testin varlık sebebi yaşanmış bir yalan: ekran yalnız "iptal mi" diye sorup ÜÇ yolun hepsine
 * *"Ödeme tamamlanmadı — kartınızdan tahsilat yapılmadı"* diyordu. İkisinde doğruydu; parası
 * çekilip otomatik iade edilmiş siparişte YANLIŞTI. İade ekstreye günler sonra düşer — o aralıkta
 * müşteri "tahsilat yapılmadı" okur ama hesabında para eksiktir.
 *
 * Sınanan şey, sebebin TEK BAŞINA yetmediği: `out_of_stock` iki ayrı yolda yazılıyor ve yalnız
 * birinde para çekilmiş oluyor. Kural ödeme yöntemiyle birlikte kuruluyor.
 */
const view = (over: Partial<Parameters<typeof isRefundedCancellation>[0]> = {}) => ({
  cancelled: true,
  cancelReason: 'out_of_stock' as const,
  paymentMethod: 'online' as const,
  ...over,
});

describe('iptalde "paranız iade edildi" cümlesi', () => {
  it('KART + stok kalmadı → iade edildi (webhook para çekip geri verdi)', () => {
    expect(isRefundedCancellation(view())).toBe(true);
  });

  it('KAPIDA ödeme + stok kalmadı → iade YOK: para hiç çekilmedi', () => {
    // Aynı sebep, başka yol: rezervasyon tutmadı ve sipariş `draft`ta kapandı. Sebebi tek başına
    // okusaydık burada "paranız iade edildi" derdik — müşteri hiç ödeme yapmamışken.
    expect(isRefundedCancellation(view({ paymentMethod: 'cash' }))).toBe(false);
  });

  it('taslak süperse edildi → iade YOK (müşteri yeni denemeye geçti)', () => {
    expect(isRefundedCancellation(view({ cancelReason: 'superseded' }))).toBe(false);
  });

  it('sebep YAZILMAMIŞ → iade YOK; "sebep yok" demek değil, cümle nötre düşer', () => {
    expect(isRefundedCancellation(view({ cancelReason: null }))).toBe(false);
  });

  it('iptal EDİLMEMİŞ sipariş hiç sorgulanmaz', () => {
    // Sebep kolonu geçmiş bir iptalden kalmış olsa bile ayakta bir siparişte cümle kurulmaz.
    expect(isRefundedCancellation(view({ cancelled: false }))).toBe(false);
  });
});
