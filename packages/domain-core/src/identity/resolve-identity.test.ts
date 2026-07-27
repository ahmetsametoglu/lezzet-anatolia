import { describe, expect, it } from 'vitest';
import { resolveIdentity } from './resolve-identity';

describe('kimlik çözümü (03.9)', () => {
  it('telefon eşleşirse o müşteriye bağlanır (WhatsApp yolu)', () => {
    const r = resolveIdentity({ phone: '06 12 34 56 78' }, { byPhone: 'c1' });
    expect(r).toEqual({ action: 'attach', customerId: 'c1', normalizedPhone: '+33612345678', email: null });
  });

  it('e-posta eşleşirse o müşteriye bağlanır (web yolu)', () => {
    const r = resolveIdentity({ email: 'Ayse@Example.COM ' }, { byEmail: 'c2' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c2', email: 'ayse@example.com' });
  });

  it('iki anahtar AYNI müşteriye çıkarsa sorun yok — aynı kişi iki yüzeyden geldi', () => {
    const r = resolveIdentity({ phone: '0612345678', email: 'a@b.fr' }, { byPhone: 'c1', byEmail: 'c1' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c1' });
  });

  it('iki anahtar FARKLI müşteriye çıkarsa sessizce seçim yapılmaz — admin birleştirir', () => {
    const r = resolveIdentity({ phone: '0612345678', email: 'a@b.fr' }, { byPhone: 'c1', byEmail: 'c2' });
    expect(r).toEqual({ action: 'conflict', phoneCustomerId: 'c1', emailCustomerId: 'c2' });
  });

  it('eşleşme yoksa yeni kayıt açılır; telefon normalize edilmiş döner', () => {
    const r = resolveIdentity({ phone: '+33 6 12 34 56 78' });
    expect(r).toEqual({ action: 'create', normalizedPhone: '+33612345678', email: null });
  });

  it('anahtar yoksa kimlik kurulamaz', () => {
    expect(resolveIdentity({})).toEqual({ action: 'insufficient' });
    expect(resolveIdentity({ phone: 'abc' })).toEqual({ action: 'insufficient' }); // normalize edilemedi
  });

  it('Alman numarası varsayılan ülkeyle çözülür', () => {
    const r = resolveIdentity({ phone: '0170 1234567', defaultCountry: 'DE' });
    expect(r).toMatchObject({ action: 'create', normalizedPhone: '+491701234567' });
  });
});
