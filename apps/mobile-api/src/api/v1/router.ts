import { Hono } from 'hono';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { authOtp } from './auth-otp';
import { catalog } from './catalog';
import { courier } from './courier';
import { warehouse } from './warehouse';
import { bearerAuth, type V1Env } from './auth';

/**
 * `/api/v1` router'ı — mobil uygulamanın tek kapısı. VARSAYILAN KAPALI: uçlar Bearer
 * doğrulamasının arkasında yaşar. Açık uç bilinçli bir İSTİSNADIR ve `bearerAuth`tan ÖNCE
 * bağlanır — Hono zinciri kayıt sırasıyla kurulur, yani buradaki sıra güvenlik kararının
 * kendisidir: `authOtp` middleware'den önce eşleşir (giriş uçları doğası gereği oturumsuz;
 * kötüye kullanım kilidi DB RPC'sindedir — 5/saat + cooldown), geri kalan her şey sonra.
 *
 * İKİNCİ AÇIK KÜME: katalog (21.6). Gerekçesi giriş uçlarınınkinden farklı ve karar kayıtlı
 * (02-mimari §4, kullanıcı 07.08): *"oturumsuz kullanım = müşteri gezinmesi"* — uygulama giriş
 * kapısıyla açılmaz, vitrin girişsiz gezilir ve kapı ancak giriş gereken akışta çıkar. Katalogu
 * Bearer'ın arkasına koymak, ürünü görmek için hesap açtırmak olurdu.
 */
export const v1 = new Hono<V1Env>();

v1.route('/auth/otp', authOtp);
v1.route('/', catalog);

v1.use('*', bearerAuth);

/**
 * Kimliği doğrulanmış kullanıcının profili. Auth kullanıcısı → `user_profiles` satırı; okuma
 * MEVCUT servisle (`UserProfileService.findByAuthUserId`), sorgu burada yazılmaz. Depo süzgeci
 * bu uçta konu değil: `user_profiles` deposuz bir varlık (CLAUDE §1'in depo kuralı stok/sipariş
 * okumalarının kuralıdır; ilk depo-değen uçta devreye girer).
 *
 * Profil yoksa `404 profile_not_found`: auth kaydı var ama profil satırı yok demektir (trigger
 * boşluğu ya da silinmiş kayıt) — boş bir profil uydurmak arızayı görünmez kılardı.
 *
 * Cevabın şekli BURADA TANIMLI DEĞİL: `MeSchema` `@lezzet/types`'a terfi etti (21.9) — hangi alanın
 * müşteriye baktığı, hangisinin operasyon-içi kaldığı kararı ve gerekçesi orada yaşıyor
 * (`me-api.schema.ts`). Uygulama kabuğu aynı şemayla parse eder; sözleşme tek kaynaktan.
 */
v1.get('/me', async (c) => {
  const user = c.get('authUser');
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  // `parse` süzgeçtir: pick'te olmayan alan (kredi limiti, personel kapsamı) zarfa sızamaz.
  return ok(c, MeSchema.parse(profile));
});

/**
 * Personel bölümleri (21.10 · 21.11) — `bearerAuth`ın ARDINDA ve orada kalacaklar: katalogun aksine
 * bu uçlar personelindir, oturumsuz gezilmez. İkinci bir kapı daha var ve o rota dosyalarının kendi
 * içinde: `requireStaffRole` rolü süzer ve personel kimliğini JETONDAN çözer (`auth.ts` künyesi).
 * Depo bölümünün ÜÇÜNCÜ bir kapısı daha var — "hangi depo" sorusu (`warehouse.ts` künyesi:
 * varsayılan depo YOKTUR).
 *
 * Önekler burada veriliyor, dosyada değil: uçların adresini router'ın okuyan gözü tek yerden görsün.
 */
v1.route('/courier', courier);
v1.route('/warehouse', warehouse);
