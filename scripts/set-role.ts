/**
 * Personel rolü atar (ilk admin dahil). Auth kullanıcısı yoksa oluşturur, sonra rolü verir.
 * Kullanım:  pnpm set-role <email> <admin|warehouse|courier>
 * Örn:       pnpm set-role admin@lezzet.local admin
 */
import { createServiceRoleClient, StaffRoleService } from '@lezzet/database';
import { StaffRoleEnum } from '@lezzet/types';

// .env'i yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

async function main(): Promise<void> {
  const [email, roleArg] = process.argv.slice(2);
  if (!email || !roleArg) {
    console.error('Kullanım: pnpm set-role <email> <admin|warehouse|courier>');
    process.exit(1);
  }
  const role = StaffRoleEnum.parse(roleArg);
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

  await new StaffRoleService(supabase).assign(userId, role);
  console.log(`✓ ${email} → ${role}  (user ${userId})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
