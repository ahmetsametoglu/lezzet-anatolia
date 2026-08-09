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
 * **Kural bir tur değişti ve testler onunla döndü.** İlk hâli iptal SEBEBİNİ okuyordu
 * (`out_of_stock` + `online`); o ikili doğru cevap veriyordu ama eksikti — parayı iade eden ikinci
 * webhook dalı sebebi `superseded` bırakıyor, yani aynı yalan orada duruyordu. Arka uç iki soruyu
 * iki kolona ayırdı; ekran artık damgayı okuyor. Sebep bu görünümde HİÇ TAŞINMIYOR ve testin
 * sebep kümesini sayan bir dalı da yok: "hangi sebepler para demektir" sorusu artık ekranın değil.
 */
const view = (over: Partial<Parameters<typeof isRefundedCancellation>[0]> = {}) => ({
  cancelled: true,
  refundedAt: '2026-08-08T09:30:54.000Z',
  ...over,
});

describe('iptalde "paranız iade edildi" cümlesi', () => {
  it('iptal + iade damgası → iade edildi', () => {
    expect(isRefundedCancellation(view())).toBe(true);
  });

  it('damga YOK → iade YOK: para hiç çekilmedi', () => {
    // Kapıda ödemede rezervasyon tutmadı ve sipariş `draft`ta kapandı; ortada tahsilat yok. Sebep
    // burada da `out_of_stock`tur — sebebi okuyan kural bu satırda "paranız iade edildi" derdi.
    expect(isRefundedCancellation(view({ refundedAt: null }))).toBe(false);
  });

  it('iptal EDİLMEMİŞ sipariş hiç sorgulanmaz', () => {
    // Damga ayakta bir siparişte durabilir olsaydı bile iptal cümlesi kurulmaz.
    expect(isRefundedCancellation(view({ cancelled: false }))).toBe(false);
  });
});
