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
    expect(r).toEqual({ action: 'conflict', customerIds: ['c1', 'c2'] });
  });

  it('eşleşme yoksa yeni kayıt açılır; telefon normalize edilmiş döner', () => {
    const r = resolveIdentity({ phone: '+33 6 12 34 56 78' });
    expect(r).toEqual({ action: 'create', normalizedPhone: '+33612345678', email: null });
  });

  it('oturum sahibi ÜÇÜNCÜ anahtardır — trigger profili açmışsa ona bağlanılır', () => {
    // Google ile giren kullanıcının telefonu/e-postası elimizde olmayabilir; auth bağı yeter.
    const r = resolveIdentity({ authUserId: 'u1' }, { byAuthUser: 'c9' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c9' });
  });

  it('oturum sahibi BAŞKA profile bağlıysa çakışmadır — aynı auth iki profile yazılamaz', () => {
    // Telefonla açılmış WhatsApp taslağı + trigger'ın e-postayla açtığı profil: iki ayrı kayıt.
    const r = resolveIdentity({ phone: '0612345678', authUserId: 'u1' }, { byPhone: 'c1', byAuthUser: 'c2' });
    expect(r).toEqual({ action: 'conflict', customerIds: ['c2', 'c1'] });
  });

  it('üç anahtar üç ayrı kayda düşebilir — hepsi bildirilir', () => {
    const r = resolveIdentity(
      { phone: '0612345678', email: 'a@b.fr', authUserId: 'u1' },
      { byPhone: 'c1', byEmail: 'c2', byAuthUser: 'c3' },
    );
    expect(r).toEqual({ action: 'conflict', customerIds: ['c3', 'c1', 'c2'] });
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
