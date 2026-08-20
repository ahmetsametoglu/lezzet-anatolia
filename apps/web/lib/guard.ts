import 'server-only';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { canAccessWarehouse, isStaff, warehouseScope, type WarehouseScope } from '@lezzet/domain-core';
import type { UserProfile, UserRole } from '@lezzet/types';
import { createClient } from './supabase/server';

// Tek yetki kapısı (DOMAIN §2). Oturum çerezden okunur; rol RLS deny-by-default olduğu için
// service-role ile `user_profiles.roles`'dan okunur. Guard'lar hata FIRLATIR; API/action için {ok}
// saran yardımcı ayrıdır — böylece izin kuralı tek yerde yaşar.

export type AuthErrorCode = 'auth_required' | 'forbidden';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthUser {
  /** **Auth kimliği** (`auth.users.id`) — oturumun sahibi. Profil-FK'li bir kolona YAZILMAZ. */
  id: string;
  email: string | null;
}

/**
 * Personel guard'larının dönüşü: auth kimliğinin **yanında** profil kimliği (04.11).
 *
 * ── NEDEN İKİSİ BİRDEN ───────────────────────────────────────────────────────
 * `user_profiles`'a FK veren her kolon (`order.courier_id`, `order_status_log.actor_id`,
 * `settings.updated_by`, `product_feedback.moderated_by`) **profil** kimliğini bekler; oturumun
 * kimliği ise `auth.users`'ındır ve profilde `auth_user_id` sütununda AYRI durur. İkisi farklı
 * uzaylardır ve biri ötekinin yerine yazılırsa **hiçbir yerde hata olmaz** — yalnız sorgu boş döner.
 *
 * ── NEDEN UZUN SÜRE GÖRÜNMEDİ (04.11) ────────────────────────────────────────
 * O gün yerelde bir auth bypass'ı vardı ve verdiği tek kimlik bir PROFİL kimliğiydi — yani
 * geliştirmede `user.id` ile `user.profileId` tesadüfen çakışıktı. Gerçek girişte ayrışırlar.
 * Ölçülen sonuç: kurye günü listesi **sessizce boş** dönüyordu — hata yok, yanlış veri yok, yalnız
 * hiçlik. Ne `typecheck` ne `lint` görebilirdi: iki alan da `string`.
 *
 * Bypass 19.08'de tamamen söküldü (aşağıdaki künye) — bugün yerelde de gerçek oturum var, yani bu
 * sınıf hata artık ilk denemede FK ihlaliyle patlar. Ayrım yine de ADLI kalıyor: nöbeti tutan şey
 * ismin kendisi.
 *
 * Bu yüzden alan ADLI: çağıran hangisini geçtiğini okurken görür (`user.id` mi `user.profileId` mi),
 * ayrı bir çözümleyici fonksiyona güvenmek zorunda kalmaz.
 */
export interface StaffUser extends AuthUser {
  /** **Profil kimliği** (`user_profiles.id`) — FK'li kolonlara yazılacak olan. */
  profileId: string;
}

/*
  ── DEV AUTH BYPASS SÖKÜLDÜ (kullanıcı kararı 19.08) ────────────────────────────────────────────
  Burada bir bypass vardı: `NODE_ENV !== 'production'` iken personel guard'larını kısa devre yapıp
  sahte bir admin döndürüyordu (`DEV_AUTH_BYPASS`, yerelde varsayılan AÇIK). Amacı meşruydu — admin
  girişi olmadan operasyon ekranlarına bakabilmek.

  ── NEDEN GİTTİ ────────────────────────────────────────────────────────────────
  Guard yalan söylüyordu ve yalanın bedeli tam da guard'ın koruduğu şeydi. ÖLÇÜLDÜ (19.08):
  oturum HİÇ olmadan `localhost:3000/operations` → **200**; aynı istek production sunucusunda
  (`prod:web:start`, 3001) → **307 → /tr/giris**. Yani yerelde herkes personeldi ve iki sunucu iki
  farklı yetki gerçekliği gösteriyordu.

  Somut kayıplar:
    · Müşteri oturumuyla operasyona girilebiliyordu — layout'un dürüst cevabı `NotStaffScreen`
      ("bu alan personel içindir") yerelde HİÇ görülemiyordu, yani o dal denenmemiş koddu.
    · Sahte kimliğin profili okunamadığı için layout rolleri `['admin']`'e düşürüyordu; yetki
      hatası ekranda yetki GİBİ görünüyordu.
    · `e2e/README` rol yönlendirmesi senaryosunu bu yüzden kapsam dışı bırakmıştı ("dev bypass TEK
      kimlik verir").
    · Kendi ürettiği iki arıza (04.11 iki-kimlik karışması, 07.08 boş kurye ekranları) yine
      bypass'a eklenen makineyle yamanmıştı — `DEV_AUTH_BYPASS_USER_ID` ve layout'un rol düşüşü.

  Mobil şerit aynı bypass'ı bilerek REDDETMİŞTİ ve gerekçesini ölçmüştü (`apps/mobile/src/lib/auth/
  dev-login.ts`, 11.08: müşteri jetonuyla `/courier/day` → 403, kurye jetonuyla → 200) —
  *"bypass'ı mobile taşımak, dev'de yakalanabilen yetki hatalarını görünmez kılardı."*

  ── YERİNE NE VAR ──────────────────────────────────────────────────────────────
  `/auth/dev-login` (15.08). Mail turunu atlar ama oturum GERÇEKTİR: magic-link jetonu üretilir ve
  SSR istemcisinde tüketilir, çerez normal girişin yazdığının aynısıdır. Guard'a hiç dokunmaz —
  ekranlar production'da nasıl davranacaksa öyle davranır. Bypass'ın karşıladığı ihtiyaç bu kapıyla
  ZATEN karşılanıyordu; ikisini birden tutmak yalnız guard'ı yalancı kılıyordu.

  E2E de artık oradan giriyor (`e2e/setup/operations-auth.setup.ts` → `storageState`).
*/

