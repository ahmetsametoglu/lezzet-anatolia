import { Hono } from 'hono';
import { updateCustomerProfile } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { MeSchema, MeUpdateSchema } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { addresses } from './addresses';
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
import { notifications } from './notifications';
import { points, pointsRules } from './points';
import { preferences } from './preferences';
import { recipes } from './recipes';
import { tickets } from './tickets';
import { courier } from './courier';
import { social } from './social';
import { sale } from './sale';
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
// Geliştirme giriş kapısı — YALNIZ yerel süreçte zincire girer; üretim derlemesi bu route'u
// hiç mount etmez (`dev-login.ts` künyesi: mail turunu atlayan GERÇEK oturum, sahte kimlik değil).
if (process.env.NODE_ENV !== 'production') v1.route('/auth', devLogin);
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
// Geri bildirim de açık kümededir ama gerekçesi katalogunkinden FARKLI: token kimliğin
// KENDİSİDİR (davet linki girişsiz açılır — `feedback.ts` künyesi). Bearer istemek daveti kırardı.
v1.route('/', feedback);
// Yer çözümü onboarding'in GİRİŞ sorusudur — hesap açılmadan sorulur (`places.ts` künyesi).
v1.route('/', places);
// İlan edilen teslimat tutarları: posta kodu adımı ve yasal sayfa hesapsız açılıyor, sayıyı
// sözlükte dondurmamak için uç de açık (`delivery-terms.ts` künyesi).
v1.route('/', deliveryTerms);
// Keşif turu da açık kümededir (21.19) ve gerekçesi ÖLÇÜLMÜŞ bir web kararıdır: tur ziyaretçiye
// açıktır — `swipeAction` kimliği sunucuda çözer ve yoksa kaydırmayı KİMLİKSİZ yazar. Bearer varsa
// yalnız iki şey değişir: oylanmış kartlar destede elenir ve oy sahibine yazılıp puan doğar.
// Erişim değişmez, 401 hiçbir hâlde dönmez (`discover.ts` künyesi).
v1.route('/', discover);
// MİSAFİRİN SEPET GÖRÜNÜMÜ de açık kümededir (21.21) ve gerekçesi katalogunkiyle aynı soydan:
// sepet oturumsuz doldurulur (satırları cihaz taşır), ama o sepetin PARASI sunucunun kararıdır.
// Fiyatı/tükendiyi/asgari sepeti istemciye hesaplatmak, aynı sepetin misafirken bir, giriş yapınca
// başka bir tutar göstermesi demekti. Uç niyeti GÖVDEDEN alır ve hiçbir şey YAZMAZ — girişli
// kullanıcının sepeti buradan gölgelenemez, onunki `bearerAuth`ın arkasındaki `/me/cart`tır.
v1.route('/cart', cartView);
// B2B'nin OKUMA yarısı da açık kümededir (21.31): resmî kayıt sorgusu ve vergi numarası
// doğrulaması, aday daha hesap açmadan — form kimlik istemeden doldurulur ve künyesini görmeden
// kimse hesap açmaya ikna olmaz (webde de ziyaretçiye açık). Başvurunun YAZIMI Bearer'ın
// arkasında; maruziyet ve sınırı `b2b.ts` künyesinde.
v1.route('/', b2bPublic);
// Davet karşılaması da açık kümededir (21.43) ve gerekçesi geri bildirim davetininkiyle aynı
// soydan: bağlantıyı açan kişi HENÜZ MÜŞTERİMİZ DEĞİL — davetin bütün amacı o. Bearer istemek,
// hesap açsın diye çağırdığımız kişiden kapıda hesap istemek olurdu. Jeton VARSA yine de okunur
// (keşif turunun `optionalCustomerId` zinciri): kimlik yalnız cevabı zenginleştirir, kapıyı
// kapatmaz — kendi bağlantısını açan müşteri "bu senin bağlantın" cevabını alır.
v1.route('/', invite);
// Puan programının KURALLARI da açık kümededir (kullanıcı kararı 12.08): onboarding'in son adımı
// programı anlatıyor ve o ekranı gören kişi henüz misafir — hesabı yok. Taşınan şey kişisel değil
// PROGRAM: kaç puan ne eder, kupon eşiği kaç. Kimliğe bağlı ne varsa (bakiye, davet kodu, kupon)
// `bearerAuth`ın arkasındaki `/me/points`te kalıyor; ayrım künyesi `points.ts`te.
v1.route('/', pointsRules);

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
 * görünür döner: 400 (`name_required`/`phone_invalid`).
 *
 * **409 `phone_taken` KALKTI (04.10 · web şeridi):** dayandığı tekil indeks yok artık — bu kolon
 * iletişim numarası oldu, kimlik anahtarı `customer_phone`a taşındı. Aynı numarayı iki müşterinin
 * taşıması meşru; uç artık numarayı reddetmiyor. Ekrandaki cümlesi ölü metin (`docs/talep`).
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
 * **Hesabın silinmesi** (GDPR md. 17 · App Store 5.1.1(v)) — web hesap sayfasının
 * `deleteAccountAction`ının native karşılığı, AYNI motor kapısıyla (`UserProfileService.anonymize`
 * → `anonymize_customer` RPC). İkinci bir silme kuralı yazılMAZ: hangi tablonun silineceği,
 * hangisinin kimliksizleşeceği kararı 0037 migration'ının içinde tek yerde durur.
 *
 * **Kimlik gövdeden ALINMAZ, jetondan çözülür** — web eyleminin künyesindeki aynı kalkan:
 * `anonymize` verilen kimliği sorgusuz anonimleştirir, yani bir parametre kabul etmek "bu benim
 * hesabım mı" sorusunu burada doğru sormayı şart koşardı. Soruyu ortadan kaldırmanın tek güvenli
 * yolu parametreyi hiç almamak; silinecek hesap, oturumun kendisidir.
 *
 * **`DELETE /me`, `/me/delete` DEĞİL:** kaynak profildir ve yöntem zaten fiili söylüyor.
 *
 * **Cevap `true`, boş gövde değil:** istemcinin okuyacağı tek şey "oldu mu" — `anonymize` bir hata
 * fırlatırsa zarf `error` taşır ve ekran çekmeceyi AÇIK bırakır. Oturumun cihazdan silinmesi
 * istemcinin işi (`auth.users` satırı burada gidiyor ama cihazdaki jeton yerinde kalır) — web'de
 * ölçülmüş aynı tuzak, orada `signOutAction` ile kapatılmıştı.
 */
