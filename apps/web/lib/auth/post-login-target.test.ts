import { describe, expect, it } from 'vitest';
import { postLoginTarget } from './post-login-target';

/**
 * Giriş sonrası yönlendirme (09.1) — kararın saf, DB'siz kanıtı.
 *
 * 19.08'e dek burada *"dev'de auth bypass açık olduğu için bu iki dal tarayıcıdan görülemiyor"*
 * yazıyordu ve bu doğruydu: bypass herkesi personel sayıyordu, yani müşteri dalı yerelde hiç
 * çizilmiyordu. Bypass söküldü (`lib/guard.ts` künyesi), dal artık tarayıcıdan da denenebilir —
 * ama kanıt yine burada durur: yönlendirme bir KARAR ve kararın yeri saf testtir.
 */

describe('personel', () => {
  it('operasyon yolundan geldiyse ORAYA döner — panele değil', () => {
    expect(postLoginTarget(true, '/operations/stock?tab=losses&period=quarter')).toBe('/operations/stock?tab=losses&period=quarter');
  });

  it('yolu yoksa panele düşer', () => {
    expect(postLoginTarget(true, null)).toBe('/operations');
  });

  it('müşteri yolundan geldiyse yine operasyona gider — iki yüzey kuralı', () => {
    expect(postLoginTarget(true, '/tr/panier')).toBe('/operations');
  });
});

describe('müşteri', () => {
  it('geldiği yere döner', () => {
    expect(postLoginTarget(false, '/tr/panier')).toBe('/tr/panier');
  });

  it('operasyon yoluna TAŞINMAZ — girer girmez yetki ekranına çarpardı', () => {
    expect(postLoginTarget(false, '/operations/stock')).toBe('/');
  });
});

describe('açık yönlendirme koruması', () => {
  it.each(['//evil.example', 'https://evil.example/operations', 'operations'])('dış hedef reddedilir: %s', (next) => {
    expect(postLoginTarget(true, next)).toBe('/operations');
    expect(postLoginTarget(false, next)).toBe('/');
  });

  // Tuzak: `/operationsX` operasyon yolu DEĞİLDİR. Önek karşılaştırması sınır kontrolü olmadan
  // yazılsaydı müşteri bu yola taşınmaz, personel ise oraya "operasyon sanarak" giderdi.
  it('operations önekine benzeyen yol operasyon sayılmaz', () => {
    expect(postLoginTarget(false, '/operationsX')).toBe('/operationsX');
    expect(postLoginTarget(true, '/operationsX')).toBe('/operations');
  });
});