/** Oturumdaki kullanıcı (yoksa null). */
export async function getSessionUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/**
 * Oturumdaki kişinin **müşteri kimliği** (`user_profiles.id`); oturum ya da profil yoksa null.
 *
 * **Auth kimliği ≠ müşteri kimliği.** Profil satırını auth trigger'ı açar ve kendi `id`'sini üretir;
 * auth kullanıcısının kimliği `auth_user_id` sütununda AYRI durur. `user_profiles`'a FK veren her
 * tablo (`cart`, `order`, `address`, `zone_notice`) profil kimliğini bekler — oraya auth kimliği
 * yazmak FK ihlalidir.
 *
 * Bu dönüşümün tek yerde durması bu yüzden şart: yerel bir kopya olarak yazıldığında üç ayrı çağrı
 * yeri (sepet, boş sepet önerisi, bölge haberi) çeviriyi hiç yapmadı ve giriş yapan müşterinin
 * sepeti **sessizce kayboldu** (28.07). Rol soran guard'lar tersine auth kimliğiyle çalışır
 * (`isStaff`/`hasRole` içeride `auth_user_id`'den arar) — ikisi karıştırılmamalı.
 */
export async function currentCustomerId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return (await new UserProfileService(serviceDb()).findByAuthUserId(user.id))?.id ?? null;
}

/**
 * Oturumdaki müşterinin **ekranda gösterilecek künyesi** — ad ve e-posta. Yoksa null.
 *
 * `currentCustomerId`'den ayrı durur çünkü sorusu farklı: o "hangi satıra yazacağım", bu "kime
 * sesleneceğim". Sorgu aynı olduğu için maliyeti de aynı; ayrı olması çağıranın niyetini
 * okunur kılıyor. **Sırlar taşınmaz:** rol, taslak durumu, kredi limiti burada YOKTUR — bu künye
 * tarayıcıya iniyor.
 */
export interface CustomerIdentity {
  id: string;
  name: string;
  email: string | null;
}

export async function currentCustomer(): Promise<CustomerIdentity | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  return profile ? { id: profile.id, name: profile.name ?? '', email: profile.email ?? null } : null;
}

/** Girişli kullanıcı şart; değilse AuthError('auth_required'). */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('auth_required');
  return user;
}

/**
 * Personel guard'larının ortak gövdesi: oturum → profil → rol kararı → **iki kimlik birden**.
 *
 * Profil BURADA okunuyor ve dışarı veriliyor. Eskiden `isStaff`/`hasRole` çağrılıyordu; ikisi de
 * içeride aynı profili getirip yalnız `boolean` döndürüyordu — yani satır zaten okunuyordu, kimliği
 * atılıyordu. Bu yüzden profil kimliğini eklemek ek bir sorgu GETİRMEDİ; atılan bir değeri geri aldı.
 *
 * Rol kararı motorun (`domain-core/identity/roles`): guard yalnız satırı getirir ve sorar (STACK §4).
 */
