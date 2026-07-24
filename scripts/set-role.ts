/**
 * Kullanıcı rolü atar. Auth kullanıcısı yoksa oluşturur (0002 trigger profili açar), sonra rolü yazar.
 * İlk admin için gerekmez (ilk giriş yapan otomatik admin) — depo/kurye atamak veya rol değiştirmek için.
 * Kullanım:  pnpm set-role <email> <customer|admin|warehouse|courier>
 */
import { createServiceRoleClient, UserProfileService } from '@lezzet/database';
import { UserRoleEnum } from '@lezzet/types';

// .env'i yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2);
  if (!email || !roleArg) {
    console.error('Kullanım: pnpm set-role <email> <customer|admin|warehouse|courier>');
    process.exit(1);
  }
  const role = UserRoleEnum.parse(roleArg);
  const supabase = createServiceRoleClient();

  // Auth kullanıcısını bul ya da oluştur.
  let userId: string;
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  }

  const profiles = new UserProfileService(supabase);
  const profile = await profiles.findByAuthUserId(userId);
  if (!profile) throw new Error('Profil bulunamadı — 0002 trigger çalışmadı mı?');
  await profiles.setRole(profile.id, role);
  console.log(`✓ ${email} → ${role}  (user ${userId})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
