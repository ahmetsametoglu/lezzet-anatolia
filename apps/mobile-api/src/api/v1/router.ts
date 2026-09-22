import { Hono } from 'hono';
import { updateCustomerProfile } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeSchema, MeUpdateSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { addresses } from './addresses';
import { authOauth } from './auth-oauth';
import { authOtp } from './auth-otp';
import { b2b, b2bPublic } from './b2b';
import { cart } from './cart';
import { cartView } from './cart-view';
import { catalog } from './catalog';
import { checkout } from './checkout';
import { devLogin } from './dev-login';
import { discover, discoverClaim } from './discover';
import { feedback } from './feedback';
import { home } from './home';
import { invite, inviteClaim } from './invite';
import { orders } from './orders';
import { packages } from './packages';
import { payments } from './payments';
import { deliveryTerms } from './delivery-terms';
import { places } from './places';
import { stockNotices } from './stock-notices';
import { notifications, pushDevices } from './notifications';
import { points, pointsRules } from './points';
import { preferences } from './preferences';
import { recipes } from './recipes';
import { tickets } from './tickets';
import { courier } from './courier';
import { social } from './social';
import { sale } from './sale';
import { management } from './management';
import { money } from './money';
import { operations } from './operations';
import { warehouse } from './warehouse';
import { whatsapp } from './whatsapp';
import { channels } from './channels';
import { bearerAuth, type V1Env } from './auth';

/**
 * Uçlar varsayılan olarak Bearer'ın arkasındadır; açık uçlar `bearerAuth`tan önce bağlanır, çünkü Hono zinciri kayıt sırasıyla
 * kurulur ve buradaki sıra güvenlik kararının kendisidir. Katalog açıktır, çünkü ürünü görmek için hesap açtırmak müşteriyi kapıda
 * çevirir.
 */
export const v1 = new Hono<V1Env>();

v1.route('/auth/otp', authOtp);
// Geliştirme giriş kapısı — YALNIZ yerel süreçte zincire girer; üretim derlemesi bu route'u
// hiç mount etmez (`dev-login.ts` künyesi: mail turunu atlayan GERÇEK oturum, sahte kimlik değil).
if (process.env.NODE_ENV !== 'production') v1.route('/auth', devLogin);
v1.route('/', catalog);
// Vitrin katalogla aynı sebeple açık; Bearer varsa yalnız fiyatı kişiselleştirir.
v1.route('/', home);
// Paket detayı vitrinin açtığı sayfa olduğu için açık; paket tek fiyatlı, Bearer'ın kişiselleştireceği bir şey yok.
v1.route('/', packages);
// Tarif detayı da vitrinden açılır; Bearer yalnız malzeme satırlarının fiyatını kişiselleştirir.
v1.route('/', recipes);
// Geri bildirim de açık kümededir ama gerekçesi katalogunkinden FARKLI: token kimliğin
// KENDİSİDİR (davet linki girişsiz açılır — `feedback.ts` künyesi). Bearer istemek daveti kırardı.
v1.route('/', feedback);
// Yer çözümü onboarding'in GİRİŞ sorusudur — hesap açılmadan sorulur (`places.ts` künyesi).
v1.route('/', places);
// İlan edilen teslimat tutarları: posta kodu adımı ve yasal sayfa hesapsız açılıyor, sayıyı
// sözlükte dondurmamak için uç de açık (`delivery-terms.ts` künyesi).
v1.route('/', deliveryTerms);
// Keşif turu ziyaretçiye açık ve kaydırmayı kimliksiz de yazar; Bearer varsa yalnız oylanmış kartlar elenir ve puan doğar.
v1.route('/', discover);
// Misafir sepetinin görünümü açık, çünkü satırları cihaz taşısa da parası sunucunun kararıdır; uç hiçbir şey yazmaz, bu yüzden
// girişli kullanıcının `/me/cart`ı buradan gölgelenemez.
v1.route('/cart', cartView);
// B2B'nin okuma yarısı açık: aday künyesini görmeden hesap açmaya ikna olmaz. Başvurunun yazımı Bearer'ın arkasında.
v1.route('/', b2bPublic);
// Davet karşılaması açık, çünkü bağlantıyı açan kişi henüz müşterimiz değil; jeton varsa yalnız cevabı zenginleştirir.
v1.route('/', invite);
// Puan programının kuralları açık, çünkü onboarding onları hesabı olmayan kişiye anlatır; kimliğe bağlı olan her şey `/me/points`te.
v1.route('/', pointsRules);

