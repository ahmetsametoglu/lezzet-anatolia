import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone, scrubMessage } from './mask';

/**
 * Maskeleme bir iç ayrıntı değil, **müşteriye verilmiş bir söz**: gizlilik metni "teknik hata
 * kayıtlarımızda kişisel veri yalnız maskelenmiş biçimde tutulur" diyor (05.08 söz denetimi).
 * Bu dosya o cümlenin kanıtıdır — bozulursa sözün kendisi yalan olur ve hiçbir yerde hata vermez.
 */

describe('maskEmail', () => {
  it('yerel kısmı siler, alan adını bırakır — kim değil, hangi kayıt', () => {
    expect(maskEmail('ahmet@example.com')).toBe('a***@example.com');
  });

  it('ayrıştırılamayan girdi TAMAMEN gider', () => {
    // Biçimi tanımadığımız bir dizgede neyin kişisel olduğunu da bilemeyiz.
    expect(maskEmail('ahmet-at-example')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail(null)).toBe('***');
  });
});

describe('maskPhone', () => {
  it('ülke ön ekini ve son iki haneyi bırakır', () => {
    expect(maskPhone('+33612345678')).toBe('+33*******78');
  });

  it('ayırıcılardan bağımsız aynı sonucu verir — biçim değil hane sayılır', () => {
    expect(maskPhone('+33 6 12 34 56 78')).toBe(maskPhone('+33612345678'));
  });

  it('numara sayılamayacak kadar kısa girdi tamamen gider', () => {
    expect(maskPhone('123')).toBe('***');
  });
});

describe('scrubMessage — serbest metnin tek kapısı', () => {
  it("Postgres'in kısıt ihlaline gömdüğü değer çifti tümüyle düşer", () => {
    // En tehlikeli sızıntı bizim yazdığımız bağlam değil, veritabanının kendi gövdesidir.
    const raw = 'duplicate key value violates unique constraint "customer_email_key" Key (email)=(ahmet@example.com) already exists';
    const temiz = scrubMessage(raw);
    expect(temiz).toContain('Key (…)=(…)');
    expect(temiz).not.toContain('ahmet@example.com');
  });

  it('serbest metindeki e-posta maskelenir', () => {
    expect(scrubMessage('mail gönderilemedi: ahmet@example.com')).toBe('mail gönderilemedi: a***@example.com');
  });

  it('serbest metindeki TELEFON maskelenir (05.08 — eskiden sızıyordu)', () => {
    expect(scrubMessage('OTP gönderilemedi: +33612345678')).toBe('OTP gönderilemedi: +33*******78');
    expect(scrubMessage('numara: 0612345678')).not.toContain('0612345678');
  });

  it('telefon OLMAYAN sayılar bozulmaz — teşhis için mesajın kendisi de lazım', () => {
    // Kalıp bilerek kaba; kararı hane sayımı veriyor. Bunlar maskelenirse hata okunamaz hâle gelir.
    expect(scrubMessage('tutar 4000 cent, eşik 6000')).toBe('tutar 4000 cent, eşik 6000');
    expect(scrubMessage('migration 0035_analytics.sql başarısız')).toContain('0035_analytics.sql');
    expect(scrubMessage('sipariş LZA-1042 bulunamadı')).toContain('LZA-1042');
  });

  it('uuid ortasından parça koparmaz', () => {
    const id = '3f8a1c22-9b40-4c7e-8a11-0123456789ab';
    expect(scrubMessage(`sipariş ${id} bulunamadı`)).toContain(id);
  });

  it('bir metinde birden çok kişisel veri varsa hepsi düşer', () => {
    const temiz = scrubMessage('teslimat: ahmet@example.com / +33612345678');
    expect(temiz).not.toContain('ahmet@example.com');
    expect(temiz).not.toContain('612345678');
  });
});
