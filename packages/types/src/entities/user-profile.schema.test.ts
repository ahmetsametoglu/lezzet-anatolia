import { describe, expect, it } from 'vitest';
import { FindOrCreateInputSchema } from './user-profile.schema';

/**
 * **Kimliksiz müşteri kaydı açılamaz: telefon ya da e-posta.**
 *
 * "Bul ya da oluştur" kapısının tek dayanağı bu iki anahtardır; ikisi de yoksa kapı hiçbir zaman
 * BULAMAZ, yalnız oluşturur — ve aynı müşteri her temasta yeni bir kayıt olarak doğar. Arıza
 * sessizdir: kimse hata görmez, yalnız müşteri listesi ikizlerle şişer.
 */
describe('FindOrCreateInput — en az bir kimlik anahtarı', () => {
  it('ikisi de yoksa REDDEDİLİR (ad tek başına kimlik değildir)', () => {
    expect(FindOrCreateInputSchema.safeParse({ name: 'Ayşe' }).success).toBe(false);
    expect(FindOrCreateInputSchema.safeParse({}).success).toBe(false);
  });

  it('telefon ya da e-posta yeter', () => {
    expect(FindOrCreateInputSchema.safeParse({ phone: '+33612345678' }).success).toBe(true);
    expect(FindOrCreateInputSchema.safeParse({ email: 'a@b.fr' }).success).toBe(true);
  });

  it('geçersiz e-posta kimlik SAYILMAZ', () => {
    expect(FindOrCreateInputSchema.safeParse({ email: 'a@b' }).success).toBe(false);
  });
});
