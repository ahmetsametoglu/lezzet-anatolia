import { describe, expect, it } from 'vitest';
import { refundMethodOf } from './refund-method';

describe('iadenin yöntemi', () => {
  it('kasadan yapılan iade nakittir, sipariş kartla ödenmiş olsa da', () => {
    // Siparişin yöntemi izlenseydi kasadan çıkan nakit kasaya kart iadesi diye yazılır, kasa sayımı tutmazdı.
    expect(refundMethodOf('cash', 'card')).toBe('cash');
    expect(refundMethodOf('bank', 'online')).toBe('bank_transfer');
  });

  it('sağlayıcıdan yapılan iade asıl ödemenin yöntemiyle döner, bilinmiyorsa tahmin edilmez', () => {
    // Bilinmeyen yöntem "çevrim içi" sayılsaydı kapıda kartla alınmış paranın iadesi kasaya yanlış kodla yazılırdı.
    expect(refundMethodOf('provider', 'card')).toBe('card');
    expect(refundMethodOf('provider', null)).toBeNull();
  });
});
