import { describe, expect, it } from 'vitest';
import { SERVICE_WINDOW_HOURS, serviceWindowExpiry } from './service-window';

/**
 * Servis penceresi (15.1). Sınanan tek şey pencerenin **neye göre** hesaplandığı: mesajın anına
 * göre, işlediğimiz ana göre değil. Fark adım 2'de para demek — gecikmiş bir webhook, kendi
 * işlenme anına göre hesaplanmış bir pencereyi Meta'nınkinden geç bitirir ve gönderim reddedilir.
 */

describe('servis penceresi gelen mesajın ANINA çıpalıdır', () => {
  it('24 saat sonrasını döner', () => {
    expect(serviceWindowExpiry('2026-08-08T09:00:00.000Z')).toBe('2026-08-09T09:00:00.000Z');
  });

  it('Date girdisi de aynı sonucu verir — çağıran dönüştürmek zorunda değil', () => {
    const at = new Date('2026-08-08T09:00:00.000Z');
    expect(serviceWindowExpiry(at)).toBe(serviceWindowExpiry(at.toISOString()));
  });

  it('süre SABİTTEN gelir — sayı koda ikinci kez yazılmaz', () => {
    const at = new Date('2026-08-08T09:00:00.000Z');
    const expiry = new Date(serviceWindowExpiry(at));
    expect((expiry.getTime() - at.getTime()) / (60 * 60 * 1000)).toBe(SERVICE_WINDOW_HOURS);
  });

  it('gün/ay sınırını doğru geçer — yerel saat dilimine kaymaz', () => {
    // 31 Aralık 20:00 UTC + 24s = 1 Ocak 20:00 UTC. Yerel saate düşen bir uygulama burada kayardı.
    expect(serviceWindowExpiry('2026-12-31T20:00:00.000Z')).toBe('2027-01-01T20:00:00.000Z');
  });
});
