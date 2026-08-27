import { describe, expect, it } from 'vitest';
import { devLoginRefusalOf } from './dev-login';

/**
 * **Hızlı giriş kapısının ret kararı** (mobil şeridin saha bulgusu 26.08 → düzeltme 27.08).
 *
 * Test DB'siz ve zorunlu olarak öyle: çivilenen hâl *"veritabanında hiç yönetici yok"* ve o hâli
 * kurulu bir veritabanında üretmek, tüm paketin okuduğu yönetici satırlarını silmek demekti
 * (`CLAUDE §4b`). Karar iki olguya bakıyor, tablosu üç satır — motora çıkarılmasının sebebi de bu.
 *
 * Kararın ölçüsü **hesap açmak değil, açılan hesabın YÖNETİCİ doğması.** Ayrım önemli: mobil kapı
 * *"kayıtsız e-postaya da oturum verilir, bu bilinçli"* diye çivilenmiş bir karar taşıyor
 * (`apps/mobile-api/.../preferences.test.ts`) ve o karar yanlış değildi — zararlı olan tek an,
 * `0002`nin açılış kuralının silahlı olduğu andı.
 */
describe('devLoginRefusalOf', () => {
  it('KİMLİĞİ OLAN adres her hâlde geçer — orada çağrı yaratmıyor, bağlıyor', () => {
    expect(devLoginRefusalOf({ profileExists: true, anyAdminExists: true })).toBeNull();
    // Yönetici yokken bile: var olan profile bağlanmak açılış kuralını TETİKLEMEZ, çünkü `0002`
    // e-postayla eşleşen satırı bulup bağlar ve rolüne dokunmaz (ölçüldü 11.08).
    expect(devLoginRefusalOf({ profileExists: false, anyAdminExists: false })).not.toBeNull();
    expect(devLoginRefusalOf({ profileExists: true, anyAdminExists: false })).toBeNull();
  });

  it('KAYITSIZ adres KURULU veritabanında geçer — süzgeç yok, bu karar korunuyor', () => {
    expect(devLoginRefusalOf({ profileExists: false, anyAdminExists: true })).toBeNull();
  });

  it('KAYITSIZ adres + hiç yönetici yok → REDDEDİLİR: açılan hesap yönetici doğardı', () => {
    expect(devLoginRefusalOf({ profileExists: false, anyAdminExists: false })).toBe('unseeded_database');
  });
});
