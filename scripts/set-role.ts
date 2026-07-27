/**
 * Kullanıcı rolü EKLER. Auth kullanıcısı yoksa oluşturur (0002 trigger profili açar), sonra rolü yazar.
 * İlk admin için gerekmez (ilk giriş yapan otomatik admin) — depo/kurye/muhasebe atamak için.
 *
 * Rol kümesi kuralı motordadır (`withRole`): operasyon rolü verilince `customer` düşer, personel
 * içinde roller birikir (depo + muhasebe aynı kişide olabilir). `--only` ile küme sıfırlanır.
 *
 * Kullanım:  pnpm set-role <email> <customer|admin|warehouse|courier|accounting> [--only]
 */
import { createServiceRoleClient, UserProfileService } from '@lezzet/database';
import { withRole } from '@lezzet/domain-core';
import { UserRoleEnum } from '@lezzet/types';

// .env'i yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2);
  const only = process.argv.includes('--only'); // mevcut rolleri koru değil, KÜMEYİ bu role indir
  if (!email || !roleArg) {
    console.error('Kullanım: pnpm set-role <email> <customer|admin|warehouse|courier|accounting> [--only]');
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
  const roles = only ? [role] : withRole(profile.roles, role);
  await profiles.setRoles(profile.id, roles);
  console.log(`✓ ${email} → ${roles.join(', ')}  (user ${userId})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
