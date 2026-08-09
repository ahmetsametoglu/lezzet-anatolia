import type { Context, MiddlewareHandler, Next } from 'hono';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AppEnv } from '../../context';
import { anonDb, serviceDb, UserProfileService } from '@lezzet/database';
import type { UserProfile, UserRole } from '@lezzet/types';
import { fail } from '../../lib/respond';

/**
 * `/api/v1` bağlam tipi — kök `AppEnv`'den TÜRER (reqId taşımaya devam eder) ve doğrulanmış
 * kullanıcıyı ekler. Tip burada tanımlı olmak zorunda: Hono `c.set/get`'i tipe bağlıyor, yani
 * `authUser`'ı koymayı unutan bir uç derlenmez — sözleşmenin yeri kimliği üreten dosyadır
 * (apps/backend `request-log.ts` ile aynı gerekçe).
 */
export interface V1Env {
  Variables: AppEnv['Variables'] & { authUser: User };
}

/**
 * `Authorization: Bearer <jwt>` başlığından ham token — **ayrıştırma tek yerde**.
 *
 * İki çağıranı var ve ikisinin KARARI farklı: `bearerAuth` token yoksa kapıyı KAPATIR (401),
 * `optionalCustomerId` ziyaretçiye düşer (200). Ayrıştırmanın kendisi ise aynı ve iki kez
 * yazılsaydı biri gün gelip `Bearer` önekini ya da boşluk kırpmayı ötekinden farklı ele alırdı.
 *
 * **Dışa VERİLMEZ** (21.19): iki çağıranı da bu dosyada — açık uçların kimlik zinciri artık
 * `optionalCustomerId`de yaşıyor ve dışarısı ham token'la değil, çözülmüş kimlikle konuşur. Dışa
 * açık bir ayrıştırıcı, kimlik zincirinin bir gün başka bir dosyada yeniden kurulmasına davetiye
 * olurdu (`knip` de ölü ihracat olarak yakalıyordu).
 *
 * Hono başlığı imzasız verdiği için parametre ham dize: bağlam tipine (`AppEnv`/`V1Env`) bağlanmak
 * bu yardımcıyı iki ayrı Hono kuşağına da bağlardı.
 */
