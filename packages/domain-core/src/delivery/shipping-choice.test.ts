import { describe, expect, it } from 'vitest';
import { homeDeliveryOnly, requiresHomeDelivery } from './shipping-choice';

/**
 * Kullanıcı kararı 29.08: *"Teslimat noktasına kullanıcı kendisi seçiyorsa ve kargo parası siparişin
 * üzerine ekleniyorsa olabilir. Ama eşiği geçtiyse ve kargo ücretsiz diyorsak evine teslim
 * senaryosu devrede."* Ayıran şey paranın kimden çıktığı.
 */
describe('requiresHomeDelivery', () => {
  it('ÜCRETSİZ kargo eve gider — parayı biz ödüyoruz, seçim bizim', () => {
    expect(requiresHomeDelivery({ deliveryType: 'shipping', shippingFeeCents: 0 })).toBe(true);
  });

  it('müşteri ÖDÜYORSA seçim onun — teslimat noktası da meşru', () => {
    expect(requiresHomeDelivery({ deliveryType: 'shipping', shippingFeeCents: 499 })).toBe(false);
  });

  it('ROTA teslimatında soru doğmaz — ücret sıfır ama ortada kargo yok', () => {
    expect(requiresHomeDelivery({ deliveryType: 'route', shippingFeeCents: 0 })).toBe(false);
    expect(requiresHomeDelivery({ deliveryType: 'pickup', shippingFeeCents: 0 })).toBe(false);
  });
});

describe('homeDeliveryOnly', () => {
  const secenek = (code: string, lastMile: string | null) => ({ code, lastMile });

  it('yalnız eve teslim edenler kalır', () => {
    const kalan = homeDeliveryOnly([
      secenek('nokta', 'service_point'),
      secenek('ev', 'home_delivery'),
      secenek('dolap', 'locker'),
    ]);
    expect(kalan.map((o) => o.code)).toEqual(['ev']);
  });

  /**
   * Son adımı bilinmeyen seçenek ELENİR. "Bilmiyorum" ile "eve gidiyor" aynı şey değil ve burada
   * yanılmanın bedeli somut: müşteri ücretsiz kargo bekler, kolisini teslim noktasında bulur.
   */
  it('son adımı BİLİNMEYEN seçenek eve teslim sayılmaz', () => {
    expect(homeDeliveryOnly([secenek('bilinmiyor', null)])).toEqual([]);
  });

  it('hiçbiri eve teslim etmiyorsa liste boşalır — uydurulmaz', () => {
    expect(homeDeliveryOnly([secenek('nokta', 'service_point')])).toEqual([]);
  });
});
