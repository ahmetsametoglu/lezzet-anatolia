import { newRequestKey } from './request-key';

/*
  Anahtarın TEK sözleşmesi tekilliktir (dosya künyesi: sır değil, eşleştirme etiketi). Ölçülen de
  bu: aynı milisaniyede üretilen iki anahtar ayrışmalı — `Math.random` tek başına bunu GARANTİ
  etmiyordu, monoton sayaç ediyor.
*/

describe('istek kimliği', () => {
  it('önekiyle başlar ve boş değildir', () => {
    const key = newRequestKey('col');
    expect(key.startsWith('col-')).toBe(true);
    expect(key.length).toBeGreaterThan(10);
  });

  it('zaman DONDURULMUŞ olsa bile iki çağrı ayrışır (sayaç ekseni)', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_754_600_000_000);
    try {
      const keys = new Set(Array.from({ length: 200 }, () => newRequestKey('col')));
      expect(keys.size).toBe(200);
    } finally {
      now.mockRestore();
    }
  });
});
