import 'server-only';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { canAccessWarehouse, isStaff, warehouseScope, type WarehouseScope } from '@lezzet/domain-core';
import { DEV_ADMIN_PROFILE_ID, DEV_BYPASS_AUTH_ID, type UserProfile, type UserRole } from '@lezzet/types';
import { createClient } from './supabase/server';
import { logger } from '@lezzet/observability';

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
 * ── NEDEN BUGÜNE KADAR GÖRÜNMEDİ ─────────────────────────────────────────────
 * Dev bypass'ta `DEV_BYPASS_USER.id` zaten bir PROFİL kimliğidir (seed aynı id ile profil açıyor),
 * yani geliştirmede iki kimlik tesadüfen çakışık. Gerçek girişte ayrışırlar. Ölçülen sonuç: kurye
 * günü listesi **sessizce boş** dönüyordu — hata yok, yanlış veri yok, yalnız hiçlik. Ne `typecheck`
 * ne `lint` görebilirdi: iki alan da `string`.
 *
 * Bu yüzden alan ADLI: çağıran hangisini geçtiğini okurken görür (`user.id` mi `user.profileId` mi),
 * ayrı bir çözümleyici fonksiyona güvenmek zorunda kalmaz.
 */
export interface StaffUser extends AuthUser {
  /** **Profil kimliği** (`user_profiles.id`) — FK'li kolonlara yazılacak olan. */
  profileId: string;
}

// ─── Dev-only auth bypass ──────────────────────────────────────────────────────
// Operasyon guard'larını (requireStaff/requireRole) atlayıp sahte admin enjekte eder — böylece
// geliştirmede admin girişi olmadan operasyon ekranları test edilebilir. GÜVENLİK: yalnız
// NODE_ENV !== 'production' iken çalışır; production build'de env ne olursa olsun ASLA aktif olmaz.
// Dev'de VARSAYILAN AÇIK; gerçek auth akışını dev'de test etmek için DEV_AUTH_BYPASS=false.
// Kapsam dar: yalnız personel kapıları — müşteri oturum/login akışına (getSessionUser) dokunmaz.
//
// Kimlik UYDURMA DEĞİL: seed aynı id ile gerçek bir admin profili açar (`DEV_ADMIN_PROFILE_ID`).
// Gerekli, çünkü `actor_id` gibi alanlar `user_profiles`'a FK'lidir — profilsiz sahte bir kullanıcı
// ilk durum geçişinde FK ihlali verirdi. Seed atılmamışsa aktör yazan ekranlar bu yüzden düşer.
//
// ── KİMLİK SEÇİLEBİLİR: `DEV_AUTH_BYPASS_USER_ID` (07.08, operasyon şeridinin talebi) ──────────
// Bypass her zaman ADMİN kimliği veriyordu ve bunun görünmeyen bir bedeli vardı: kurye ekranları
// hiçbir ajan tarafından DOLU hâliyle görülemiyordu. `listCourierDay(courierId)` kimliği zorunlu
// tutuyor (ve tutmalı — o imza bir güvenlik sınırı), dolayısıyla admin kimliğiyle bakan her koşu
// boş bir gün görüyordu. Ekranlar boş değildi, GÖREN yoktu — dört ekran (11.1 · 11.2 · 11.6) yalnız
// erişimsiz hâliyle doğrulanabiliyordu.
//
// **Güvenlik sınırı DEĞİŞMEDİ:** bypass zaten yalnız `NODE_ENV !== 'production'` iken çalışıyor,
// yani üretimde bu env okunsa da hiçbir şey yapmaz. Değişen tek şey, dev'de hangi profille
// bakılacağı.
//
// Verilen kimliğin GERÇEK bir profil olması gerekir (aynı gerekçe: `actor_id` FK'li). Doğrulamayı
// burada yapmıyoruz — guard'ın sıcak yoluna her istekte bir sorgu koymak, yalnız dev'de işe yarayan
// bir kolaylık için ödenecek yanlış bedel. Yanlış kimlik verilirse ekran ilk aktör yazımında düşer
// ve sebebi bellidir.
// ── İKİ KİMLİK BYPASS'TA DA AYRI (04.11) ───────────────────────────────────────────────────────
// Eskiden bypass tek bir id veriyordu ve o id bir PROFİL kimliğiydi — yani dev'de `user.id` ile
// `user.profileId` tesadüfen aynıydı. Profil-FK'li bir kolona auth kimliği yazan her kod dev'de
// çalışıyor, gerçek girişte **sessizce boş dönüyordu**: hata yok, yanlış veri yok, yalnız hiçlik.
//
// Artık ayrılar ve bu bir NÖBETTİR: `user.id`'yi profil kolonuna yazan bir yol dev'de ilk denemede
// FK ihlaliyle patlar. Ne `typecheck` ne `lint` bunu görebilir (iki alan da `string`, kural dil
// değil proje disiplini) — nöbeti veri tutuyor.
//
// `DEV_AUTH_BYPASS_USER_ID` bir PROFİL kimliğidir (07.08: kurye ekranlarını dolu görebilmek için),
// o yüzden `profileId`ye gider. Auth tarafı sabit ve karşılığı olan bir `auth.users` satırı yok —
// bypass zaten auth'u atlıyor.
const DEV_BYPASS_USER: StaffUser = {
  id: DEV_BYPASS_AUTH_ID,
  profileId: process.env.DEV_AUTH_BYPASS_USER_ID || DEV_ADMIN_PROFILE_ID,
  email: 'dev-admin@lezzet.local',
};

let bypassWarned = false;
function devBypassActive(): boolean {
  const active = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS !== 'false';
  if (active && !bypassWarned) {
    bypassWarned = true;
    logger.warn({ context: 'guard' }, 'DEV auth bypass AKTİF — operasyon guard atlanıyor (kapatmak için DEV_AUTH_BYPASS=false)');
  }
  return active;
}

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
  if (devBypassActive()) return DEV_BYPASS_USER;
  return (await staffProfile((roles) => roles.includes(role))).user;
}

/**
 * Herhangi bir personel rolü şart (Operasyon yüzeyine giriş kapısı). Müşteri ↔ personel keskin
 * ayrımdır: müşteri rolü olan kişi buradan geçemez (DOMAIN §2).
 */
export async function requireStaff(): Promise<StaffUser> {
  if (devBypassActive()) return DEV_BYPASS_USER;
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
  if (devBypassActive()) return { user: DEV_BYPASS_USER, scope: { kind: 'all' } };

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
  if (devBypassActive()) return DEV_BYPASS_USER;
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
