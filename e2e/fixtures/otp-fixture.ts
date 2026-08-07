import { loadRootEnv } from './order-fixture';

/**
 * MİSAFİR OTP fikstürü (Kademe 2 Parti 3b · `musteri-otp-test-kapisi.md` Katman 1).
 *
 * Kurulum yok, yalnız TEMİZLİK var — akışın kendisi UI'dan yaşanıyor; fikstürün işi doğrulamanın
 * geride bıraktığı ÜÇ kalıcı izi toplamak:
 *  1. `email_verifications` satırı — `token_hash` GLOBAL TEKİL ve sabit kodun hash'i hep aynı:
 *     satır silinmezse SONRAKİ koşu (ve şeritlerin testleri) kısıta çarpar (`BEKLEYEN(08.22)`
 *     kalkana dek sabit kodla tek istek hakkı var; temizlik bu hakkı her koşuda tazeler).
 *  2. `user_profiles` satırı — doğrulama müşteriyi trigger'la açar; purge'ün bildiği hedef.
 *  3. `auth.users` satırı — purge'ün BİLMEDİĞİ tek iz: profil `auth.users.id`'siyle yaşar ama
 *     silinmesi Supabase admin API'si ister; profil silinip auth bırakılsaydı öksüz kimlik
 *     birikirdi (denetim §4b: sessiz yarım silme).
 */
export const OTP_TEST_CODE = '123456';

export interface GuestOtpFixture {
  email: string;
  cleanup: () => Promise<void>;
}

export function createGuestOtp(): GuestOtpFixture {
  loadRootEnv();
  const email = `e2e-misafir-${Date.now()}@ornek.fr`;

  return {
    email,
    cleanup: async () => {
      const { serviceDb } = await import('@lezzet/database');
      const { purgeTestData } = await import('@lezzet/database/testing');
      const db = serviceDb();

      // Auth kimliği E-POSTAYLA, admin API'den bulunur — profilden DEĞİL. Ölçüldü (07.08):
      // misafir doğrulaması yalnız auth.users açıyor, user_profiles satırı bu aşamada YOK
      // (profil daha sonra bağlanıyor); profile bakan ilk sürüm bu yüzden 2 öksüz auth bıraktı.
      // Profil katmanı yine de duruyor: akış bir gün doğrulamada profil açarsa temizlik hazır.
      const { data, error: listError } = await db.auth.admin.listUsers({ perPage: 200 });
      if (listError) throw new Error(`auth kullanıcıları listelenemedi — ${listError.message}`);
      const authUser = data.users.find((u) => u.email === email);

      const { data: profile } = await db.from('user_profiles').select('id').eq('id', authUser?.id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
      await purgeTestData(db, {
        verificationEmails: [email],
        profileIds: profile ? [profile.id] : [],
      });
      if (authUser) {
        const { error } = await db.auth.admin.deleteUser(authUser.id);
        if (error && !/not.*found/i.test(error.message)) throw new Error(`auth kullanıcısı silinemedi — ${error.message}`);
      }
    },
  };
}
