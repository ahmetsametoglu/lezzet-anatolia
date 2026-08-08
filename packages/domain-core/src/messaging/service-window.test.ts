import { describe, expect, it } from 'vitest';
import { SERVICE_WINDOW_HOURS, serviceWindowExpiry, serviceWindowState } from './service-window';

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

describe('pencerenin şu anki hâli — ücret kararının tek kapısı', () => {
  const simdi = new Date('2026-08-08T12:00:00.000Z');

  it('açık pencere: serbest metin, ücretsiz — kalan süre de söylenir', () => {
    const durum = serviceWindowState('2026-08-08T18:00:00.000Z', simdi);
    expect(durum).toEqual({ open: true, everOpened: true, msRemaining: 6 * 60 * 60 * 1000 });
  });

  it('kapanmış pencere: kalan süre SIFIR, eksi değil', () => {
    // Eksi bir süre "borç" gibi okunur ve ekranda "-3 saat kaldı" diye görünürdü.
    expect(serviceWindowState('2026-08-08T09:00:00.000Z', simdi)).toEqual({
      open: false,
      everOpened: true,
      msRemaining: 0,
    });
  });

  it('HİÇ AÇILMAMIŞ pencere kapanmış pencereden farklıdır — müdahaleleri de farklı', () => {
    // İkisi de "gönderemezsin" der ama biri kaçırılmış bir fırsat, öteki henüz kurulmamış bir
    // ilişkidir: birincisinde müşteriye ulaşmanın maliyeti bir şablon, ikincisinde bir izin.
    expect(serviceWindowState(null, simdi)).toEqual({ open: false, everOpened: false, msRemaining: 0 });
    expect(serviceWindowState(undefined, simdi).everOpened).toBe(false);
  });

  it('tam bitiş anında pencere KAPALIDIR — sınırda iyimserlik fatura yazar', () => {
    expect(serviceWindowState('2026-08-08T12:00:00.000Z', simdi).open).toBe(false);
  });
});
