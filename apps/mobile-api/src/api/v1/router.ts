import { Hono } from 'hono';
import { updateCustomerProfile } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeSchema, MeUpdateSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { authOtp } from './auth-otp';
import { catalog } from './catalog';
import { home } from './home';
import { packages } from './packages';
import { recipes } from './recipes';
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
// Vitrin de katalog kümesindendir (21.14): oturumsuz gezinme aynı karar, Bearer yalnız fiyatı
// kişiselleştirir — kapının ÖNÜNDE kalması güvenlik kararının kendisidir (üstteki sıra notu).
v1.route('/', home);
// Paket detayı da öyle (21.14): vitrindeki kartın açtığı sayfa girişsiz gezilir; paket tek
// fiyatlı (B2C) olduğundan Bearer'ın kişiselleştireceği bir şey de yok (`packages.ts` künyesi).
v1.route('/', packages);
// Tarif detayı da (21.14): "Sofradan fikirler" kartının açtığı sayfa girişsiz gezilir; Bearer
// yalnız malzeme satırlarının fiyatını kişiselleştirir (katalogun aynı kuralı — `recipes.ts`).
v1.route('/', recipes);

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
 * Profil güncellemesi (21.14c) — ad + telefon; gövde `MeUpdateSchema` (e-posta/dil bilerek dışarıda,
 * gerekçe şemada). KURAL BURADA DEĞİL: ad/telefon kuralları ve numara-çakışması okuma biçimi
 * `@lezzet/application.updateCustomerProfile`ta (web hesap formuyla TEK kural). Adlı retler
 * görünür döner: 400 (`name_required`/`phone_invalid`) · 409 (`phone_taken`).
 */
v1.patch('/me', async (c) => {
  const body = MeUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const user = c.get('authUser');
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(user.id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await updateCustomerProfile(db, { profileId: profile.id, ...body.data });
  if (outcome.status !== 'ok') return fail(c, outcome.status, outcome.status === 'phone_taken' ? 409 : 400);
  return ok(c, MeSchema.parse(outcome.profile));
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