function bearerTokenOf(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Bearer doğrulaması — web'in çerez guard'ının API karşılığı (02-mimari "duplikasyon sayılmayan"
 * taşıma katmanı adaptörü): cihazdaki supabase-js oturumunun access token'ı `Authorization:
 * Bearer <jwt>` ile gelir, Supabase auth sunucusunda doğrulanır (`auth.getUser(token)` — anon
 * istemci yeter, en az yetki).
 *
 * Geçersiz/eksik token AYNI cevabı alır (`401 unauthorized`): "token yok" ile "token çöp" ayrımı
 * çağırana bir şey kazandırmaz, saldırgana kazandırır. Doğrulanan kullanıcı bağlama konur;
 * uçlar kimliği İSTEKTEN değil bağlamdan okur.
 */
export async function bearerAuth(c: Context<V1Env>, next: Next): Promise<Response | void> {
  const token = bearerTokenOf(c.req.header('authorization'));
  if (!token) return fail(c, 'unauthorized', 401);

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return fail(c, 'unauthorized', 401);

  c.set('authUser', data.user);
  await next();
}

/**
 * **İSTEĞE BAĞLI KİMLİK** — açık uçların (katalog · vitrin · tarif · keşif) ortak zinciri:
 * `Bearer` → auth kullanıcısı → **müşteri profili**. Üç yol da kapıyı KAPATMAZ, `null` döner:
 *   · başlık yok            → ziyaretçi (webde çerezsiz gezinme)
 *   · başlık var ama geçersiz/süresi dolmuş → ziyaretçi (webde süresi dolmuş oturum çerezi:
 *     `getSessionUser` null döner, `currentCustomerId` null)
 *   · geçerli token ama profil satırı yok (trigger boşluğu / silinmiş kayıt) → ziyaretçi
 *
 * Geçersiz token'a 401 vermek açık uçları kapatırdı: uygulamanın haftalarca açılmadığı bir cihazda
 * token süresi dolmuş olur ve müşteri vitrini değil bir hata ekranını görürdü. Kayıt da düşülmez —
 * süresi dolmuş token bir arıza değil, oturumun normal sonu.
 *
 * **Auth kimliği ≠ müşteri kimliği** (ölçüldü: `apps/web/lib/guard.ts:70-74` — `currentCustomerId`
 * oturumdaki auth kullanıcısını `findByAuthUserId` ile profil satırına çevirir; `user_profiles.id`
 * ile `auth.users.id` AYRI kolonlardır). Zinciri atlayıp auth kimliğini bir kapıya vermek hiçbir
 * satırla eşleşmez ve **hata da vermez** — sessizce ziyaretçi muamelesi görür.
 *
 * **Burada, çünkü iki KARAR de aynı zinciri istiyor ve ikisi ayrışamaz:** fiyatı kişiselleştiren
 * katalog (`readViewer` → `pricingViewerOf`) ve oyu sahibine yazan keşif (`discover.ts`). İkinci kez
 * yazılsaydı biri gün gelip profilsiz kullanıcıyı ya da geçersiz token'ı ötekinden farklı ele alırdı
 * (`bearerTokenOf`un ayrıştırmayı tek yere toplama gerekçesinin aynısı — CLAUDE §1).
 *
 * @param db service-role istemci — çağıran enjekte eder (`serviceDb()`); token doğrulaması ise en az
 * yetkiyle, anon istemciyle yapılır.
 */
export async function optionalCustomerId(db: SupabaseClient, authorization: string | undefined): Promise<string | null> {
  const token = bearerTokenOf(authorization);
  if (!token) return null;

  const { data, error } = await anonDb().auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await new UserProfileService(db).findByAuthUserId(data.user.id);
  return profile?.id ?? null;
}

/**
 * Personel bölümlerinin bağlam tipi — doğrulanmış kullanıcının PROFİL satırını taşır.
 *
 * `authUser` yerine profil, çünkü ikisi farklı uuid'lerdir ve kapıların istediği hep profildir:
 * `order.courier_id` `references public.user_profiles (id)` (`0012_order.sql:103`), `actor_id` de
 * öyle. Auth kimliğini doğrudan bir kapıya vermek hiçbir satırla eşleşmez ve **hata da vermez** —
 * boş liste geçerli bir cevaptır (`apps/web/lib/guard.ts`: "auth kimliği ≠ müşteri kimliği").
 */
export interface StaffEnv {
  Variables: V1Env['Variables'] & { staff: UserProfile };
}

/**
 * **Rol kapısı** — `bearerAuth`ın ARDINDAN koşar ve iki işi birden yapar: yetkiyi sorar, kimliği çözer.
 *
 * ── NEDEN BURADA (21.11'de taşındı) ──────────────────────────────────────────
 * 21.10'da `courier.ts`in içinde doğmuştu ve künyesinde şu söz yazılıydı: *"İkinci tüketicisi
 * çıktığında taşınır: depo bölümü (21.11) aynı şekle ihtiyaç duyacak."* O gün geldi — depo uçları
 * aynı zinciri istiyor (auth kullanıcısı → `findByAuthUserId` → profil → rol süzgeci) ve ikinci kez
 * yazılsaydı biri gün gelip profilsiz kullanıcıyı ya da çok-rollü kişiyi ötekinden farklı ele alırdı.
 *
 * ── TEK OKUMA, İKİ CEVAP ────────────────────────────────────────────────────
 * Rol de personel kimliği de AYNI profil satırındadır (`roles` dizisi + `id` + `warehouseIds`).
 * `hasRole` çağırıp sonra ayrıca profili okumak aynı satırı iki kez getirirdi.
 *
 * ── ROLSÜZ İLE PROFİLSİZ AYNI CEVABI ALIR ───────────────────────────────────
 * `403 forbidden` — `bearerAuth`ın "token yok ile token çöp aynı cevabı alır" kararıyla aynı
 * gerekçe: ayrım çağırana bir şey kazandırmaz. Profil satırının hiç olmaması (trigger boşluğu) bir
 * altyapı arızasıdır ve `/me` onu 404 ile ayrıca söylüyor; bölüm kapısının cevabı ise her iki hâlde
 * de aynıdır: bu kapı sana kapalı.
 *
 * ── `admin` HER LİSTEDE, AMA EK KAPI AÇMAZ ──────────────────────────────────
 * `roles` bir DİZİDİR; küçük ekipte aynı kişi hem yönetici hem kuryedir. Yönetici rolü kapıyı açar,
 * kimliği DEĞİŞTİRMEZ: kurye kapıları yine yalnız `courier_id` o kişiye eşit siparişleri döndürür.
 * (Depoda ek bir serbestlik var ve o kapsam kararıdır, rol kararı değil — `warehouse.ts` künyesi.)
 */
export function requireStaffRole(...roles: readonly UserRole[]): MiddlewareHandler<StaffEnv> {
  return async (c, next) => {
    const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
    if (!profile) return fail(c, 'forbidden', 403);
    if (!roles.some((role) => profile.roles.includes(role))) return fail(c, 'forbidden', 403);

    c.set('staff', profile);
    await next();
  };
}