v1.delete('/me', async (c) => {
  const db = serviceDb();
  const profile = await new UserProfileService(db).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);

  await new UserProfileService(db).anonymize(profile.id);
  return ok(c, true);
});

// Adres uçları (21.15) — Bearer'ın ARKASINDA: adres müşterinin kendisidir, oturumsuz gezilmez.
// Kural ve gerekçeler `addresses.ts` künyesinde; kimlik çözümü orada tek middleware'de.
v1.route('/me/addresses', addresses);

// Tercih uçları (21.16) — Bearer'ın ARKASINDA: dil ve kampanya izni müşterinin kendisidir.
// Kural kapıda (`@lezzet/application` → `customer/preferences.ts`), damga politikası orada.
// Sipariş uçları (21.16) — Bearer'ın ARKASINDA: sipariş müşterinin kendisidir. Liste keyset
// sayfalı, detay REFERANS numarasıyla adreslenir; kurallar `@lezzet/application`ın müşteri
// sipariş kapısında (`order/customer-orders.ts`), kimlik çözümü `orders.ts`te tek middleware'de.
v1.route('/me/orders', orders);

// Sepet uçları (21.21) — Bearer'ın ARKASINDA: sunucu sepeti `customerId` anahtarlı, yani MİSAFİRİN
// sunucu sepeti YOKTUR ve olması da gerekmez (web de öyle: misafir satırları istemcide taşır).
// Gövde yalnız `{variantId, qty, stockId}` alır — ad/fiyat/tutar istemciden ASLA kabul edilmez;
// sepetin parası `getCartView` kuralında çözülür (`@lezzet/application`, terfi 09.08).
v1.route('/me/cart', cart);