async function staffProfile(allowed: (roles: readonly UserRole[]) => boolean): Promise<{ user: StaffUser; profile: UserProfile }> {
  const user = await requireAuth();
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(user.id);
  if (!profile || !allowed(profile.roles)) throw new AuthError('forbidden');
  return { user: { id: user.id, email: user.email, profileId: profile.id }, profile };
}

async function requireRole(role: UserRole): Promise<StaffUser> {
  return (await staffProfile((roles) => roles.includes(role))).user;
}

/**
 * Herhangi bir personel rolü şart (Operasyon yüzeyine giriş kapısı). Müşteri ↔ personel keskin
 * ayrımdır: müşteri rolü olan kişi buradan geçemez (DOMAIN §2).
 */
export async function requireStaff(): Promise<StaffUser> {
  return (await staffProfile(isStaff)).user;
}

/**
 * Personelin DEPO KAPSAMI (DOMAIN §17) — rolün ikinci ekseni: ne yapar × nerede yapar.
 *
 * `warehouseId` verilirse o depoya erişim de doğrulanır ve yetkisizse `forbidden` atar. Verilmezse
 * yalnız kapsam döner (ekran kendi seçicisini ona göre kurar).
 *
 * **Fail-closed:** kapsamsız depocu/kurye HİÇBİR depoyu göremez — boş kapsam "hepsi" değildir.
 * Karar motorda (`warehouseScope`), guard yalnız kimliği getirip motora sorar (STACK §4).
 */
export async function requireWarehouseScope(warehouseId?: string): Promise<{ user: StaffUser; scope: WarehouseScope }> {
  // Profil TEK kez okunuyor: eskiden `requireStaff` bir kez, burası ikinci kez okuyordu ve ikisi de
  // aynı satırdı. Kapsam kararı için zaten `roles`/`warehouseIds` gerekiyor — aynı satır ikisini de
  // taşıyor.
  const { user, profile } = await staffProfile(isStaff);

  const scope = warehouseScope(profile.roles, profile.warehouseIds);
  if (scope.kind === 'none') throw new AuthError('forbidden');
  if (warehouseId && !canAccessWarehouse(scope, warehouseId)) throw new AuthError('forbidden');
  return { user, scope };
}

/**
 * Verilen rollerden **en az biri** şart — "yönetici VEYA muhasebeci" gibi kapılar için.
 *
 * `requireRole`'u iki kez çağırmak yerine tek okuma: rol listesi bir kez getirilir ve ilk çağrının
 * `forbidden` fırlatması ikinciyi hiç çalıştırmazdı. Tek rollü kapılar için `requireAdmin` vb.
 * kısayolları durmaya devam eder.
 */
export async function requireAnyRole(roles: readonly UserRole[]): Promise<StaffUser> {
  return (await staffProfile((owned) => roles.some((r) => owned.includes(r)))).user;
}

export const requireAdmin = (): Promise<StaffUser> => requireRole('admin');
/** Yönetici ya da muhasebeci — para gözü (tedarikçi borcu, sipariş tahsilatı, hesaplar). */
export const requireFinance = (): Promise<StaffUser> => requireAnyRole(['admin', 'accounting']);
export const requireWarehouse = (): Promise<StaffUser> => requireRole('warehouse');
export const requireCourier = (): Promise<StaffUser> => requireRole('courier');
/** Muhasebe: para/muhasebe ekranları ve export. Bir kişi hem depo hem muhasebe olabilir. */
export const requireAccounting = (): Promise<StaffUser> => requireRole('accounting');

// ─── Sarıcı: Server Action / route handler için throw yerine {ok} döndürür ──────

/**
 * Guard'ın kimlik tipi KORUNUR (`T`): personel kapısından geçen çağıran `g.user.profileId`'yi
 * görebilsin diye. Jenerik olmasaydı dönüş `AuthUser`a daralır ve profil kimliği — tam da bu görevin
 * eklediği şey — çağrı yerinde kaybolurdu.
 */
export type GuardResult<T extends AuthUser = AuthUser> = { ok: true; user: T } | { ok: false; code: AuthErrorCode };

/**
 * Bir guard'ı çağırıp sonucu {ok} biçiminde döndürür — action'lar hatayı bilinçli
 * ele alır (kullanıcıya {error} döner), exception fırlatmaz.
 * Örn: `const g = await guarded(requireAdmin); if (!g.ok) return { error: g.code };`
 */
export async function guarded<T extends AuthUser>(guard: () => Promise<T>): Promise<GuardResult<T>> {
  try {
    const user = await guard();
    return { ok: true, user };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, code: err.code };
    throw err;
  }
}
