/**
 * Local seed — `supabase db reset` sonrası deploy-temeli veriyi kurar (local stack'e karşı).
 *
 * Şu an tek kademe: **BASE** — admin hesabını garanti eder. Modüller büyüdükçe kendi seed
 * adımlarını buraya ekler (05 → ürün/katalog, 07 → sipariş, test/faker verisi o zaman gelir) —
 * tıpkı tiplerin/servislerin artımlı büyümesi gibi. İleride storage (upload) adımları da buradan.
 *
 * Kullanım:  pnpm db:reset && pnpm db:seed   (ya da tek komut: pnpm db:refresh)
 * Admin e-postası:  SEED_ADMIN_EMAIL env (yoksa admin@lezzetanatolia.fr). Local'de OTP kodu
 * Mailpit'e (http://127.0.0.1:54324) düşer, o yüzden gerçek kutu gerekmez.
 */
import { createServiceRoleClient, StaffRoleService } from '@lezzet/database';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@lezzetanatolia.fr';

/**
 * Admin hesabını garanti eder: Auth kullanıcısı yoksa yaratır, rolü idempotent atar.
 * Not: taze reset sonrası `staff_role` boş olduğundan `handle_new_auth_user` trigger'ı bu ilk
 * hesabı zaten admin yapar; buradaki assign yalnız güvence (hesap önceden varsa da doğru sonuç).
 */
async function seedAdmin(supabase: ReturnType<typeof createServiceRoleClient>): Promise<void> {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;

  const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email: ADMIN_EMAIL, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('createUser başarısız');
    userId = data.user.id;
  }

  await new StaffRoleService(supabase).assign(userId, 'admin');
  console.log(`✓ admin hazır: ${ADMIN_EMAIL}  (user ${userId})`);
}

async function main(): Promise<void> {
  const supabase = createServiceRoleClient();
  console.log('▸ BASE seed');
  await seedAdmin(supabase);
  console.log('✓ seed tamam');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
