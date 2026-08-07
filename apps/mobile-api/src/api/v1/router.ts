import { Hono } from 'hono';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { fail, ok } from '../../lib/respond';
import { authOtp } from './auth-otp';
import { bearerAuth, type V1Env } from './auth';
import { MeSchema } from './contract';

/**
 * `/api/v1` router'ı — mobil uygulamanın tek kapısı. VARSAYILAN KAPALI: uçlar Bearer
 * doğrulamasının arkasında yaşar. Açık uç bilinçli bir İSTİSNADIR ve `bearerAuth`tan ÖNCE
 * bağlanır — Hono zinciri kayıt sırasıyla kurulur, yani buradaki sıra güvenlik kararının
 * kendisidir: `authOtp` middleware'den önce eşleşir (giriş uçları doğası gereği oturumsuz;
 * kötüye kullanım kilidi DB RPC'sindedir — 5/saat + cooldown), geri kalan her şey sonra.
 */
export const v1 = new Hono<V1Env>();

v1.route('/auth/otp', authOtp);

v1.use('*', bearerAuth);

/**
 * Kimliği doğrulanmış kullanıcının profili. Auth kullanıcısı → `user_profiles` satırı; okuma
 * MEVCUT servisle (`UserProfileService.findByAuthUserId`), sorgu burada yazılmaz. Depo süzgeci
 * bu uçta konu değil: `user_profiles` deposuz bir varlık (CLAUDE §1'in depo kuralı stok/sipariş
 * okumalarının kuralıdır; ilk depo-değen uçta devreye girer).
 *
 * Profil yoksa `404 profile_not_found`: auth kaydı var ama profil satırı yok demektir (trigger
 * boşluğu ya da silinmiş kayıt) — boş bir profil uydurmak arızayı görünmez kılardı.
 */
v1.get('/me', async (c) => {
  const user = c.get('authUser');
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  // `parse` süzgeçtir: pick'te olmayan alan (kredi limiti, personel kapsamı) zarfa sızamaz.
  return ok(c, MeSchema.parse(profile));
});