// Checkout (21.22) — Bearer'ın ARKASINDA, katalogun aksine: sepet girişsiz DOLDURULUR ama sipariş
// müşterinin kendisidir (adres · sipariş geçmişi · ödeme yetkisi hesaba bağlı). Kural burada değil,
// `@lezzet/application`ın checkout anlık görüntüsünde — web checkout'u AYNI kapıyı çağırıyor.
v1.route('/me/checkout', checkout);

v1.route('/me/preferences', preferences);

// Ödeme uçları (21.x) — Bearer'ın ARKASINDA: ödeme müşterinin kendisidir. Tutar GÖVDEDEN
// alınmaz, siparişin `total_cents`inden sunucuda çözülür; niyetin künyesine web'in yazdığı
// `order_id` yazılır, yani onayı AYNI Stripe webhook'u işler (`payments.ts` künyesi).
v1.route('/payments', payments);

// Puan uçları (21.17) — Bearer'ın ARKASINDA: cüzdan müşterinin kendisidir. Kural ve B2B kısa
// devresi `points.ts` + `@lezzet/application/customer/points` künyesinde.
v1.route('/me/points', points);

// Bildirim akışı (14.13) — Bearer'ın ARKASINDA: akış kişinin kendisidir. Sahiplik süzgeci, rozet
// tanımı ve "akış ≠ gelen kutusu" kuralı `@lezzet/application/notification/read` künyesinde; web
// hesap zili (14.15) aynı kapıdan okuyacak — iki yüzey tek kural.
v1.route('/me/notifications', notifications);

// Davetin hesaba bağlanması (21.44 · 21.45) — Bearer'ın ARDINDA, karşılamanın aksine: "bu daveti
// BENİM hesabıma yaz" cümlesinin oturumsuz hâli yoktur (keşif talep kapısının aynı ayrımı). Cihaz
// her giriş yolundan sonra buraya uğrar (iki davet türü tek gövdede); siparişin komşu davetini
// açan uç da burada. Kurallar ortak kapılarda (`attachReferralOnLogin` · `acceptNeighborInvite`).
v1.route('/me/invite', inviteClaim);

// Keşif turunun hesaba bağlanması (21.19) — Bearer'ın ARKASINDA: "bu kaydırmaları BENİM hesabıma
// yaz" cümlesinin oturumsuz hâli yoktur. Kimlik bağlamdan çözülür, gövdeden ASLA; kural
// `@lezzet/application`ın keşif kapısında (`feedback/discover.ts`).
v1.route('/me/discover', discoverClaim);

// Talep uçları (21.18) — Bearer'ın ARKASINDA: talep müşterinin kendisidir. Durum makinesi ve
// bildirim tetikleri `@lezzet/application`ın talep kapısında (`ticket/{read,write}.ts`).
v1.route('/me/tickets', tickets);

// B2B başvurusunun YAZIMI ve DURUMU (21.31) — Bearer'ın ARKASINDA: başvuru ayrı bir varlık değil,
// müşteri kaydının bir hâli (DOMAIN §10), yani sahibi olmak zorunda. Kural
// `@lezzet/application/customer/b2b`de; okumaların açık yarısı yukarıda.
v1.route('/me/b2b', b2b);

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
// Yerinde satış (21.119) — AYRI önek çünkü AYRI rol kümesi: burada `courier` de var, depo
// yönlendiricisinde yok. Satan kişi malın yanında duran personeldir (DOMAIN §17) ve o kişi kimi
// zaman kuryedir; ama kurye hazırlık kuyruğunu ya da mal kabulü görmez.
v1.route('/sale', sale);
// Sosyal gelen kutusu (15.15 mobil ayağı) — yalnız `admin` (rota dosyasının kendi kapısı):
// yazışma içeriği kişisel veridir, kurye/depo rolleri görmez (`social.ts` künyesi).
v1.route('/social', social);