v1.use('*', bearerAuth);

// Google dönüşünün kayıt kapısı oturum ister, çünkü sorduğu şey "bu hesap kayıtlı mıydı"dır.
v1.route('/auth/oauth', authOauth);

/**
 * Profil yoksa 404 döner, çünkü auth kaydı olup profil satırı olmaması bir arızadır ve boş profil uydurmak onu görünmez kılar.
 */
v1.get('/me', async (c) => {
  const user = c.get('authUser');
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  // `parse` süzgeçtir: pick'te olmayan alan (kredi limiti, personel kapsamı) zarfa sızamaz.
  return ok(c, MeSchema.parse(profile));
});

/**
 * Ad ve telefonun kuralı web hesap formuyla ortak kapıda. Numara çakışması reddedilmez, çünkü bu kolon kimlik değil iletişim
 * numarasıdır ve iki müşterinin aynı numarayı taşıması meşrudur.
 */
v1.patch('/me', async (c) => {
  const body = MeUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const user = c.get('authUser');
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(user.id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  const outcome = await updateCustomerProfile(db, { profileId: profile.id, ...body.data });
  if (outcome.status !== 'ok') return fail(c, outcome.status, 400);
  return ok(c, MeSchema.parse(outcome.profile));
});

/**
 * Silinecek kimlik gövdeden alınmaz, jetondan çözülür: `anonymize` verilen kimliği sorgusuz siler ve parametre kabul etmek
 * başkasının hesabını silmeye kapı açardı. Cihazdaki oturum burada silinmez, çıkış istemcinin işidir.
 */
v1.delete('/me', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  await new UserProfileService(db).anonymize(profile.id);
  return ok(c, true);
});

v1.route('/me/addresses', addresses);

v1.route('/me/orders', orders);

// Sepet gövdesi fiyat taşımaz: istemcinin yazabildiği tutar siparişin parasını belirleyemez.
v1.route('/me/cart', cart);

// Sepet girişsiz dolar ama sipariş adres, geçmiş ve ödeme yetkisiyle hesaba bağlıdır.
v1.route('/me/checkout', checkout);

v1.route('/me/preferences', preferences);
v1.route('/me/whatsapp', whatsapp);
v1.route('/me/channels', channels);

// Ödeme tutarı gövdeden alınmaz, siparişten çözülür; niyet web'inkiyle aynı künyeyi taşır ki onayı aynı webhook işlesin.
v1.route('/payments', payments);

v1.route('/me/points', points);

v1.route('/me/notifications', notifications);
// Cihaz jetonu URL'e yazılmaz, çünkü erişim loglarına düşer; bu yüzden iki uç da POST.
v1.route('/me/push-devices', pushDevices);

// Davetin hesaba bağlanması karşılamanın aksine kapalı: "bu daveti benim hesabıma yaz"ın oturumsuz hâli yoktur.
v1.route('/me/invite', inviteClaim);

// Keşif turunun hesaba bağlanması da aynı sebeple kapalı; kimlik gövdeden değil bağlamdan çözülür.
v1.route('/me/discover', discoverClaim);

v1.route('/me/tickets', tickets);

// B2B başvurusu ayrı bir varlık değil müşteri kaydının bir hâlidir, bu yüzden sahibi olmak zorunda.
v1.route('/me/b2b', b2b);

// "Gelince haber ver" kapalı: misafir kayıttan önce çekmecede hesabını doğrular ve e-posta profilden çözülür.
v1.route('/me/stock-notices', stockNotices);

/**
 * Personel bölümlerinin rol kapısı rota dosyalarının içinde. Önekler burada verilir ki uçların adresi tek yerden okunsun.
 */
v1.route('/courier', courier);
v1.route('/warehouse', warehouse);
// Yerinde satış ayrı önek, çünkü rol kümesinde kurye de var; kurye ise hazırlık kuyruğunu ve mal kabulü görmez.
v1.route('/sale', sale);
// Sosyal gelen kutusu yalnız yöneticinin, çünkü yazışma içeriği kişisel veridir.
v1.route('/social', social);
v1.route('/management', management);
v1.route('/money', money);
// Operasyon kabuğu bölümlerin üstünde; operasyon bölümü açan her rol girer.
v1.route('/operations', operations);
