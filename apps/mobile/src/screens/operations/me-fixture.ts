import { MeSchema } from '@lezzet/types';
import type { UserRole } from '@lezzet/types';

import type { Me } from '@/lib/api/me';

/*
  `/api/v1/me` cevabı — TESTLER İÇİN. Ekranın gördüğü tek değişken `roles` olduğu için geri kalan
  alanlar nötr doldurulur; ama gövde ŞEMADAN GEÇİRİLİR (`MeSchema.parse`), yani sözleşme değişince
  fixture derlemede değil KOŞUDA da kırılır ve testler yanlış bir cevabı doğruymuş gibi taşımaz.

  Fixture kaynak dosyada (test dosyasında değil): bugünkü tek tüketicisi kabuk testi
  (`operations-shell.test.tsx` — bildirim ekranı testi /me kurmaz, bölümleri doğrudan sağlayıcıyla
  verir); yine de burada durur çünkü gövde ŞEMANIN yanında yaşamalı — /me cevabı kuran her yeni
  test (21.10+ dilimleri) aynı fixture'ı çağırır, kendi kopyasını yazmaz.
*/

/** Rolleri verilen, geri kalanı nötr bir profil. */
export function meFixture(roles: UserRole[]): Me {
  return MeSchema.parse({
    id: '00000000-0000-0000-0000-00000000beef',
    type: 'individual',
    name: 'Musa K.',
    email: 'musa@ornek.test',
    phone: null,
    preferredLanguage: 'tr',
    country: 'FR',
    roles,
    b2bApproved: null,
    b2bPending: false,
    marketingConsent: {},
    referralCode: null,
    createdAt: '2026-08-08T09:00:00.000Z',
  });
}
